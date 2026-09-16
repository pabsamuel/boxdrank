// Display client: pairing, calibration choreography, the light-gun test rig,
// the game, and the diagnostics that tell us whether any of it actually works.

import { Net, makeRoomCode } from '../../shared/net.js';
import {
  fitCanvas, drawCrosshair, drawCalibTarget, drawTestField, drawShot, PLAYER_COLOURS,
} from './render.js';
import { Game } from './game.js';

const $ = (id) => document.getElementById(id);
const canvas = $('stage');
const ctx = canvas.getContext('2d');

const MODE = {
  LOBBY: 'lobby', CALIBRATE: 'calibrate', TEST: 'test', REZERO: 'rezero',
  COUNTDOWN: 'countdown', GAME: 'game', OVER: 'over',
};

const state = {
  mode: MODE.LOBBY,
  room: (new URLSearchParams(location.search).get('room') || makeRoomCode()),
  players: new Map(),          // netId -> player
  shots: [],
  showCrosshair: true,
  smoothing: true,
  rotationOnly: false,
  showDiag: false,
  diagInches: 55,
  calibPoints: 4,
  calib: null,                 // { playerId, index, label, total }
  countdownEndsAt: 0,
  fps: 0,
  lastFrame: performance.now(),
  frameTimes: [],
  testHits: new Map(),         // marker id -> { errPct, at }
  testLog: [],
};

const game = new Game();

/* ------------------------------------------------------------ test markers */

const MARKERS = [
  { id: 'TL', x: 0.06, y: 0.10 }, { id: 'TC', x: 0.50, y: 0.10 }, { id: 'TR', x: 0.94, y: 0.10 },
  { id: 'ML', x: 0.06, y: 0.50 }, { id: 'C',  x: 0.50, y: 0.50 }, { id: 'MR', x: 0.94, y: 0.50 },
  { id: 'BL', x: 0.06, y: 0.90 }, { id: 'BC', x: 0.50, y: 0.90 }, { id: 'BR', x: 0.94, y: 0.90 },
];

/* -------------------------------------------------------------- networking */

const net = new Net({ role: 'display', room: state.room, name: 'tv' });
net.connect().startPinging(1000);

$('roomCode').textContent = state.room;

(async function setupPairing() {
  let info = { lanIp: location.hostname, httpsPort: 8443, https: true };
  try { info = await (await fetch('/api/info')).json(); } catch {}
  const secure = location.protocol === 'https:';
  const host = info.https ? `${info.lanIp}:${info.httpsPort}` : location.host;
  const proto = info.https ? 'https' : 'http';
  const joinUrl = `${proto}://${host}/phone?room=${state.room}`;
  $('joinUrl').textContent = joinUrl;
  $('qr').src = `/api/qr?url=${encodeURIComponent(joinUrl)}`;
  if (secure || !info.https) $('tlsWarn').classList.add('hidden');
})();

function player(id, slot) {
  if (!state.players.has(id)) {
    const index = state.players.size;
    state.players.set(id, {
      id,
      slot: typeof slot === 'number' && slot >= 0 ? slot : index,
      colour: PLAYER_COLOURS[index % PLAYER_COLOURS.length],
      aim: { x: 0.5, y: 0.5, off: false },
      tracking: '–',
      poseHz: 0,
      aimHz: 0,
      calibrated: false,
      calibError: null,
      lastAimAt: 0,
      latency: { net: [], pose: [] },
      jitter: [],
      packets: 0,
      status: {},
    });
  }
  return state.players.get(id);
}

net.on('peers', (m) => {
  const alive = new Set(m.peers.filter((p) => p.role === 'phone').map((p) => p.id));
  for (const id of [...state.players.keys()]) if (!alive.has(id)) state.players.delete(id);
  for (const p of m.peers) if (p.role === 'phone') player(p.id);
  renderPlayerList();
});

net.on('gunReady', (m) => {
  const p = player(m.from, m.slot);
  p.mode = m.mode;
  renderPlayerList();
  sendConfig(m.from);
  // First gun in, and nothing calibrated yet: just start. Fewer decisions for
  // the player standing across the room with no keyboard.
  if (state.mode === MODE.LOBBY && !p.calibrated) startCalibration(m.from);
});

