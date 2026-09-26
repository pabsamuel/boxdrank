// Offline analysis of a real pose trace recorded on a phone.
//
//   node tools/analyze-trace.js lightgun-trace-….json
//
// The point: real ARCore noise, real drift and the right smoothing settings can
// only be measured on a real device, but they do not need a real device to be
// *analysed*. One recorded session can be re-solved and re-tuned here as many
// times as we like.
//
// Everything below is exported so the test suite can drive it on a synthetic
// trace whose true answers are known.

import { readFileSync } from 'node:fs';
import {
  sub, norm, dot, cross, len, scale, add,
  calibrate6dof, aimToScreen, OneEuro,
} from '../shared/math.js';

/* ------------------------------------------------------------------ loading */

export function parseTrace(json) {
  const t = typeof json === 'string' ? JSON.parse(json) : json;
  const samples = t.samples.map((s) => ({
    t: s[0],
    o: [s[1], s[2], s[3]],
    // Re-normalise on the way in: the wire format rounds these, and every
    // downstream calculation assumes unit directions.
    d: norm([s[4], s[5], s[6]]),
    tracking: (t.trackingCodes || ['tracking', 'limited', 'lost', 'none'])[s[7]] || 'unknown',
  }));
  return { ...t, samples };
}

/**
 * Angle between two directions, in degrees.
 *
 * Deliberately not acos(dot(a,b)): trace directions are rounded to five
 * decimals on the wire, so their length is only 1 to within ~5e-6, and
 * acos(1 - ε) ≈ sqrt(2ε) turns that into a ~0.09° floor — which is exactly
 * the range of real ARCore jitter we are trying to measure. The atan2 form
 * stays exact all the way down to zero.
 */
export function angleBetween(a, b) {
  const u = norm(a);
  const v = norm(b);
  return 2 * Math.atan2(len(sub(u, v)), len(add(u, v))) * 180 / Math.PI;
}

/* -------------------------------------------------------------- pose health */

export function poseHealth(trace) {
  const s = trace.samples;
  if (s.length < 2) return null;
  const gaps = [];
  const byState = {};
  for (let i = 1; i < s.length; i++) {
    gaps.push(s[i].t - s[i - 1].t);
    byState[s[i].tracking] = (byState[s[i].tracking] || 0) + 1;
  }
  gaps.sort((a, b) => a - b);
  const span = (s[s.length - 1].t - s[0].t) / 1000;
  return {
    samples: s.length,
    durationS: span,
    hz: s.length / Math.max(1e-6, span),
    medianGapMs: gaps[Math.floor(gaps.length / 2)],
    worstGapMs: gaps[gaps.length - 1],
    // A long gap means the pose loop stalled — usually the app losing focus or
    // ARCore relocalising. Worth separating from ordinary jitter.
    stallsOver100ms: gaps.filter((g) => g > 100).length,
    trackingMix: byState,
  };
}

/* ------------------------------------------------- still-window detection */
//
// Real hand-held data has no ground truth, but it does have moments where the
// player was holding still. Those windows are where pose noise is measurable:
// anything moving inside them is the sensor, not the player.

export function stillWindows(trace, { windowMs = 400, maxDriftDeg = 0.9 } = {}) {
  const s = trace.samples;
  const out = [];
  let i = 0;
  while (i < s.length) {
    let j = i + 1;
    while (j < s.length && s[j].t - s[i].t < windowMs) j++;
    if (j - i < 8) { i++; continue; }
    const seg = s.slice(i, j);
    const mean = norm(seg.reduce((a, p) => add(a, p.d), [0, 0, 0]));
    const spread = Math.max(...seg.map((p) => angleBetween(p.d, mean)));
    // Spread alone lets a slow ramp masquerade as stillness, which then gets
    // counted as sensor noise. Comparing the two halves rejects any window with
    // a trend through it, so what is left really is noise about a fixed mean.
    const half = Math.floor(seg.length / 2);
    const firstHalf = norm(seg.slice(0, half).reduce((a, p) => add(a, p.d), [0, 0, 0]));
    const secondHalf = norm(seg.slice(half).reduce((a, p) => add(a, p.d), [0, 0, 0]));
    const trend = angleBetween(firstHalf, secondHalf);
    if (spread < maxDriftDeg && trend < spread * 0.5 && seg.every((p) => p.tracking === 'tracking')) {
      out.push({ startMs: seg[0].t, endMs: seg[seg.length - 1].t, mean, samples: seg, spreadDeg: spread });
      i = j;
    } else {
      i++;
    }
  }
  return out;
}

