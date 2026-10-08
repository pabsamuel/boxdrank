// The gun.
//
// Design decision worth stating up front: all of the aiming maths runs *here*,
// on the phone, and only normalised (x, y) crosses the network. The phone
// already has the pose at frame rate; shipping raw poses to the display would
// add a hop before we could even compute a crosshair, and would make the
// display's frame rate part of the aiming loop.

import { Net } from '../../shared/net.js';
import {
  calibrate6dof, aimToScreen, calibrateRotation, rotationAimToScreen,
  OneEuro, clamp01, screenMetricsFromDiagonal, DEFAULT_CALIB_RECT,
} from '../../shared/math.js';
import { PoseSource, TRACKING } from './pose.js';
import { Trace } from './trace.js';
import { RecoilTrigger, AimHistory } from './gesture.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const room = (params.get('room') || '').toUpperCase();

const ui = {
  start: $('startScreen'), gun: $('gunScreen'), caps: $('caps'),
  startBtn: $('startBtn'), fallbackBtn: $('startFallbackBtn'), hint: $('startHint'),
  state: $('stateLabel'), track: $('trackPill'), instruction: $('instruction'),
  trigger: $('trigger'), triggerLabel: $('triggerLabel'),
  recal: $('recalBtn'), reload: $('reloadBtn'), diagBtn: $('diagBtn'), quit: $('quitBtn'),
  gestureBtn: $('gestureBtn'),
  diag: $('diag'),
};

$('roomCode').textContent = room || '----';

/* ------------------------------------------------------------------ state */

const pose = new PoseSource();
const net = new Net({ role: 'phone', room, name: 'gun' });
const trace = new Trace();
const recoil = new RecoilTrigger();
const aimHistory = new AimHistory();

const app = {
  screen: { widthM: 1.22, heightM: 0.685, aspectW: 16, aspectH: 9, diagInches: 55 },
  calibPoints: 4,
  calibRect: DEFAULT_CALIB_RECT,
  model: null,
  rotModel: null,
  useRotationOnly: false,     // A/B switch, driven from the display's debug panel
  smoothing: true,
  filterX: new OneEuro(),
  filterY: new OneEuro(),
  seq: 0,
  lastAim: null,
  phase: 'idle',              // idle | calibrating | live
  calib: { index: 0, rays: [], labels: [], busy: false },
  ammo: Infinity,
  shots: 0,
  zero: { x: 0, y: 0 },        // re-zero correction, in normalised screen units
  tracking: TRACKING.NONE,
  trackingLosses: 0,
  calibAttempts: 0,
  gestureFire: false,      // recoil-flick trigger, default on where there is no AR
  sentAim: 0,
  lastSentAt: 0,
};

const LABELS = { 0: 'TOP LEFT', 1: 'TOP RIGHT', 2: 'BOTTOM RIGHT', 3: 'BOTTOM LEFT' };

/* ------------------------------------------------------------ capabilities */

const caps = await PoseSource.capabilities();
ui.caps.innerHTML = [
  row('Secure context (HTTPS)', caps.secure),
  row('WebXR available', caps.webxr),
  row('AR / 6DoF tracking', caps.immersiveAr),
  row('Motion sensors', caps.deviceOrientation),
].join('');

function row(label, ok) {
  return `<div>${label}: <span class="${ok ? 'ok' : 'no'}">${ok ? 'yes' : 'no'}</span></div>`;
}

// iOS has no WebXR at all: Safari does not implement immersive-ar, and no
// iOS browser can, because they all use WebKit. Saying "install Google Play
// Services for AR" to an iPhone owner is worse than saying nothing.
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

if (!caps.immersiveAr) {
  ui.startBtn.classList.add('hidden');
  ui.fallbackBtn.classList.remove('hidden');
  if (!caps.secure) {
    ui.hint.innerHTML = 'Open this page over <b>https://</b> — motion tracking refuses to run otherwise.';
  } else if (isIOS) {
    ui.hint.innerHTML =
      '<b>iPhone cannot do the real light-gun mode.</b> Safari has no WebXR, and every ' +
      'iOS browser is Safari underneath, so there is no camera tracking available to a web page.<br><br>' +
      'Limited mode below uses only the gyroscope and compass: it will work, but it drifts, ' +
      'and you will have to recalibrate. It is the comparison case, not the product.<br><br>' +
      'The real test needs an <b>Android phone with Google Play Services for AR</b>.';
  } else {
    ui.hint.innerHTML =
      'This phone cannot do AR tracking. On Android that usually means ' +
      '<b>Google Play Services for AR</b> is missing, or the browser is not Chrome.<br><br>' +
      'Limited mode uses the compass and gyro only — it drifts.';
  }
} else {
  ui.fallbackBtn.classList.add('hidden');
}