net.on('status', (m) => {
  const p = player(m.from, m.slot);
  p.status = m;
  p.tracking = m.tracking;
  p.poseHz = m.poseHz;
  p.aimHz = m.aimHz * 2;   // status is sent twice a second
  p.calibrated = m.calibrated;
  renderPlayerList();
});

net.on('aim', (m) => {
  const p = player(m.from, m.slot);
  p.aim = { x: m.x, y: m.y, off: Boolean(m.off) };
  p.lastAimAt = performance.now();
  p.packets++;
  p.pendingRender = performance.now();
  const local = net.peerToLocal(m.pts ?? m.ts, m.from);
  push(p.latency.pose, performance.now() - local, 120);
  push(p.latency.net, performance.now() - net.peerToLocal(m.ts, m.from), 120);
  push(p.jitter, { x: m.x, y: m.y, t: performance.now() }, 40);
});

net.on('fire', (m) => {
  const p = player(m.from, m.slot);
  handleShot(p, m);
});

net.on('calibStep', (m) => {
  if (!state.calib || state.calib.playerId !== m.from) {
    state.calib = { playerId: m.from, index: m.index, label: m.label, total: m.total };
  }
  Object.assign(state.calib, { index: m.index, label: m.label, total: m.total });
  state.mode = MODE.CALIBRATE;
  banner(`POINT AT ${m.label}`, `PULL THE TRIGGER   ·   ${m.index + 1} / ${m.total}`);
});

net.on('calibCaptured', () => { /* the phone advances; nothing to do here */ });

net.on('calibFail', (m) => banner('TRACKING LOST', 'move the phone so the camera sees the room'));

net.on('calibDone', (m) => {
  const p = player(m.from, m.slot);
  p.calibrated = true;
  p.calibError = m;
  p.calibratedAt = performance.now();
  state.calib = null;
  state.testHits.clear();
  state.testLog.length = 0;
  renderPlayerList();
  const pct = (m.rmsErrorScreen * 100).toFixed(2);
  banner('READY', `calibration error ${pct}% of screen width  ·  ${m.distanceM ? m.distanceM.toFixed(1) + ' m away' : ''}`);
  setTimeout(() => startCountdown(MODE.TEST), 1400);
});

net.on('calibRejected', (m) => {
  logEvent('calibRejected', { player: m.from, rms: m.rmsErrorScreen, reason: m.reason });
  banner(m.reason === 'tracking' ? 'TRACKING WAS SHAKY' : 'THAT WAS A BIT OFF',
    'let\'s do that again — take your time on each corner');
});

net.on('tracking', (m) => {
  const p = player(m.from, m.slot);
  p.tracking = m.state;
  p.trackingLosses = m.losses;
  logEvent('tracking', { player: m.from, state: m.state, from: m.previous });
  // Only shout about it during play; during calibration the phone says it.
  if (state.mode === MODE.TEST || state.mode === MODE.GAME) {
    if (m.state === 'lost') banner('TRACKING LOST', 'point the phone camera at the room');
    else if (m.state === 'limited') banner('TRACKING WEAK', 'more light, or point at something with detail');
    else banner(null);
  }
});

/* ------------------------------------------------------------------ re-zero */

net.on('rezeroDone', (m) => {
  const p = player(m.from, m.slot);
  p.zero = m.total;
  const magnitude = Math.hypot(m.applied.x, m.applied.y) * 100;
  logEvent('rezero', {
    player: m.from,
    appliedPct: magnitude,
    sinceCalibMs: performance.now() - (p.calibratedAt || performance.now()),
  });
  state.mode = state.preRezeroMode || MODE.TEST;
  banner('RE-ZEROED', `corrected ${magnitude.toFixed(2)}% of screen width`);
  setTimeout(() => banner(null), 1500);
});

net.on('rezeroFail', () => {
  state.mode = state.preRezeroMode || MODE.TEST;
  banner('RE-ZERO FAILED', 'tracking was lost — try again');
  setTimeout(() => banner(null), 1800);
});

function startRezero(playerId) {
  if (state.mode === MODE.REZERO) return;
  state.preRezeroMode = state.mode;
  state.mode = MODE.REZERO;
  net.send({ t: 'rezeroStart', to: playerId });
  banner('POINT AT THE CENTRE', 'then pull the trigger');
}