/** Angular noise of the aiming direction while the hand was still. */
export function poseNoise(trace) {
  const windows = stillWindows(trace);
  if (!windows.length) return null;
  const perWindow = windows.map((w) => {
    const errs = w.samples.map((p) => angleBetween(p.d, w.mean));
    const rms = Math.sqrt(errs.reduce((a, e) => a + e * e, 0) / errs.length);
    return { rmsDeg: rms, maxDeg: Math.max(...errs) };
  });
  const rms = perWindow.map((p) => p.rmsDeg).sort((a, b) => a - b);
  return {
    windows: windows.length,
    medianRmsDeg: rms[Math.floor(rms.length / 2)],
    worstRmsDeg: rms[rms.length - 1],
    // Positional noise matters too: it is what makes a ray-plane intersection
    // wander even when the phone is pointed perfectly still.
    medianPosNoiseMm: median(windows.map((w) => {
      const c = scale(w.samples.reduce((a, p) => add(a, p.o), [0, 0, 0]), 1 / w.samples.length);
      return median(w.samples.map((p) => len(sub(p.o, c)) * 1000));
    })),
  };
}

const median = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/* ------------------------------------------------------------------ drift */
//
// Drift is not measurable from directions alone — the phone barely translates
// while aiming, so "same position" says nothing about where it was pointed.
// What is measurable: project each still window through the calibrated model to
// a screen coordinate, and cluster windows that land on the same spot. A player
// parks on the same few places repeatedly; if the tracker drifts, those clusters
// walk across the screen over time. The slope of that walk is the drift, in the
// unit we actually care about — percent of screen width per minute.

export function driftEstimate(trace, { clusterPct = 6, minGapMs = 20000 } = {}) {
  const model = modelFrom(trace);
  if (!model) return null;
  const windows = stillWindows(trace);
  const points = [];
  for (const w of windows) {
    const hit = aimToScreen(model, centroid(w), w.mean);
    if (hit) points.push({ t: (w.startMs + w.endMs) / 2, x: hit.x, y: hit.y });
  }
  if (points.length < 4) return null;

  const aspect = model.widthM / model.heightM;
  const radius = clusterPct / 100;
  const clusters = [];
  for (const p of points) {
    // Cluster against the earliest visit, so later drift cannot drag the centre
    // along with it and hide itself.
    const c = clusters.find((k) => Math.hypot(p.x - k.x0, (p.y - k.y0) / aspect) < radius);
    if (c) c.visits.push(p);
    else clusters.push({ x0: p.x, y0: p.y, visits: [p] });
  }

  const rates = [];
  let longestGapS = 0;
  let pairs = 0;
  for (const c of clusters) {
    const first = c.visits[0];
    for (const v of c.visits) {
      const gapMs = v.t - first.t;
      if (gapMs < minGapMs) continue;
      const displacementPct = Math.hypot(v.x - first.x, (v.y - first.y) / aspect) * 100;
      rates.push(displacementPct / (gapMs / 60000));
      longestGapS = Math.max(longestGapS, gapMs / 1000);
      pairs++;
    }
  }
  if (!rates.length) return null;

  const pctPerMinute = median(rates);
  // Report degrees too: it is the unit the ARCore literature uses, and it is
  // independent of how big the player's TV happens to be.
  const distanceM = model.rangeM || 2.6;
  const degPerMinute = Math.atan2((pctPerMinute / 100) * model.widthM, distanceM) * 180 / Math.PI;
  return { pairs, clusters: clusters.length, pctPerMinute, medianDegPerMinute: degPerMinute, longestGapS };
}

const centroid = (w) =>
  scale(w.samples.reduce((a, p) => add(a, p.o), [0, 0, 0]), 1 / w.samples.length);

/* ------------------------------------------------- smoothing parameter sweep */
//
// The filter's job is a trade: suppress the noise measured above without adding
// lag. On a real trace we can measure both sides directly, then pick the
// setting that meets a jitter budget for the least lag.