/* -------------------------------------------------------------- networking */

net.on('open', () => setState('CONNECTED'));
net.on('close', () => setState('RECONNECTING'));
net.connect().startPinging(1000);

net.on('config', (m) => {
  if (m.screen) app.screen = { ...app.screen, ...m.screen };
  if (typeof m.calibPoints === 'number') app.calibPoints = m.calibPoints;
  if (m.calibRect) app.calibRect = m.calibRect;
  if (typeof m.smoothing === 'boolean') app.smoothing = m.smoothing;
  if (typeof m.rotationOnly === 'boolean') app.useRotationOnly = m.rotationOnly;
  if (m.filter) {
    app.filterX = new OneEuro(m.filter);
    app.filterY = new OneEuro(m.filter);
  }
  if (m.screen && m.screen.diagInches) {
    const { widthM, heightM } = screenMetricsFromDiagonal(
      m.screen.diagInches, app.screen.aspectW, app.screen.aspectH);
    app.screen.widthM = widthM;
    app.screen.heightM = heightM;
  }
});

net.on('calibStart', (m) => beginCalibration(m.points || app.calibPoints));
net.on('calibAbort', () => { app.phase = app.model ? 'live' : 'idle'; showInstruction(null); });
net.on('state', (m) => setState(m.name));
net.on('feedback', (m) => haptic(m.kind));
net.on('requestRecalibrate', () => requestRecalibrate());

/* ------------------------------------------------------------------- pose */

pose.on('pose', (p) => {
  if (!p) {
    // A null pose means ARCore has lost the world. Holding the last crosshair
    // is better than letting it snap to a garbage position, but the display
    // must be told so it can say so rather than looking broken.
    noteTracking(TRACKING.LOST);
    return;
  }
  noteTracking(p.tracking);
  trace.add(p.o, p.d, p.tracking, p.ts);
  if (app.phase !== 'live') return;
  const hit = aimFrom(p);
  if (!hit) return;
  app.lastAim = hit;
  aimHistory.push(hit.x, hit.y, p.ts);
  // Send every pose frame: at ~60 Hz a JSON aim packet is ~80 bytes, which is
  // nothing on a LAN, and any decimation shows up directly as crosshair lag.
  net.send({
    t: 'aim', x: hit.x, y: hit.y, ts: performance.now(), pts: p.ts, seq: app.seq++,
    tr: p.tracking, off: hit.offscreen ? 1 : 0,
  });
  app.sentAim++;
});

/** Track tracking-state transitions and tell the display about each one. */
function noteTracking(state) {
  if (state === app.tracking) return;
  const prev = app.tracking;
  app.tracking = state;
  if (state !== TRACKING.TRACKING) app.trackingLosses++;
  app.lastTrackingChangeAt = performance.now();
  net.send({ t: 'tracking', state, previous: prev, losses: app.trackingLosses });
  if (state === TRACKING.LOST) haptic('empty');
}

function aimFrom(p) {
  let raw = null;
  if (app.useRotationOnly && app.rotModel) raw = rotationAimToScreen(app.rotModel, p.d);
  else if (app.model) raw = aimToScreen(app.model, p.o, p.d);
  else if (app.rotModel) raw = rotationAimToScreen(app.rotModel, p.d);
  if (!raw) return null;

  let { x, y } = raw;
  // Re-zero offset: a first-order correction for accumulated drift. It is kept
  // separate from the model so the diagnostics can report how much correction
  // the session actually needed — that number is the drift measurement.
  x += app.zero.x;
  y += app.zero.y;
  if (app.smoothing) {
    const t = p.ts / 1000;
    x = app.filterX.filter(x, t);
    y = app.filterY.filter(y, t);
  }
  const offscreen = x < -0.02 || x > 1.02 || y < -0.02 || y > 1.02;
  // Clamp for rendering but keep the off-screen flag: pointing the gun away
  // from the TV is a legitimate input (it is how you reload).
  return { x: clamp01(x), y: clamp01(y), offscreen, distanceM: raw.distanceM };
}

