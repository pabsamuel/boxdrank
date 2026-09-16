// Synthesise a pose trace with known noise, drift and stalls.
//
// Two uses. The test suite drives it with chosen values and checks the analyser
// recovers them — an analyser that reports confident nonsense is worse than no
// analyser, because we will be trusting it with data from a room we cannot see.
// And as a CLI it writes a sample trace file, so you can see what
// analyze-trace.js does before recording a real session:
//
//   node tools/synth-trace.js sample.json --noise 0.08 --drift 0.3
//   node tools/analyze-trace.js sample.json

import { writeFileSync } from 'node:fs';
import { add, sub, scale, norm, cross, screenMetricsFromDiagonal } from '../shared/math.js';

export const CALIB_RECT = { x0: 0.05, y0: 0.08, x1: 0.95, y1: 0.92 };

const { widthM, heightM } = screenMetricsFromDiagonal(55, 16, 9);
const uAxis = [1, 0, 0];
const vAxis = [0, -1, 0];
const centre = [0, 1.15, -2.6];
const origin = sub(sub(centre, scale(uAxis, widthM / 2)), scale(vAxis, heightM / 2));
const pointOn = (x, y) => add(add(origin, scale(uAxis, x * widthM)), scale(vAxis, y * heightM));
const eye = [0, 1.2, 0];

export const ROOM = { widthM, heightM, eye, distanceM: 2.6 };

function rng(seed = 4242) {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  return () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
}

/** Direction toward a screen point, with angular noise and optional yaw drift. */
function dirTo(gauss, x, y, deg, yawDriftDeg = 0) {
  let d = norm(sub(pointOn(x, y), eye));
  if (yawDriftDeg) {
    const a = (yawDriftDeg * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    d = norm([d[0] * c + d[2] * s, d[1], -d[0] * s + d[2] * c]);
  }
  if (deg) {
    const ref = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const e1 = norm(cross(ref, d));
    const e2 = norm(cross(d, e1));
    const r = (deg * Math.PI) / 180;
    d = norm(add(d, add(scale(e1, gauss() * r), scale(e2, gauss() * r))));
  }
  return d;
}

const r5 = (v) => Math.round(v * 1e5) / 1e5;

/**
 * A plausible session: the player parks on a target, sweeps briskly to the
 * next, parks again. Parks give the noise measurement material; sweeps give
 * the lag measurement material.
 */
export function synthesise({
  noiseDeg = 0.05,
  driftDegPerMin = 0,
  seconds = 180,
  posNoiseMm = 3,
  stallAt = null,
  seed = 4242,
} = {}) {
  const gauss = rng(seed);
  const samples = [];
  const marks = [];
  const dt = 1000 / 60;
  const parks = [[0.5, 0.5], [0.1, 0.15], [0.9, 0.85], [0.5, 0.5], [0.1, 0.15], [0.9, 0.85]];
  const PARK_MS = 8000;
  const SWEEP_MS = 700;

  let t = 0;
  let parkIdx = 0;
  let mode = 'park';
  let modeEnds = PARK_MS;
  let fromPt = parks[0];
  let toPt = parks[0];
  let sweepStart = 0;

  while (t < seconds * 1000) {
    if (stallAt && t >= stallAt && t < stallAt + 400) { t += 400; continue; }
    const driftDeg = (driftDegPerMin * t) / 60000;

    let target;
    if (mode === 'park') {
      target = parks[parkIdx];
      if (t > modeEnds) {
        mode = 'sweep';
        fromPt = parks[parkIdx];
        parkIdx = (parkIdx + 1) % parks.length;
        toPt = parks[parkIdx];
        sweepStart = t;
        modeEnds = t + SWEEP_MS;
        marks.push({ t: Math.round(t), kind: 'fire', x: fromPt[0], y: fromPt[1] });
      }
    } else {
      const k = Math.min(1, (t - sweepStart) / SWEEP_MS);
      target = [fromPt[0] + (toPt[0] - fromPt[0]) * k, fromPt[1] + (toPt[1] - fromPt[1]) * k];
      if (t > modeEnds) { mode = 'park'; modeEnds = t + PARK_MS; }
    }

    const o = add(eye, [gauss(), gauss(), gauss()].map((g) => (g * posNoiseMm) / 1000));
    samples.push([
      Math.round(t),
      ...o.map(r5),
      ...dirTo(gauss, target[0], target[1], noiseDeg, driftDeg).map(r5),
      0,
    ]);
    t += dt;
  }

  const calibRays = [[0.05, 0.08], [0.95, 0.08], [0.95, 0.92], [0.05, 0.92]].map(([x, y]) => ({
    o: eye.slice(),
    d: dirTo(gauss, x, y, 0.25),
    tracking: 'tracking',
  }));

  return {
    version: 1,
    startedAt: Date.now(),
    durationMs: seconds * 1000,
    fields: ['tMs', 'ox', 'oy', 'oz', 'dx', 'dy', 'dz', 'tracking'],
    trackingCodes: ['tracking', 'limited', 'lost', 'none'],
    marks,
    meta: {
      ua: `synthetic (noise ${noiseDeg}°/axis, drift ${driftDegPerMin}°/min)`,
      mode: '6dof',
      screen: { diagInches: 55, widthM, heightM },
      calibRect: CALIB_RECT,
      calibRays,
    },
    samples,
  };
}

/* --------------------------------------------------------------------- CLI */

if (process.argv[1] && process.argv[1].endsWith('synth-trace.js')) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--')) || 'sample-trace.json';
  const opt = (name, dflt) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? Number(args[i + 1]) : dflt;
  };
  const trace = synthesise({
    noiseDeg: opt('noise', 0.05),
    driftDegPerMin: opt('drift', 0),
    seconds: opt('seconds', 180),
    posNoiseMm: opt('pos', 3),
  });
  writeFileSync(file, JSON.stringify(trace));
  console.log(`wrote ${file}: ${trace.samples.length} poses over ${trace.durationMs / 1000} s`);
  console.log(`now run:  node tools/analyze-trace.js ${file}`);
}
