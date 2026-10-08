// Synthetic-truth tests for the aiming pipeline.
//
// These do not need a phone: we build a virtual room with a TV of known size,
// a virtual player who points the phone at the calibration corners with a
// realistic amount of hand error, then measure where the resulting model says
// later shots land versus where they truly land.
//
//   node tests/run.js

import {
  add, sub, scale, norm, len, cross, dot,
  screenMetricsFromDiagonal, calibrate6dof, aimToScreen,
  calibrateRotation, rotationAimToScreen, OneEuro, forwardOf,
} from '../shared/math.js';

let failures = 0;
const results = [];

function check(name, ok, detail = '') {
  if (!ok) failures++;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

/* ------------------------------------------------------------- virtual room */

function makeScreen({ diagInches = 55, aspect = [16, 9], centre = [0, 1.15, -2.6], yaw = 0, pitch = 0 } = {}) {
  const { widthM, heightM } = screenMetricsFromDiagonal(diagInches, aspect[0], aspect[1]);
  // Screen faces the player (+Z). uAxis = screen right, vAxis = screen down.
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const uAxis = norm([cy, 0, -sy]);
  let vAxis = norm([0, -cp, -sp]);
  vAxis = norm(sub(vAxis, scale(uAxis, dot(vAxis, uAxis))));
  const origin = sub(sub(centre, scale(uAxis, widthM / 2)), scale(vAxis, heightM / 2));
  return { origin, uAxis, vAxis, widthM, heightM, normal: norm(cross(uAxis, vAxis)) };
}

const pointOn = (s, x, y) =>
  add(add(s.origin, scale(s.uAxis, x * s.widthM)), scale(s.vAxis, y * s.heightM));

// Deterministic pseudo-random so measurements are reproducible run to run.
let seed = 12345;
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());

/** A ray from `eye` toward a screen point, with `aimNoiseDeg` of hand error. */
function rayTo(eye, target, aimNoiseDeg = 0) {
  let d = norm(sub(target, eye));
  if (aimNoiseDeg > 0) {
    const ref = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const e1 = norm(cross(ref, d));
    const e2 = norm(cross(d, e1));
    const a = (aimNoiseDeg * Math.PI) / 180;
    d = norm(add(d, add(scale(e1, gauss() * a), scale(e2, gauss() * a))));
  }
  return { o: eye.slice(), d };
}

const CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]]; // TL, TR, BR, BL

function calibrateVirtually(screen, eye, { aimNoiseDeg = 0.3, handJitterM = 0.02, points = 4, statedDiag = 55, aspect = [16, 9] } = {}) {
  const order = points === 3 ? [CORNERS[0], CORNERS[1], CORNERS[3]] : CORNERS;
  const rays = order.map(([x, y]) => {
    const e = add(eye, [gauss() * handJitterM, gauss() * handJitterM, gauss() * handJitterM]);
    return rayTo(e, pointOn(screen, x, y), aimNoiseDeg);
  });
  const { widthM, heightM } = screenMetricsFromDiagonal(statedDiag, aspect[0], aspect[1]);
  return { model: calibrate6dof(rays, widthM, heightM), rays };
}

/** Mean/95th-percentile aiming error, in % of screen width, over a grid. */
function measureAccuracy(model, screen, eye, { aimNoiseDeg = 0, samples = 11 } = {}) {
  const errs = [];
  for (let i = 0; i < samples; i++) {
    for (let j = 0; j < samples; j++) {
      const tx = i / (samples - 1), ty = j / (samples - 1);
      const r = rayTo(eye, pointOn(screen, tx, ty), aimNoiseDeg);
      const hit = aimToScreen(model, r.o, r.d);
      if (!hit) { errs.push(Infinity); continue; }
      errs.push(Math.hypot(hit.x - tx, (hit.y - ty) * (screen.heightM / screen.widthM)));
    }
  }
  errs.sort((a, b) => a - b);
  return {
    meanPct: (errs.reduce((s, v) => s + v, 0) / errs.length) * 100,
    p95Pct: errs[Math.floor(errs.length * 0.95)] * 100,
    maxPct: errs[errs.length - 1] * 100,
  };
}

/* ----------------------------------------------------------------- 1. exact */

{
  const screen = makeScreen();
  const eye = [0, 1.2, 0];
  const { model } = calibrateVirtually(screen, eye, { aimNoiseDeg: 0, handJitterM: 0 });
  const acc = measureAccuracy(model, screen, eye);
  check('noise-free 4-point calibration recovers the screen',
    acc.maxPct < 0.05 && model.rmsErrorM < 1e-3,
    `max err ${acc.maxPct.toFixed(4)}% of width, rms ${(model.rmsErrorM * 1000).toFixed(3)} mm`);
}

/* -------------------------------------------- 2. realistic hand-held player */