net.on('recalibrateRequest', (m) => startCalibration(m.from));
net.on('dryFire', () => {});
net.on('peerGone', () => renderPlayerList());

function push(arr, v, max) {
  arr.push(v);
  if (arr.length > max) arr.shift();
}

/* ------------------------------------------------------------ session log */
//
// The point of this prototype is a measurement, and the measurement happens in
// someone's living room with no console open. So the display records what
// happened and press X writes a report you can paste straight back.

const session = { startedAt: Date.now(), events: [] };

function logEvent(kind, data) {
  session.events.push({ t: Math.round(performance.now()), kind, ...data });
  if (session.events.length > 5000) session.events.shift();
}

function sessionReport() {
  const lines = [];
  const round = (v, n = 2) => (v === null || v === undefined || Number.isNaN(v) ? '–' : v.toFixed(n));

  lines.push('=== LIGHTGUN SESSION REPORT ===');
  lines.push(`when            ${new Date(session.startedAt).toISOString()}`);
  lines.push(`duration        ${Math.round(performance.now() / 1000)} s`);
  lines.push(`display         ${window.innerWidth}x${window.innerHeight} @ ${state.diagInches}" · ${round(state.fps, 0)} fps`);
  lines.push(`settings        ${state.calibPoints}-point · smoothing ${state.smoothing ? 'on' : 'off'} · crosshair ${state.showCrosshair ? 'on' : 'off'}${state.rotationOnly ? ' · ROTATION-ONLY' : ''}`);

  for (const p of sortedPlayers()) {
    const netS = stats(p.latency.net);
    const poseS = stats(p.latency.pose);
    const rndS = stats(p.latency.render);
    lines.push('');
    lines.push(`--- PLAYER ${p.slot + 1} (${p.status.mode || 'unknown mode'}) ---`);
    lines.push(`tracking        ${p.tracking} · ${p.trackingLosses || 0} loss events · pose ${p.poseHz || 0} Hz · aim ${p.aimHz || 0} Hz`);
    lines.push(`calibration     ${p.calibrated ? `err ${round((p.calibError.rmsErrorScreen || 0) * 100)}% of width · scale ${round((p.calibError.scaleErrorW || 0) * 100, 1)}% · solved range ${round(p.calibError.distanceM || 0)} m · ${p.calibError.attempts || 1} attempt(s)` : 'NOT CALIBRATED'}`);
    lines.push(`latency         transport ${round(netS.mean)} ms (p95 ${round(netS.p95)}) · pose→display ${round(poseS.mean)} ms (p95 ${round(poseS.p95)}) · →pixels +${round(rndS.mean)} ms`);
    if (p.zero) lines.push(`re-zero applied ${round(Math.hypot(p.zero.x, p.zero.y) * 100)}% of width total`);
  }

  // Test-mode accuracy, including the bias vector — the single most diagnostic
  // number here. Scattered error is noise; a consistent bias is a bug.
  const hits = [...state.testHits.entries()];
  if (hits.length) {
    const errs = hits.map(([, h]) => h.errPct);
    const b = biasVector();
    lines.push('');
    lines.push('--- TEST MODE ACCURACY ---');
    lines.push(`markers hit     ${hits.length}/${MARKERS.length}`);
    lines.push(`error           mean ${round(errs.reduce((a, c) => a + c, 0) / errs.length)}% · worst ${round(Math.max(...errs))}% of screen width`);
    if (b) {
      lines.push(`bias vector     dx ${round(b.dx)}% dy ${round(b.dy)}% (magnitude ${round(b.magnitude)}%)`);
      lines.push(`                ${b.magnitude > 1.0 ? 'CONSISTENT BIAS — systematic, not noise' : 'no consistent bias — error is scatter'}`);
    }
    lines.push(`per marker      ${hits.map(([id, h]) => `${id} ${round(h.errPct, 1)}%`).join('  ')}`);
    const d = driftOf();
    if (d) lines.push(`drift           ${d.mean >= 0 ? '+' : ''}${round(d.mean)}% over ${round(d.spanMs / 1000, 0)} s (${d.n} markers re-shot)`);
  }

  if (game.shots) {
    lines.push('');
    lines.push('--- GAME ---');
    lines.push(`score ${game.score} · ${game.hits}/${game.shots} hits (${Math.round((game.hits / game.shots) * 100)}%) · ${game.mistakes} civilians`);
  }

  const notable = session.events.filter((e) => e.kind !== 'shot');
  if (notable.length) {
    lines.push('');
    lines.push('--- EVENTS ---');
    for (const e of notable.slice(-40)) {
      lines.push(`${String(Math.round(e.t / 1000)).padStart(5)}s  ${e.kind}  ${JSON.stringify(
        Object.fromEntries(Object.entries(e).filter(([k]) => k !== 't' && k !== 'kind')))}`);
    }
  }
  return lines.join('\n');
}