export function sweepSmoothing(trace, {
  minCutoffs = [0.6, 1.0, 1.5, 2.0, 3.0, 4.0],
  betas = [0, 1, 2, 5, 10, 20],
  jitterBudgetPct = null,   // default: derived from this trace's own noise
} = {}) {
  const model = modelFrom(trace);
  if (!model) return null;

  // Project the whole trace to screen coordinates once.
  const track = [];
  for (const p of trace.samples) {
    if (p.tracking !== 'tracking') continue;
    const hit = aimToScreen(model, p.o, p.d);
    if (hit) track.push({ t: p.t / 1000, x: hit.x, y: hit.y });
  }
  if (track.length < 60) return null;

  const { idx: stills, thresholdPct } = stillIndices(track);
  const fasts = fastIndices(track);
  if (!stills.length || !fasts.length) {
    // Better to say the measurement failed than to recommend a filter from it.
    return { results: [], best: null, unmeasurable: true, stills: stills.length, fasts: fasts.length };
  }
  const results = [];

  // A fixed jitter budget is the wrong target: on a quiet sensor it is met by
  // doing nothing, and on a noisy one it may be unreachable at any setting.
  // Ask instead for a meaningful *reduction* of whatever noise this phone has,
  // floored so we never chase noise already below what a player can perceive.
  const rawJitterPct = rmsAboutLocalMean(track, stills) * 100;
  const budget = jitterBudgetPct !== null
    ? jitterBudgetPct
    : Math.max(0.06, Math.min(0.25, rawJitterPct * 0.35));

  for (const minCutoff of minCutoffs) {
    for (const beta of betas) {
      const fx = new OneEuro({ minCutoff, beta });
      const fy = new OneEuro({ minCutoff, beta });
      const out = track.map((p) => ({ t: p.t, x: fx.filter(p.x, p.t), y: fy.filter(p.y, p.t) }));
      results.push({
        minCutoff,
        beta,
        jitterPct: rmsAboutLocalMean(out, stills) * 100,
        lagMs: meanLagMs(track, out, fasts),
      });
    }
  }

  const feasible = results.filter((r) => r.jitterPct <= budget);
  const best = (feasible.length ? feasible : results)
    .slice()
    .sort((a, b) => a.lagMs - b.lagMs || a.jitterPct - b.jitterPct)[0];
  return {
    results, best, metBudget: feasible.length > 0,
    jitterBudgetPct: budget, rawJitterPct, stillThresholdPct: thresholdPct,
  };
}

function modelFrom(trace) {
  const m = trace.meta || {};
  if (m.model && m.model.origin) {
    return {
      origin: m.model.origin, uAxis: m.model.uAxis, vAxis: m.model.vAxis,
      normal: norm(cross(m.model.uAxis, m.model.vAxis)),
      widthM: m.model.widthM, heightM: m.model.heightM, rect: m.calibRect,
    };
  }
  if (m.calibRays && m.calibRays.length >= 3 && m.screen) {
    return calibrate6dof(m.calibRays, m.screen.widthM, m.screen.heightM, { rect: m.calibRect });
  }
  return null;
}

/**
 * Indices where the crosshair was essentially parked.
 *
 * The threshold has to adapt: a noisy phone's resting crosshair spreads wider
 * than a quiet one's, and a fixed threshold finds nothing on exactly the phones
 * whose noise we most need to measure — then reports zero jitter, which reads
 * as "perfect" instead of "measurement failed".
 */
function stillIndices(track, { windowMs = 300, thresholds = [1.2, 2.5, 5, 10] } = {}) {
  for (const maxSpreadPct of thresholds) {
    const idx = [];
    for (let i = 0; i < track.length; i++) {
      const seg = [];
      for (let j = i; j < track.length && (track[j].t - track[i].t) * 1000 < windowMs; j++) seg.push(track[j]);
      if (seg.length < 8) continue;
      const mx = seg.reduce((a, p) => a + p.x, 0) / seg.length;
      const my = seg.reduce((a, p) => a + p.y, 0) / seg.length;
      const spread = Math.max(...seg.map((p) => Math.hypot(p.x - mx, p.y - my))) * 100;
      if (spread < maxSpreadPct) idx.push(i);
    }
    if (idx.length > track.length * 0.05) return { idx, thresholdPct: maxSpreadPct };
  }
  return { idx: [], thresholdPct: null };
}