/* ------------------------------------------------------------- calibration */

// Above this the calibration is bad enough that aiming will feel broken, and
// the player is better served by redoing it than by discovering that in-game.
const CALIB_ERROR_LIMIT = 0.025;   // 2.5% of screen width

function beginCalibration(points, { retry = false } = {}) {
  app.phase = 'calibrating';
  app.calib = { index: 0, rays: [], busy: false, points };
  if (!retry) app.calibAttempts = 0;
  app.model = null;
  app.rotModel = null;
  app.zero = { x: 0, y: 0 };
  app.filterX.reset();
  app.filterY.reset();
  nextCalibStep();
}

function calibLabelFor(i, points) {
  return points === 3 ? [LABELS[0], LABELS[1], LABELS[3]][i] : LABELS[i];
}

function nextCalibStep() {
  const { index, points } = app.calib;
  if (index >= points) return finishCalibration();
  showInstruction(`POINT AT<br>${calibLabelFor(index, points)}<br><small>then pull the trigger</small>`);
  net.send({ t: 'calibStep', index, label: calibLabelFor(index, points), total: points });
}

async function captureCalibPoint() {
  if (app.calib.busy) return;
  app.calib.busy = true;
  haptic('tick');
  showInstruction(`HOLD STILL…`);
  const sample = await pose.sampleAveraged(220);
  app.calib.busy = false;
  if (!sample || sample.tracking === TRACKING.LOST) {
    showInstruction('TRACKING LOST<br><small>point the camera at the room, then try again</small>');
    net.send({ t: 'calibFail', reason: 'tracking' });
    setTimeout(nextCalibStep, 1200);
    return;
  }
  app.calib.rays.push({ o: sample.o, d: sample.d, tracking: sample.tracking });
  trace.mark('calibPoint', { index: app.calib.index, label: calibLabelFor(app.calib.index, app.calib.points) });
  net.send({
    t: 'calibCaptured', index: app.calib.index,
    samples: sample.samples, tracking: sample.tracking,
  });
  app.calib.index++;
  haptic('hit');
  nextCalibStep();
}

function finishCalibration() {
  const rays = app.calib.rays;
  const { widthM, heightM } = app.screen;
  // Without camera tracking there is no position, so there is no plane to
  // solve for — the rotation homography *is* the calibration, and running the
  // 6DoF solver on four rays that all start at the origin would produce a
  // meaningless model and a quality gate that rejects every attempt.
  const rotationMode = app.useRotationOnly || pose.mode === 'rotation';

  try {
    app.rotModel = calibrateRotation(rays.map((r) => r.d), app.calibRect);
    app.model = rotationMode
      ? null
      : calibrate6dof(rays, widthM, heightM, { rect: app.calibRect });
  } catch (err) {
    net.send({ t: 'calibFail', reason: String(err && err.message) });
    showInstruction('CALIBRATION FAILED<br><small>try again</small>');
    return;
  }
  if (rotationMode && !app.rotModel) {
    net.send({ t: 'calibFail', reason: 'homography' });
    showInstruction('CALIBRATION FAILED<br><small>aim at each corner more distinctly</small>');
    setTimeout(() => beginCalibration(app.calib.points, { retry: true }), 1800);
    return;
  }

  app.calibAttempts++;

  // A residual either way, in the same unit, so the display and the session
  // report do not have to care which mode produced it: how far the captured
  // corners land from where they should once the calibration is applied.
  const quality = rotationMode
    ? rotationResidual(rays)
    : { rmsErrorScreen: app.model.rmsErrorScreen, rmsErrorM: app.model.rmsErrorM };

  const degraded = rays.some((r) => r.tracking && r.tracking !== TRACKING.TRACKING);
  if ((quality.rmsErrorScreen > CALIB_ERROR_LIMIT || degraded) && app.calibAttempts < 2) {
    net.send({
      t: 'calibRejected',
      rmsErrorScreen: quality.rmsErrorScreen,
      reason: degraded ? 'tracking' : 'error',
      attempt: app.calibAttempts,
    });
    showInstruction(degraded
      ? 'TRACKING WAS SHAKY<br><small>let\'s try that again</small>'
      : `THAT WAS A BIT OFF (${(quality.rmsErrorScreen * 100).toFixed(1)}%)<br><small>let's try that again</small>`);
    haptic('penalty');
    setTimeout(() => beginCalibration(app.calib.points, { retry: true }), 1800);
    return;
  }

  app.phase = 'live';
  showInstruction(null);
  app.filterX.reset();
  app.filterY.reset();
  net.send({
    t: 'calibDone',
    attempts: app.calibAttempts,
    accepted: quality.rmsErrorScreen <= CALIB_ERROR_LIMIT,
    rmsErrorM: quality.rmsErrorM ?? null,
    rmsErrorScreen: quality.rmsErrorScreen,
    scaleErrorW: app.model ? app.model.scaleErrorW : 0,
    scaleErrorH: app.model ? app.model.scaleErrorH : 0,
    distanceM: app.model ? averageRange(app.model) : null,
    mode: rotationMode ? 'rotation' : pose.mode,
  });
  haptic('ready');
}