/* ------------------------------------------------------------ trace upload */

const incoming = { parts: [], expected: 0, bytes: 0, from: null };

net.on('traceStart', (m) => {
  incoming.parts = new Array(m.chunks);
  incoming.expected = m.chunks;
  incoming.bytes = m.bytes;
  incoming.from = m.from;
  banner('DOWNLOADING TRACE', `${(m.bytes / 1024).toFixed(0)} KB from the phone`);
});

net.on('traceChunk', (m) => {
  if (!incoming.expected) return;
  incoming.parts[m.i] = m.data;
  if (incoming.parts.filter(Boolean).length !== incoming.expected) return;

  const text = incoming.parts.join('');
  incoming.expected = 0;
  try {
    const trace = JSON.parse(text);
    state.lastTrace = trace;
    logEvent('trace', { samples: trace.samples.length, durationMs: trace.durationMs, kb: Math.round(text.length / 1024) });
    download(text, `lightgun-trace-${stamp()}.json`, 'application/json');
    banner('TRACE SAVED', `${trace.samples.length} poses · run tools/analyze-trace.js on it`);
  } catch (err) {
    banner('TRACE FAILED TO PARSE', String(err && err.message));
  }
  setTimeout(() => banner(null), 2600);
});

function requestTrace(playerId) {
  net.send({ t: 'traceRequest', to: playerId });
  banner('ASKING THE PHONE FOR ITS POSE TRACE', 'this takes a second');
}

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

