// Does the trace analyser actually measure what it claims?
//
// We synthesise a session whose noise, drift and stalls we chose ourselves,
// then check the analyser recovers those numbers. An analyser that reports
// confident nonsense is worse than no analyser, because the whole point is to
// trust it with data from a room we cannot see.
//
//   node tests/trace.js

import {
  parseTrace, poseHealth, poseNoise, driftEstimate, recheckCalibration,
  sweepSmoothing, analyze, formatReport,
} from '../tools/analyze-trace.js';
import { synthesise } from '../tools/synth-trace.js';

let failures = 0;
const out = [];
function check(name, ok, detail = '') {
  if (!ok) failures++;
  out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

/* --------------------------------------------------------- synthetic room */

// The room, the noise and the drift all come from tools/synth-trace.js, which
// is also what generates sample traces for the CLI — one generator, so the
// thing the tests validate is the thing people run.

// Round-trip through JSON so the tests see exactly what the wire delivers,
// quantisation included — that is where the noise-floor bug was hiding.
const synth = (opts) => parseTrace(JSON.stringify(synthesise(opts)));

/* ------------------------------------------------------- 1. stream health */

{
  const trace = synth({ stallAt: 20000 });
  const h = poseHealth(trace);
  out.push(`      stream: ${h.samples} samples, ${h.hz.toFixed(1)} Hz, worst gap ${h.worstGapMs.toFixed(0)} ms`);
  check('reports the pose rate correctly', Math.abs(h.hz - 60) < 1.5, `${h.hz.toFixed(2)} Hz`);
  check('spots an injected stall', h.stallsOver100ms === 1, `${h.stallsOver100ms} stalls`);
}

/* ---------------------------------------------------- 2. noise measurement */

for (const trueNoise of [0.02, 0.05, 0.15]) {
  const trace = synth({ noiseDeg: trueNoise });
  const n = poseNoise(trace);
  // Noise is applied per axis, so the recovered radial rms is ~sqrt(2)x that.
  const expected = trueNoise * Math.SQRT2;
  const ratio = n.medianRmsDeg / expected;
  out.push(`      injected ${trueNoise}°/axis → measured ${n.medianRmsDeg.toFixed(3)}° rms (expected ~${expected.toFixed(3)}°, ratio ${ratio.toFixed(2)})`);
  check(`recovers ${trueNoise}°/axis of injected sensor noise`,
    ratio > 0.6 && ratio < 1.5, `ratio ${ratio.toFixed(2)}`);
}

{
  const trace = synth({ noiseDeg: 0.05, posNoiseMm: 8 });
  const n = poseNoise(trace);
  out.push(`      positional noise: injected 8 mm/axis → measured ${n.medianPosNoiseMm.toFixed(1)} mm`);
  check('measures positional noise in the right ballpark',
    n.medianPosNoiseMm > 4 && n.medianPosNoiseMm < 20, `${n.medianPosNoiseMm.toFixed(1)} mm`);
}

/* ------------------------------------------------------------- 3. drift */

{
  const clean = driftEstimate(synth({ driftDegPerMin: 0 }));
  out.push(`      no injected drift → ${clean ? clean.medianDegPerMinute.toFixed(4) : '–'}°/min over ${clean ? clean.pairs : 0} revisits`);
  check('reports no drift when there is none',
    clean && clean.medianDegPerMinute < 0.05, clean ? `${clean.medianDegPerMinute.toFixed(4)}°/min` : 'no pairs');

  const drifty = driftEstimate(synth({ driftDegPerMin: 0.5 }));
  out.push(`      injected 0.5°/min → measured ${drifty ? drifty.medianDegPerMinute.toFixed(3) : '–'}°/min`);
  check('detects injected yaw drift',
    drifty && drifty.medianDegPerMinute > 0.25 && drifty.medianDegPerMinute < 0.9,
    drifty ? `${drifty.medianDegPerMinute.toFixed(3)}°/min` : 'no pairs');
  check('drift measurement separates clean from drifting sessions',
    clean && drifty && drifty.medianDegPerMinute > clean.medianDegPerMinute * 5);
}

/* -------------------------------------------------- 4. offline recalibration */

{
  const trace = synth({});
  const c = recheckCalibration(trace);
  out.push(`      offline re-solve: residual ${c.rmsErrorScreenPct.toFixed(2)}%, scale ${c.scaleErrorPct.toFixed(2)}%, range ${c.rangeM.toFixed(2)} m (true 2.60)`);
  check('re-solves the calibration from the trace alone',
    Math.abs(c.rangeM - 2.6) < 0.35, `${c.rangeM.toFixed(2)} m`);
}

/* ---------------------------------------------- 5. smoothing recommendation */

{
  const quiet = sweepSmoothing(synth({ noiseDeg: 0.02 }));
  const noisy = sweepSmoothing(synth({ noiseDeg: 0.20 }));
  out.push(`      quiet sensor → minCutoff ${quiet.best.minCutoff} beta ${quiet.best.beta} (jitter ${quiet.best.jitterPct.toFixed(3)}%, lag ${quiet.best.lagMs.toFixed(1)} ms)`);
  out.push(`      noisy sensor → minCutoff ${noisy.best.minCutoff} beta ${noisy.best.beta} (jitter ${noisy.best.jitterPct.toFixed(3)}%, lag ${noisy.best.lagMs.toFixed(1)} ms)`);
  check('sweep returns a usable recommendation', Boolean(quiet.best && noisy.best));
  check('a noisier sensor is given more filtering than a quiet one',
    noisy.best.minCutoff <= quiet.best.minCutoff,
    `noisy ${noisy.best.minCutoff} vs quiet ${quiet.best.minCutoff}`);
  check('the recommendation keeps lag inside a couple of frames',
    quiet.best.lagMs < 35, `${quiet.best.lagMs.toFixed(1)} ms`);
  check('every swept setting is reported so the trade-off is visible',
    quiet.results.length === 36, `${quiet.results.length} settings`);
}

/* ------------------------------------------------------------ 6. reporting */

{
  const trace = synth({ noiseDeg: 0.06, driftDegPerMin: 0.2 });
  const report = formatReport(trace, analyze(trace));
  check('the report covers every section a diagnosis needs',
    ['POSE STREAM', 'SENSOR NOISE', 'DRIFT', 'CALIBRATION', 'SMOOTHING SWEEP', 'To apply']
      .every((s) => report.includes(s)),
    `${report.length} chars`);
  check('the report survives a trace with no still windows', (() => {
    const noisy = synth({ noiseDeg: 5 });
    const text = formatReport(noisy, analyze(noisy));
    return typeof text === 'string' && text.length > 0;
  })());
}

console.log(out.join('\n'));
console.log(`\n${failures === 0 ? 'ALL TRACE TESTS PASSED' : failures + ' TRACE TEST(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