/**
 * How well the rotation homography reproduces its own calibration points.
 * Each captured direction should map back onto the marker it was aimed at;
 * whatever it misses by is the calibration error, in screen widths.
 */
function rotationResidual(rays) {
  const rect = app.calibRect;
  const corners = rays.length === 3
    ? [[rect.x0, rect.y0], [rect.x1, rect.y0], [rect.x0, rect.y1]]
    : [[rect.x0, rect.y0], [rect.x1, rect.y0], [rect.x1, rect.y1], [rect.x0, rect.y1]];
  let sum = 0;
  let n = 0;
  for (let i = 0; i < rays.length; i++) {
    const hit = rotationAimToScreen(app.rotModel, rays[i].d);
    if (!hit) continue;
    const [tx, ty] = corners[i];
    sum += (hit.x - tx) ** 2 + (hit.y - ty) ** 2;
    n++;
  }
  return { rmsErrorScreen: n ? Math.sqrt(sum / n) : 1, rmsErrorM: null };
}

function averageRange(model) {
  return model.solve.ranges.reduce((a, b) => a + b, 0) / model.solve.ranges.length;
}

function requestRecalibrate() {
  net.send({ t: 'recalibrateRequest' });
}

/* ------------------------------------------------------- trace upload */
//
// Sent in chunks: a two-minute trace is a few hundred kilobytes of JSON, and a
// single frame that large stalls the socket that the aiming stream shares.

const CHUNK = 48 * 1024;

net.on('traceRequest', () => {
  trace.setMeta({
    ua: navigator.userAgent,
    mode: pose.mode,
    rotationOnly: app.useRotationOnly,
    screen: app.screen,
    calibRect: app.calibRect,
    calibRays: app.calib.rays || [],
    zero: app.zero,
    calibAttempts: app.calibAttempts,
    trackingLosses: app.trackingLosses,
    model: app.model ? {
      rmsErrorM: app.model.rmsErrorM,
      rmsErrorScreen: app.model.rmsErrorScreen,
      scaleErrorW: app.model.scaleErrorW,
      ranges: app.model.solve.ranges,
      origin: app.model.origin,
      uAxis: app.model.uAxis,
      vAxis: app.model.vAxis,
      widthM: app.model.widthM,
      heightM: app.model.heightM,
    } : null,
  });

  const text = JSON.stringify(trace.toJSON());
  const total = Math.ceil(text.length / CHUNK);
  net.send({ t: 'traceStart', bytes: text.length, chunks: total });
  for (let i = 0; i < total; i++) {
    net.send({ t: 'traceChunk', i, total, data: text.slice(i * CHUNK, (i + 1) * CHUNK) });
  }
  haptic('ready');
});

/* ------------------------------------------------------------------ re-zero */
//
// Drift shows up as a slowly growing constant offset. A full recalibration
// fixes it but costs ten seconds; pointing at the centre once fixes it to
// first order and costs two. The correction applied is reported, because
// "how much did it need after N minutes" IS the drift measurement.

net.on('rezeroStart', async () => {
  if (!app.model && !app.rotModel) return;
  app.phase = 'rezero';
  showInstruction('POINT AT THE CENTRE<br><small>then pull the trigger</small>');
});