/** Indices during brisk movement, where lag is measurable. */
function fastIndices(track, { minSpeed = 0.5 } = {}) {
  const idx = [];
  for (let i = 1; i < track.length; i++) {
    const dt = track[i].t - track[i - 1].t;
    if (dt <= 0) continue;
    const v = Math.hypot(track[i].x - track[i - 1].x, track[i].y - track[i - 1].y) / dt;
    if (v > minSpeed) idx.push(i);
  }
  return idx;
}

function rmsAboutLocalMean(out, indices, span = 10) {
  if (!indices.length) return 0;
  let sum = 0;
  let n = 0;
  for (const i of indices) {
    const seg = out.slice(i, i + span);
    if (seg.length < 4) continue;
    const mx = seg.reduce((a, p) => a + p.x, 0) / seg.length;
    const my = seg.reduce((a, p) => a + p.y, 0) / seg.length;
    for (const p of seg) { sum += (p.x - mx) ** 2 + (p.y - my) ** 2; n++; }
  }
  return n ? Math.sqrt(sum / n) : 0;
}

/** Lag as displacement over speed — the time the filter is behind the truth. */
function meanLagMs(raw, out, indices) {
  let total = 0;
  let n = 0;
  for (const i of indices) {
    if (i < 1 || i >= raw.length) continue;
    const dt = raw[i].t - raw[i - 1].t;
    if (dt <= 0) continue;
    const speed = Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y) / dt;
    if (speed < 1e-6) continue;
    const behind = Math.hypot(raw[i].x - out[i].x, raw[i].y - out[i].y);
    total += (behind / speed) * 1000;
    n++;
  }
  return n ? total / n : 0;
}

/* ----------------------------------------------------------- recalibration */

export function recheckCalibration(trace) {
  const m = trace.meta || {};
  if (!m.calibRays || m.calibRays.length < 3 || !m.screen) return null;
  const solved = calibrate6dof(m.calibRays, m.screen.widthM, m.screen.heightM, { rect: m.calibRect });
  return {
    rmsErrorScreenPct: solved.rmsErrorScreen * 100,
    scaleErrorPct: solved.scaleErrorW * 100,
    rangeM: solved.solve.ranges.reduce((a, b) => a + b, 0) / solved.solve.ranges.length,
    phoneReportedPct: m.model ? m.model.rmsErrorScreen * 100 : null,
  };
}

/* --------------------------------------------------------------- reporting */

export function analyze(trace) {
  return {
    health: poseHealth(trace),
    noise: poseNoise(trace),
    drift: driftEstimate(trace),
    calibration: recheckCalibration(trace),
    smoothing: sweepSmoothing(trace),
  };
}