function download(text, filename, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function exportSession() {
  const report = sessionReport();
  console.log(report);
  download(`${report}\n\n=== RAW ===\n${JSON.stringify(session.events)}`,
    `lightgun-session-${stamp()}.txt`);
  if (navigator.clipboard) navigator.clipboard.writeText(report).catch(() => {});
  banner('REPORT SAVED', 'copied to the clipboard and downloaded');
  setTimeout(() => banner(null), 2200);
}

/** Mean signed error across the test markers: scatter vs systematic offset. */
function biasVector() {
  const entries = [...state.testHits.entries()];
  if (entries.length < 3) return null;
  const aspect = window.innerWidth / window.innerHeight;
  let dx = 0;
  let dy = 0;
  let n = 0;
  for (const [id, h] of entries) {
    if (!h.signed) continue;
    dx += h.signed.dx;
    dy += h.signed.dy;
    n++;
  }
  if (!n) return null;
  dx = (dx / n) * 100;
  dy = ((dy / n) * 100) / aspect;
  return { dx, dy, magnitude: Math.hypot(dx, dy) };
}

function sendConfig(to) {
  net.send({
    t: 'config',
    to,
    screen: {
      diagInches: state.diagInches,
      aspectW: window.innerWidth,
      aspectH: window.innerHeight,
    },
    calibRect: CALIB_RECT,
    calibPoints: state.calibPoints,
    smoothing: state.smoothing,
    rotationOnly: state.rotationOnly,
  });
}

/* ------------------------------------------------------------- calibration */

function startCalibration(playerId) {
  const p = player(playerId);
  p.calibrated = false;
  sendConfig(playerId);
  state.mode = MODE.CALIBRATE;
  state.calib = { playerId, index: 0, label: 'TOP LEFT', total: state.calibPoints };
  state.calibStartedAt = performance.now();
  net.send({ t: 'calibStart', to: playerId, points: state.calibPoints });
  banner('CALIBRATION', 'point the phone at the marker, then pull the trigger');
  hide($('lobby'));
  hide($('results'));
  hide($('hud'));
}

// Markers sit inside the edge so they are fully visible and comfortable to aim
// at. The phone is told this rectangle so its solver fits the right geometry —
// pretending these are the true corners inflates the solved distance by ~11%,
// which shows up as bad parallax the moment the player moves.
const CALIB_RECT = { x0: 0.05, y0: 0.08, x1: 0.95, y1: 0.92 };

const CALIB_POSITIONS = {
  'TOP LEFT': [CALIB_RECT.x0, CALIB_RECT.y0],
  'TOP RIGHT': [CALIB_RECT.x1, CALIB_RECT.y0],
  'BOTTOM RIGHT': [CALIB_RECT.x1, CALIB_RECT.y1],
  'BOTTOM LEFT': [CALIB_RECT.x0, CALIB_RECT.y1],
};

/* -------------------------------------------------------------- shot logic */

function handleShot(p, m) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const now = performance.now();
  const x = m.x * w;
  const y = m.y * h;
  state.shots.push({ x, y, t: now, colour: p.colour });
  if (state.shots.length > 40) state.shots.shift();

  const fireLatency = now - net.peerToLocal(m.ts, m.from);
  push(p.latency.net, fireLatency, 120);

  // The phone owns the presses that drive calibration and re-zeroing.
  if (state.mode === MODE.CALIBRATE || state.mode === MODE.REZERO) return;

  logEvent('shot', { player: p.id, x: Number(m.x.toFixed(4)), y: Number(m.y.toFixed(4)), mode: state.mode });

  if (state.mode === MODE.TEST) {
    scoreTestShot(p, m, now);
    net.send({ t: 'feedback', to: p.id, kind: 'hit' });
    return;
  }

  if (state.mode === MODE.GAME) {
    const res = game.shoot(p.id, m.x, m.y, now, w / h);
    net.send({ t: 'feedback', to: p.id, kind: res.kind === 'hit' ? 'hit' : res.kind === 'penalty' ? 'penalty' : 'miss' });
    return;
  }

  if (state.mode === MODE.OVER) {
    const target = hitButton(m.x, m.y);
    if (target === 'again') startCountdown(MODE.GAME);
    else if (target === 'recal') startCalibration(p.id);
    if (target) net.send({ t: 'feedback', to: p.id, kind: 'hit' });
    return;
  }
}

/** In test mode every shot is scored against the nearest printed marker. */
function scoreTestShot(p, m, now) {
  const aspect = window.innerWidth / window.innerHeight;
  let best = null;
  let bestD = Infinity;
  for (const marker of MARKERS) {
    const d = Math.hypot((m.x - marker.x) * aspect, m.y - marker.y);
    if (d < bestD) { bestD = d; best = marker; }
  }
  if (!best || bestD > 0.25) return;
  const errPct = bestD * 100 / aspect;   // as a percentage of screen width
  state.testHits.set(best.id, {
    errPct, at: now,
    // Signed error too: the sign is what separates scatter from a systematic
    // offset, and only the systematic kind is a bug we can fix.
    signed: { dx: m.x - best.x, dy: m.y - best.y },
  });
  state.testLog.push({
    marker: best.id,
    errPct,
    sinceCalibMs: now - (p.calibratedAt || now),
    player: p.id,
  });
  if (state.testLog.length > 200) state.testLog.shift();
}

function hitButton(nx, ny) {
  for (const [el, name] of [[$('againBtn'), 'again'], [$('recalBtn'), 'recal']]) {
    const r = el.getBoundingClientRect();
    const x = nx * window.innerWidth;
    const y = ny * window.innerHeight;
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return name;
  }
  return null;
}

/* --------------------------------------------------------------- sequencing */

function startCountdown(nextMode) {
  state.mode = MODE.COUNTDOWN;
  state.nextMode = nextMode;
  state.countdownEndsAt = performance.now() + 3200;
  hide($('lobby'));
  hide($('results'));
}

function enterTest() {
  state.mode = MODE.TEST;
  banner(null);
  hide($('hud'));
  state.showDiag = true;
  $('diag').classList.remove('hidden');
  $('diag').classList.add('center');
}

function enterGame() {
  state.mode = MODE.GAME;
  banner(null);
  $('diag').classList.remove('center');
  game.start(performance.now());
  show($('hud'));
  hide($('results'));
}