async function captureRezero() {
  showInstruction('HOLD STILL…');
  const sample = await pose.sampleAveraged(220);
  app.phase = 'live';
  showInstruction(null);
  if (!sample || sample.tracking === TRACKING.LOST) {
    net.send({ t: 'rezeroFail', reason: 'tracking' });
    return;
  }
  const raw = app.useRotationOnly && app.rotModel
    ? rotationAimToScreen(app.rotModel, sample.d)
    : aimToScreen(app.model, sample.o, sample.d);
  if (!raw) { net.send({ t: 'rezeroFail', reason: 'no-intersection' }); return; }
  const applied = { x: 0.5 - raw.x, y: 0.5 - raw.y };
  app.zero = { x: app.zero.x + applied.x, y: app.zero.y + applied.y };
  app.filterX.reset();
  app.filterY.reset();
  net.send({ t: 'rezeroDone', applied, total: app.zero });
  haptic('ready');
}

/* ---------------------------------------------------------------- trigger */

function fire({ aimAt = null, source = 'tap' } = {}) {
  if (app.phase === 'calibrating') { captureCalibPoint(); return; }
  if (app.phase === 'rezero') { captureRezero(); return; }
  if (app.phase !== 'live') return;
  if (app.ammo <= 0) { haptic('empty'); net.send({ t: 'dryFire' }); return; }
  // A recoil flick has already swung the muzzle off target by the time it is
  // recognisable, so that path passes the aim from before the flick began.
  const aim = aimAt || app.lastAim;
  app.shots++;
  if (app.ammo !== Infinity) app.ammo--;
  trace.mark('fire', aim ? { x: aim.x, y: aim.y, source } : { source });
  // The shot carries its own coordinates rather than relying on the last aim
  // packet having arrived: that removes one source of "I hit it but it missed".
  net.send({
    t: 'fire',
    x: aim ? aim.x : 0.5,
    y: aim ? aim.y : 0.5,
    off: aim && aim.offscreen ? 1 : 0,
    ts: performance.now(),
    pts: pose.latest ? pose.latest.ts : performance.now(),
    seq: app.seq++,
    source,
  });
  haptic('shot');
}

/* ------------------------------------------------------- recoil trigger */

recoil.addEventListener('recoil', (e) => {
  if (!app.gestureFire) return;
  const past = aimHistory.at(e.detail.at, e.detail.lookbackMs);
  fire({ aimAt: past, source: 'recoil' });
});

function setGestureFire(on) {
  app.gestureFire = on;
  ui.gestureBtn.textContent = on ? 'RECOIL: ON' : 'RECOIL: OFF';
  ui.gestureBtn.classList.toggle('on', on);
  if (on) recoil.start(); else recoil.stop();
}

// pointerdown, not click: click waits for the gesture to resolve and that wait
// is directly perceptible as trigger lag.
ui.trigger.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  ui.trigger.classList.add('down');
  fire();
}, { passive: false });
ui.trigger.addEventListener('pointerup', () => ui.trigger.classList.remove('down'));
ui.trigger.addEventListener('pointercancel', () => ui.trigger.classList.remove('down'));

// A hardware volume key is a nicer trigger than the glass for some players.
window.addEventListener('keydown', (e) => {
  if (e.key === 'AudioVolumeDown' || e.key === 'AudioVolumeUp' || e.key === ' ') {
    e.preventDefault();
    fire();
  }
});

ui.reload.addEventListener('click', () => { app.ammo = Infinity; net.send({ t: 'reload' }); haptic('ready'); });
ui.recal.addEventListener('click', requestRecalibrate);
ui.diagBtn.addEventListener('click', () => ui.diag.classList.toggle('hidden'));
ui.quit.addEventListener('click', () => pose.stop());

/* --------------------------------------------------------------- haptics */

const PATTERNS = {
  shot: [18],
  tick: [8],
  hit: [12, 30, 22],
  miss: [6],
  penalty: [40, 60, 40],
  empty: [5, 40, 5],
  ready: [10, 60, 10, 60, 30],
};
function haptic(kind) {
  const p = PATTERNS[kind] || PATTERNS.shot;
  if (navigator.vibrate) navigator.vibrate(p);
}

/* ------------------------------------------------------------------- start */

ui.startBtn.addEventListener('click', async () => {
  try {
    await pose.start6dof(document.getElementById('overlay'));
    document.body.classList.add('in-ar');
    enterGunUi();
  } catch (err) {
    ui.hint.textContent = `Could not start AR: ${err && err.message}. Try limited mode.`;
    ui.fallbackBtn.classList.remove('hidden');
  }
});