export function formatReport(trace, a) {
  const L = [];
  const n = (v, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? '–' : Number(v).toFixed(d));
  L.push('=== LIGHTGUN TRACE ANALYSIS ===');
  L.push(`device     ${(trace.meta && trace.meta.ua) || 'unknown'}`);
  L.push(`mode       ${(trace.meta && trace.meta.mode) || '?'}${trace.meta && trace.meta.rotationOnly ? ' (rotation-only)' : ''}`);

  if (a.health) {
    L.push('');
    L.push('--- POSE STREAM ---');
    L.push(`samples    ${a.health.samples} over ${n(a.health.durationS, 1)} s = ${n(a.health.hz, 1)} Hz`);
    L.push(`gaps       median ${n(a.health.medianGapMs, 1)} ms · worst ${n(a.health.worstGapMs, 0)} ms · ${a.health.stallsOver100ms} stalls >100 ms`);
    L.push(`tracking   ${Object.entries(a.health.trackingMix).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  }

  if (a.noise) {
    L.push('');
    L.push('--- SENSOR NOISE (measured while the hand was still) ---');
    L.push(`angular    ${n(a.noise.medianRmsDeg, 3)}° rms (worst window ${n(a.noise.worstRmsDeg, 3)}°) over ${a.noise.windows} windows`);
    L.push(`positional ${n(a.noise.medianPosNoiseMm, 1)} mm`);
    const screenPct = a.noise.medianRmsDeg !== null && trace.meta && trace.meta.model
      ? degToScreenPct(a.noise.medianRmsDeg, trace.meta.model)
      : null;
    if (screenPct !== null) L.push(`           ≈ ${n(screenPct)}% of screen width at the calibrated distance`);
  } else {
    L.push('\n--- SENSOR NOISE ---\nno still windows found: the gun never stopped moving.');
  }

  if (a.drift) {
    L.push('');
    L.push('--- DRIFT ---');
    L.push(`${a.drift.pairs} revisits across ${a.drift.clusters} parked spots, up to ${n(a.drift.longestGapS, 0)} s apart`);
    L.push(`median walk ${n(a.drift.pctPerMinute, 3)}% of screen width per minute = ${n(a.drift.medianDegPerMinute, 3)}°/min`);
    L.push(a.drift.medianDegPerMinute < 0.05
      ? 'VERDICT: no meaningful drift — this is what 6DoF is supposed to look like.'
      : 'VERDICT: measurable drift. Compare against the rotation-only A/B before blaming ARCore.');
  }

  if (a.calibration) {
    L.push('');
    L.push('--- CALIBRATION (re-solved offline) ---');
    L.push(`residual ${n(a.calibration.rmsErrorScreenPct)}% of width · scale error ${n(a.calibration.scaleErrorPct)}% · range ${n(a.calibration.rangeM)} m`);
    if (a.calibration.phoneReportedPct !== null) {
      L.push(`phone reported ${n(a.calibration.phoneReportedPct)}% — offline re-solve should match`);
    }
    if (Math.abs(a.calibration.scaleErrorPct) > 5) {
      L.push('NOTE: a large scale error usually means the stated screen size is wrong.');
    }
  }

  if (a.smoothing && a.smoothing.unmeasurable) {
    L.push('');
    L.push('--- SMOOTHING SWEEP ---');
    L.push(`not measurable from this trace (${a.smoothing.stills} still samples, ${a.smoothing.fasts} fast ones).`);
    L.push('Record a session that both parks on a target and sweeps briskly between them.');
  } else if (a.smoothing) {
    L.push('');
    L.push('--- SMOOTHING SWEEP (on this trace) ---');
    const b = a.smoothing.best;
    L.push(`unfiltered jitter ${n(a.smoothing.rawJitterPct, 3)}% of screen width → budget ${n(a.smoothing.jitterBudgetPct, 3)}%`);
    L.push(`best      minCutoff ${b.minCutoff} · beta ${b.beta} → jitter ${n(b.jitterPct, 3)}% · lag ${n(b.lagMs, 1)} ms`);
    L.push(a.smoothing.metBudget
      ? '(the lowest-lag setting that still meets the budget)'
      : '(NO setting met the budget — this phone is noisier than smoothing alone can fix)');
    L.push('');
    L.push('minCutoff  beta   jitter%   lag ms');
    for (const r of a.smoothing.results.filter((r) => r.jitterPct <= a.smoothing.jitterBudgetPct * 2).slice(0, 12)) {
      L.push(`${String(r.minCutoff).padStart(9)}  ${String(r.beta).padStart(4)}   ${n(r.jitterPct).padStart(7)}   ${n(r.lagMs, 1).padStart(6)}`);
    }
    L.push('');
    L.push(`To apply: OneEuro defaults in shared/math.js → minCutoff ${b.minCutoff}, beta ${b.beta}`);
  }
  return L.join('\n');
}

function degToScreenPct(deg, model) {
  const distance = 2.5; // only used when the trace has no better estimate
  const metres = Math.tan((deg * Math.PI) / 180) * distance;
  return (metres / (model.widthM || 1.2)) * 100;
}

/* --------------------------------------------------------------------- CLI */

const isMain = process.argv[1] && process.argv[1].endsWith('analyze-trace.js');
if (isMain) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node tools/analyze-trace.js <lightgun-trace-….json>');
    process.exit(2);
  }
  const trace = parseTrace(readFileSync(file, 'utf8'));
  console.log(formatReport(trace, analyze(trace)));
}