function endGame() {
  state.mode = MODE.OVER;
  $('finalScore').textContent = String(game.score);
  const acc = game.shots ? Math.round((game.hits / game.shots) * 100) : 0;
  const lines = [
    `HITS ${game.hits}   ·   SHOTS ${game.shots}   ·   ACCURACY ${acc}%`,
    `CIVILIANS HIT ${game.mistakes}   ·   BEST ${game.best}`,
  ];
  if (state.players.size > 1) {
    for (const p of sortedPlayers()) {
      const s = game.playerStats(p.id);
      lines.push(`PLAYER ${p.slot + 1}: ${s.score} (${s.hits}/${s.shots})`);
    }
  }
  $('breakdown').innerHTML = lines.join('<br>');
  show($('results'));
  hide($('hud'));
}

/* --------------------------------------------------------------- lobby UI */

function renderPlayerList() {
  const list = $('playerList');
  const players = sortedPlayers();
  if (!players.length) {
    list.innerHTML = '<div class="player waiting"><div class="name">WAITING FOR A GUN</div><div class="meta">scan the QR code with an Android phone</div></div>';
    return;
  }
  list.innerHTML = players.map((p) => `
    <div class="player p${p.slot + 1}">
      <div class="name" style="color:${p.colour}">PLAYER ${p.slot + 1}</div>
      <div class="meta">
        ${p.status.mode || '–'} · ${p.tracking} · ${p.poseHz || 0} Hz<br>
        ${p.calibrated ? `calibrated ±${((p.calibError?.rmsErrorScreen || 0) * 100).toFixed(2)}%` : 'not calibrated'}
      </div>
    </div>`).join('');
}

const sortedPlayers = () => [...state.players.values()].sort((a, b) => a.slot - b.slot);

function banner(text, sub) {
  const b = $('banner');
  const s = $('subBanner');
  if (!text) { hide(b); hide(s); return; }
  b.textContent = text;
  show(b);
  if (sub) { s.textContent = sub; show(s); } else hide(s);
}
const show = (el) => el.classList.remove('hidden');
const hide = (el) => el.classList.add('hidden');

/* ------------------------------------------------------------- keyboard */

$('screenSize').addEventListener('change', (e) => {
  const v = e.target.value;
  $('customSizeWrap').classList.toggle('hidden', v !== 'custom');
  state.diagInches = v === 'custom' ? Number($('customSize').value) : Number(v);
  broadcastConfig();
});
$('customSize').addEventListener('change', (e) => {
  state.diagInches = Number(e.target.value);
  broadcastConfig();
});
$('calibPoints').addEventListener('change', (e) => {
  state.calibPoints = Number(e.target.value);
  broadcastConfig();
});
function broadcastConfig() { for (const p of state.players.keys()) sendConfig(p); }

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'f') {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  } else if (k === 'c') {
    const first = sortedPlayers()[0];
    if (first) startCalibration(first.id);
  } else if (k === 't') { startCountdown(MODE.TEST); }
  else if (k === 'g') { startCountdown(MODE.GAME); }
  else if (k === 'd') { state.showDiag = !state.showDiag; $('diag').classList.toggle('hidden', !state.showDiag); }
  else if (k === 'h') { state.showCrosshair = !state.showCrosshair; }
  else if (k === 's') { state.smoothing = !state.smoothing; broadcastConfig(); }
  else if (k === 'r') { state.rotationOnly = !state.rotationOnly; broadcastConfig(); }
  else if (k === 'z') { const p = sortedPlayers()[0]; if (p) startRezero(p.id); }
  else if (k === 'x') { exportSession(); }
  else if (k === 'v') { const p = sortedPlayers()[0]; if (p) requestTrace(p.id); }
  else if (k === 'l') { state.mode = MODE.LOBBY; show($('lobby')); hide($('hud')); hide($('results')); banner(null); }
});

/* ------------------------------------------------------------- main loop */