ui.fallbackBtn.addEventListener('click', async () => {
  try {
    // iOS grants motion access only from inside a user gesture, and only for
    // the permission actually asked for — so both are requested on this tap.
    await pose.startRotationOnly();
    const motionOk = await RecoilTrigger.requestPermission();
    app.useRotationOnly = true;
    enterGunUi();
    setGestureFire(motionOk);
    if (!motionOk) {
      showInstruction('MOTION ACCESS DENIED<br><small>tap trigger still works; reload to re-ask</small>');
      setTimeout(() => showInstruction(null), 2600);
    }
  } catch (err) {
    ui.hint.textContent = `Could not read motion sensors: ${err && err.message}`;
  }
});

ui.gestureBtn.addEventListener('click', async () => {
  if (!app.gestureFire && RecoilTrigger.needsPermission() && !recoil.enabled) {
    const ok = await RecoilTrigger.requestPermission();
    if (!ok) return;
  }
  setGestureFire(!app.gestureFire);
  haptic('tick');
});

pose.on('ended', () => {
  document.body.classList.remove('in-ar');
  ui.gun.classList.add('hidden');
  ui.start.classList.remove('hidden');
  net.send({ t: 'gunStopped' });
});

function enterGunUi() {
  ui.start.classList.add('hidden');
  ui.gun.classList.remove('hidden');
  // No AR session to leave in gyro mode, so the button should not claim there is.
  ui.quit.textContent = pose.mode === 'rotation' ? 'EXIT' : 'EXIT AR';
  net.send({ t: 'gunReady', mode: pose.mode });
  setState('READY');
}

function setState(name) { ui.state.textContent = String(name || '').toUpperCase(); }

function showInstruction(html) {
  if (!html) { ui.instruction.classList.add('hidden'); return; }
  ui.instruction.innerHTML = html;
  ui.instruction.classList.remove('hidden');
}

/* --------------------------------------------------------- status + debug */

setInterval(() => {
  const t = pose.tracking;
  ui.track.textContent = `${pose.mode || '–'} ${t} ${pose.hz}Hz`;
  ui.track.className = 'pill ' +
    (t === TRACKING.TRACKING ? 'ok' : t === TRACKING.LIMITED ? 'warn' : 'bad');

  net.send({
    t: 'status',
    mode: pose.mode,
    rotationOnly: app.useRotationOnly,
    tracking: t,
    poseHz: pose.hz,
    aimHz: app.sentAim,
    rtt: net.bestRttMs,
    calibrated: Boolean(app.model || app.rotModel),
    rms: app.model ? app.model.rmsErrorScreen : null,
    shots: app.shots,
    smoothing: app.smoothing,
    losses: app.trackingLosses,
    zero: app.zero,
    attempts: app.calibAttempts,
    gesture: app.gestureFire,
    recoilFires: recoil.fires,
  });
  app.sentAim = 0;

  if (!ui.diag.classList.contains('hidden')) {
    const m = app.model;
    ui.diag.textContent = [
      `mode      ${pose.mode} ${app.useRotationOnly ? '(rotation-only override)' : ''}`,
      `tracking  ${t}   pose ${pose.hz} Hz`,
      `net       rtt ${net.bestRttMs ? net.bestRttMs.toFixed(1) : '–'} ms  sent ${net.sent}`,
      `aim       ${app.lastAim ? `${app.lastAim.x.toFixed(3)}, ${app.lastAim.y.toFixed(3)}${app.lastAim.offscreen ? ' OFF' : ''}` : '–'}`,
      `screen    ${app.screen.diagInches}" -> ${app.screen.widthM.toFixed(2)} x ${app.screen.heightM.toFixed(2)} m`,
      m ? `calib     rms ${(m.rmsErrorM * 1000).toFixed(1)} mm (${(m.rmsErrorScreen * 100).toFixed(2)}% of width)` : 'calib     none',
      m ? `range     ${averageRange(m).toFixed(2)} m   scaleErr ${(m.scaleErrorW * 100).toFixed(1)}%` : '',
      `smoothing ${app.smoothing ? 'on' : 'off'}   shots ${app.shots}`,
      `recoil    ${app.gestureFire ? 'on' : 'off'}  spin ${recoil.spin.toFixed(0)}/${recoil.spinThreshold}  jerk ${recoil.jerk.toFixed(1)}/${recoil.jerkThreshold}  fired ${recoil.fires}`,
    ].filter(Boolean).join('\n');
  }
}, 500);