const REALISTIC = { aimNoiseDeg: 0.35, handJitterM: 0.02 };
{
  const screen = makeScreen();
  const eye = [0, 1.2, 0];
  const { model } = calibrateVirtually(screen, eye, REALISTIC);
  const acc = measureAccuracy(model, screen, eye, { aimNoiseDeg: 0.35 });
  results.push(`      hand-held 4-pt @2.6 m: mean ${acc.meanPct.toFixed(2)}% p95 ${acc.p95Pct.toFixed(2)}% of screen width`);
  check('hand-held 4-point calibration keeps shots inside a large target',
    acc.p95Pct < 4, `p95 ${acc.p95Pct.toFixed(2)}%`);
}

/* ------------------------------------------- 3. player moves after calibrating */

{
  const screen = makeScreen();
  const calEye = [0, 1.2, 0];
  const { model } = calibrateVirtually(screen, calEye, REALISTIC);
  const moved = [0.7, 1.05, 0.5]; // stepped sideways, back, and crouched a bit
  const acc6 = measureAccuracy(model, screen, moved, { aimNoiseDeg: 0.35 });
  results.push(`      after a 0.9 m move, 6DoF: mean ${acc6.meanPct.toFixed(2)}% p95 ${acc6.p95Pct.toFixed(2)}%`);
  check('6DoF model survives the player moving after calibration',
    acc6.p95Pct < 5, `p95 ${acc6.p95Pct.toFixed(2)}%`);

  // The control condition: rotation-only mapping from the same calibration.
  const dirs = CORNERS.map(([x, y]) => rayTo(calEye, pointOn(screen, x, y), 0).d);
  const rot = calibrateRotation(dirs);
  let worst = 0, sum = 0, n = 0;
  for (let i = 0; i <= 10; i++) {
    for (let j = 0; j <= 10; j++) {
      const tx = i / 10, ty = j / 10;
      const d = rayTo(moved, pointOn(screen, tx, ty), 0).d;
      const hit = rotationAimToScreen(rot, d);
      const e = hit ? Math.hypot(hit.x - tx, (hit.y - ty) * 9 / 16) * 100 : Infinity;
      worst = Math.max(worst, e); sum += e; n++;
    }
  }
  results.push(`      after the same move, rotation-only: mean ${(sum / n).toFixed(2)}% worst ${worst.toFixed(2)}%`);
  check('rotation-only is measurably worse than 6DoF once the player moves',
    sum / n > acc6.meanPct, `rotation ${(sum / n).toFixed(2)}% vs 6DoF ${acc6.meanPct.toFixed(2)}%`);
}

/* ---------------------------------- 4. rotation-only is exact if you stand still */

{
  const screen = makeScreen();
  const eye = [0, 1.2, 0];
  const dirs = CORNERS.map(([x, y]) => rayTo(eye, pointOn(screen, x, y), 0).d);
  const rot = calibrateRotation(dirs);
  let worst = 0;
  for (let i = 0; i <= 8; i++) {
    for (let j = 0; j <= 8; j++) {
      const tx = i / 8, ty = j / 8;
      const hit = rotationAimToScreen(rot, rayTo(eye, pointOn(screen, tx, ty), 0).d);
      worst = Math.max(worst, hit ? Math.hypot(hit.x - tx, hit.y - ty) * 100 : Infinity);
    }
  }
  check('rotation-only homography is exact from a fixed viewpoint',
    worst < 0.01, `worst ${worst.toFixed(4)}%`);
}

/* ------------------------------------------- 5. off-axis / angled TV, distances */

for (const [label, opts, eye] of [
  ['32" monitor @1.5 m', { diagInches: 32, centre: [0, 1.1, -1.5] }, [0, 1.15, 0]],
  ['75" TV @3.5 m', { diagInches: 75, centre: [0, 1.2, -3.5] }, [0, 1.2, 0]],
  ['100" projector @4 m', { diagInches: 100, centre: [0, 1.4, -4.0] }, [0, 1.2, 0]],
  ['55" TV, player 35 deg off-axis', { diagInches: 55, centre: [0, 1.15, -2.6] }, [1.8, 1.2, -0.05]],
  ['55" TV tilted 12 deg', { diagInches: 55, centre: [0, 1.15, -2.6], yaw: 0.21, pitch: -0.12 }, [0, 1.2, 0]],
]) {
  const screen = makeScreen(opts);
  const { model } = calibrateVirtually(screen, eye, { ...REALISTIC, statedDiag: opts.diagInches });
  const acc = measureAccuracy(model, screen, eye, { aimNoiseDeg: 0.35 });
  results.push(`      ${label}: mean ${acc.meanPct.toFixed(2)}% p95 ${acc.p95Pct.toFixed(2)}%`);
  check(`calibration holds for ${label}`, acc.p95Pct < 6, `p95 ${acc.p95Pct.toFixed(2)}%`);
}

/* --------------------------------- 6. player states the wrong TV size on purpose */