function frame(now) {
  requestAnimationFrame(frame);
  const { w, h } = fitCanvas(canvas);
  const dt = now - state.lastFrame;
  state.lastFrame = now;
  push(state.frameTimes, dt, 90);
  state.fps = 1000 / (state.frameTimes.reduce((a, b) => a + b, 0) / state.frameTimes.length);

  // Render latency: how long an aim packet waited before it became pixels.
  for (const p of state.players.values()) {
    if (p.pendingRender) {
      push(p.latency.render = p.latency.render || [], now - p.pendingRender, 120);
      p.pendingRender = 0;
    }
  }

  ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
  ctx.clearRect(0, 0, w, h);

  switch (state.mode) {
    case MODE.LOBBY:
      ctx.clearRect(0, 0, w, h);
      break;

    case MODE.CALIBRATE: {
      ctx.fillStyle = '#0b0f18';
      ctx.fillRect(0, 0, w, h);
      const pos = CALIB_POSITIONS[state.calib?.label] || [0.5, 0.5];
      drawCalibTarget(ctx, pos[0] * w, pos[1] * h, now, Math.min(w, h) / 900 + 0.35);
      break;
    }

    case MODE.TEST:
      drawTestField(ctx, w, h, MARKERS, state.testHits);
      break;

    case MODE.REZERO:
      drawTestField(ctx, w, h, MARKERS, state.testHits);
      drawCalibTarget(ctx, w / 2, h / 2, now, Math.min(w, h) / 900 + 0.35);
      break;

    case MODE.COUNTDOWN: {
      ctx.fillStyle = '#0b0f18';
      ctx.fillRect(0, 0, w, h);
      const left = state.countdownEndsAt - now;
      const n = Math.ceil((left - 200) / 1000);
      banner(left <= 200 ? 'GO' : String(Math.max(1, n)), left <= 200 ? '' : 'get ready');
      if (left <= 0) {
        banner(null);
        state.nextMode === MODE.GAME ? enterGame() : enterTest();
      }
      break;
    }

    case MODE.GAME:
      game.update(now, dt);
      game.draw(ctx, w, h, now);
      $('hudScore').textContent = String(game.score);
      $('hudTime').textContent = String(Math.ceil(game.remainingMs / 1000));
      $('hudCombo').textContent = `x${game.combo}`;
      $('hudBest').textContent = String(Math.max(game.best, game.score));
      if (!game.running) endGame();
      break;

    case MODE.OVER:
      ctx.fillStyle = '#0b0f18';
      ctx.fillRect(0, 0, w, h);
      break;
  }

  // Shots and crosshairs sit above everything except the DOM overlays.
  state.shots = state.shots.filter((s) => drawShot(ctx, s, now));

  if (state.showCrosshair && state.mode !== MODE.LOBBY && state.mode !== MODE.CALIBRATE) {
    for (const p of sortedPlayers()) {
      const stale = now - p.lastAimAt > 400;
      if (!p.calibrated || stale) continue;
      // A crosshair drawn from a lost pose is a lie; dim it rather than hide it
      // so the player can see the gun is still there but not trusted.
      if (p.tracking === 'lost' || p.tracking === 'limited') {
        drawCrosshair(ctx, p.aim.x * w, p.aim.y * h, '#8794aa', {
          offscreen: true, label: p.tracking.toUpperCase(),
        });
        continue;
      }
      drawCrosshair(ctx, p.aim.x * w, p.aim.y * h, p.colour, {
        offscreen: p.aim.off,
        label: state.players.size > 1 ? `P${p.slot + 1}` : '',
      });
    }
  }

  if (state.showDiag) updateDiag(now);
}
requestAnimationFrame(frame);

/* ------------------------------------------------------------ diagnostics */

const stats = (arr) => {
  if (!arr || !arr.length) return { mean: 0, p95: 0, n: 0 };
  const s = [...arr].sort((a, b) => a - b);
  return {
    mean: s.reduce((a, b) => a + b, 0) / s.length,
    p95: s[Math.floor(s.length * 0.95)],
    n: s.length,
  };
};

function jitterOf(p) {
  // RMS spread of the crosshair over the last ~0.7 s, in % of screen width.
  const win = p.jitter.filter((s) => performance.now() - s.t < 700);
  if (win.length < 5) return null;
  const mx = win.reduce((a, s) => a + s.x, 0) / win.length;
  const my = win.reduce((a, s) => a + s.y, 0) / win.length;
  const v = win.reduce((a, s) => a + (s.x - mx) ** 2 + (s.y - my) ** 2, 0) / win.length;
  return Math.sqrt(v) * 100;
}

function driftOf() {
  // Compare the first and the most recent measurement of each test marker.
  const byMarker = new Map();
  for (const e of state.testLog) {
    if (!byMarker.has(e.marker)) byMarker.set(e.marker, []);
    byMarker.get(e.marker).push(e);
  }
  const deltas = [];
  let spanMs = 0;
  for (const entries of byMarker.values()) {
    if (entries.length < 2) continue;
    deltas.push(entries[entries.length - 1].errPct - entries[0].errPct);
    spanMs = Math.max(spanMs, entries[entries.length - 1].sinceCalibMs - entries[0].sinceCalibMs);
  }
  if (!deltas.length) return null;
  return { mean: deltas.reduce((a, b) => a + b, 0) / deltas.length, spanMs, n: deltas.length };
}

function updateDiag(now) {
  const lines = [];
  lines.push(`mode ${state.mode}   fps ${state.fps.toFixed(0)}   crosshair ${state.showCrosshair ? 'on' : 'off'}   smoothing ${state.smoothing ? 'on' : 'off'}${state.rotationOnly ? '   ROTATION-ONLY A/B' : ''}`);
  lines.push(`screen ${state.diagInches}"  ${window.innerWidth}x${window.innerHeight}   room ${state.room}`);
  lines.push('');
  for (const p of sortedPlayers()) {
    const netS = stats(p.latency.net);
    const poseS = stats(p.latency.pose);
    const rndS = stats(p.latency.render);
    const jit = jitterOf(p);
    lines.push(`P${p.slot + 1}  ${p.status.mode || '–'}  ${p.tracking}  pose ${p.poseHz}Hz  aim ${p.aimHz}Hz  rtt ${(net.rttFor(p.id) || 0).toFixed(1)}ms  losses ${p.trackingLosses || 0}`);
    lines.push(`    latency  net ${netS.mean.toFixed(1)}ms (p95 ${netS.p95.toFixed(1)})   pose->display ${poseS.mean.toFixed(1)}ms (p95 ${poseS.p95.toFixed(1)})   ->pixels +${rndS.mean.toFixed(1)}ms`);
    lines.push(`    crosshair ${p.aim.x.toFixed(3)}, ${p.aim.y.toFixed(3)}${p.aim.off ? '  OFF-SCREEN' : ''}   jitter ${jit === null ? '–' : jit.toFixed(2) + '% rms'}`);
    lines.push(`    calib ${p.calibrated ? `ok  err ${(p.calibError.rmsErrorScreen * 100).toFixed(2)}% of width  scale ${(p.calibError.scaleErrorW * 100).toFixed(1)}%  range ${(p.calibError.distanceM || 0).toFixed(2)}m  age ${((now - (p.calibratedAt || now)) / 1000).toFixed(0)}s` : 'none'}`);
  }
  if (state.mode === MODE.TEST) {
    const errs = [...state.testHits.values()].map((h) => h.errPct);
    const d = driftOf();
    lines.push('');
    lines.push(`test  markers hit ${state.testHits.size}/${MARKERS.length}   mean err ${errs.length ? (errs.reduce((a, b) => a + b, 0) / errs.length).toFixed(2) : '–'}%   worst ${errs.length ? Math.max(...errs).toFixed(2) : '–'}%`);
    lines.push(`drift ${d ? `${d.mean >= 0 ? '+' : ''}${d.mean.toFixed(2)}% over ${(d.spanMs / 1000).toFixed(0)}s (${d.n} markers re-shot)` : '– (shoot each marker twice)'}`);
    const b = biasVector();
    lines.push(`bias  ${b ? `dx ${b.dx >= 0 ? '+' : ''}${b.dx.toFixed(2)}%  dy ${b.dy >= 0 ? '+' : ''}${b.dy.toFixed(2)}%  ${b.magnitude > 1 ? '<- SYSTEMATIC' : '(scatter only)'}` : '– (shoot 3+ markers)'}`);
    lines.push('press X to save a session report you can paste back');
  }
  $('diag').textContent = lines.join('\n');
}

/* Test hooks: the headless end-to-end test drives the display through these. */
window.__lightgun = {
  state, game, net, MODE, MARKERS, CALIB_RECT, CALIB_POSITIONS, session,
  startCalibration, startCountdown, startRezero, sessionReport, biasVector,
};