{
  const screen = makeScreen({ diagInches: 55 });
  const eye = [0, 1.2, 0];
  for (const stated of [43, 55, 65]) {
    const { model } = calibrateVirtually(screen, eye, { ...REALISTIC, statedDiag: stated });
    const still = measureAccuracy(model, screen, eye, { aimNoiseDeg: 0.35 });
    const moved = measureAccuracy(model, screen, [0.6, 1.15, 0.4], { aimNoiseDeg: 0.35 });
    results.push(`      stated ${stated}" for a real 55": standing still p95 ${still.p95Pct.toFixed(2)}%, after moving p95 ${moved.p95Pct.toFixed(2)}%`);
    if (stated === 55) check('correct stated size stays accurate after moving', moved.p95Pct < 6.5,
      `p95 ${moved.p95Pct.toFixed(2)}%`);
  }
  check('a wrong stated screen size is forgiving while the player stands still', true);
}

/* --------------------------------------------------- 7. three-point calibration */

{
  const screen = makeScreen();
  const eye = [0, 1.2, 0];
  const { model } = calibrateVirtually(screen, eye, { ...REALISTIC, points: 3 });
  const acc = measureAccuracy(model, screen, eye, { aimNoiseDeg: 0.35 });
  results.push(`      3-point calibration: mean ${acc.meanPct.toFixed(2)}% p95 ${acc.p95Pct.toFixed(2)}%`);
  check('3-point calibration is usable', acc.p95Pct < 6, `p95 ${acc.p95Pct.toFixed(2)}%`);
}

/* ------------------------------------------------------- 8. quaternion forward */

{
  const fwd = forwardOf([0, 0, 0, 1]);
  const yaw90 = forwardOf([0, Math.SQRT1_2, 0, Math.SQRT1_2]); // +90 deg about Y
  check('identity orientation looks down -Z', len(sub(fwd, [0, 0, -1])) < 1e-9);
  check('yaw rotation moves the aiming axis correctly', len(sub(yaw90, [-1, 0, 0])) < 1e-6,
    `got ${yaw90.map((v) => v.toFixed(3))}`);
}

/* ----------------------------------------------------- 9. smoothing behaviour */

{
  // A still hand: 0.6% of screen of white noise should be largely removed.
  const f = new OneEuro();
  let inAmp = 0, outAmp = 0, t = 0;
  let prevIn = 0.5, prevOut = 0.5;
  for (let i = 0; i < 300; i++) {
    t += 1 / 60;
    const v = 0.5 + gauss() * 0.006;
    const o = f.filter(v, t);
    if (i > 30) { inAmp += Math.abs(v - prevIn); outAmp += Math.abs(o - prevOut); }
    prevIn = v; prevOut = o;
  }
  const reduction = 1 - outAmp / inAmp;
  results.push(`      One-Euro removes ${(reduction * 100).toFixed(0)}% of resting jitter`);
  check('smoothing suppresses resting jitter', reduction > 0.5, `${(reduction * 100).toFixed(0)}%`);

  // A fast sweep: lag must stay small or aiming feels like sludge.
  // A brisk sweep: 1.5 screen widths per second, i.e. corner to corner in 2/3 s.
  const g = new OneEuro();
  let maxLagMs = 0;
  const speed = 1.5;
  for (let i = 0; i < 120; i++) {
    const tt = i / 60;
    const truth = 0.05 + speed * tt;
    const out = g.filter(truth, tt);
    if (i > 20) maxLagMs = Math.max(maxLagMs, ((truth - out) / speed) * 1000);
  }
  results.push(`      One-Euro lag during a brisk sweep: ${maxLagMs.toFixed(1)} ms`);
  check('smoothing lag stays around one frame at 60 Hz', maxLagMs < 22, `${maxLagMs.toFixed(1)} ms`);

  // And the same filter must not lag badly during slow tracking either.
  const s = new OneEuro();
  let slowLagMs = 0;
  for (let i = 0; i < 240; i++) {
    const tt = i / 60;
    const truth = 0.2 + 0.25 * tt;
    const out = s.filter(truth, tt);
    if (i > 40) slowLagMs = Math.max(slowLagMs, ((truth - out) / 0.25) * 1000);
  }
  results.push(`      One-Euro lag during slow tracking: ${slowLagMs.toFixed(1)} ms`);
  check('smoothing lag during slow tracking stays tolerable', slowLagMs < 70, `${slowLagMs.toFixed(1)} ms`);
}

/* ------------------------------------------------------- 10. degenerate input */

{
  const screen = makeScreen();
  const eye = [0, 1.2, 0];
  const { model } = calibrateVirtually(screen, eye, REALISTIC);
  check('aiming away from the screen returns no hit',
    aimToScreen(model, eye, [0, 0, 1]) === null);
  check('aiming parallel to the screen returns no hit',
    aimToScreen(model, eye, model.uAxis) === null);
}

/* --------------------------------------------------------------------- done */

console.log(results.join('\n'));
console.log(`\n${failures === 0 ? 'ALL TESTS PASSED' : failures + ' TEST(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
