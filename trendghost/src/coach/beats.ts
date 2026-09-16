/**
 * Beat detection (CUE_ENGINE.md "Beat alignment").
 *
 * Trends are choreographed to a beat, so a "cut it" that lands ON the beat feels
 * professional and one that lands between beats feels broken. This finds the
 * grid; `buildCueTrack` snaps cues to it when confidence is high enough.
 *
 * Pure DSP over raw PCM — no Web Audio, no DOM — so it is unit testable with a
 * synthetic click track (DECISIONS.md D2).
 */

/** Analysis rate. Dance tempo detection needs envelope shape, not fidelity. */
const ANALYSIS_RATE = 11025;
const HOP = 256; // ~23ms per frame at 11025Hz
const MIN_BPM = 70;
const MAX_BPM = 180;

export interface BeatGrid {
  /** Beat times in seconds from the start. Empty when we could not find a grid. */
  beats: number[];
  bpm: number;
  /**
   * 0..1. How much stronger the winning tempo was than the field. Below
   * `MIN_CONFIDENCE` we return no beats rather than a wrong grid — snapping cues
   * to a wrong grid is worse than not snapping at all.
   */
  confidence: number;
}

export const MIN_CONFIDENCE = 0.35;

/**
 * @param samples mono or interleaved PCM, any sample rate
 * @param sampleRate samples per second
 */
export function detectBeats(samples: Float32Array, sampleRate: number): BeatGrid {
  const empty: BeatGrid = { beats: [], bpm: 0, confidence: 0 };
  if (samples.length === 0 || sampleRate <= 0) return empty;

  const mono = downsample(samples, sampleRate, ANALYSIS_RATE);
  const envelope = onsetEnvelope(mono);
  if (envelope.length < 16) return empty;

  const frameRate = ANALYSIS_RATE / HOP;
  const { period, confidence } = estimatePeriod(envelope, frameRate);
  if (period <= 0 || confidence < MIN_CONFIDENCE) {
    return { beats: [], bpm: period > 0 ? 60 / (period / frameRate) : 0, confidence };
  }

  const offset = estimatePhase(envelope, period);
  const beats: number[] = [];
  const duration = mono.length / ANALYSIS_RATE;
  for (let frame = offset; frame / frameRate < duration; frame += period) {
    beats.push(frame / frameRate);
  }

  return { beats, bpm: 60 / (period / frameRate), confidence };
}

/** Crude but adequate: average consecutive samples down to the analysis rate. */
function downsample(samples: Float32Array, from: number, to: number): Float32Array {
  if (from <= to) return samples;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(samples.length / ratio));
  for (let i = 0; i < out.length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += samples[j]!;
    out[i] = end > start ? sum / (end - start) : 0;
  }
  return out;
}

/**
 * Onset strength: rise in short-term energy, half-wave rectified. Percussive hits
 * (what a dance beat is made of) show up as sharp positive jumps.
 */
export function onsetEnvelope(mono: Float32Array): Float32Array {
  const frames = Math.floor(mono.length / HOP);
  if (frames < 2) return new Float32Array(0);

  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f += 1) {
    let sum = 0;
    const start = f * HOP;
    for (let i = start; i < start + HOP; i += 1) {
      const s = mono[i] ?? 0;
      sum += s * s;
    }
    // Log energy compresses dynamics so a loud chorus does not swamp a quiet verse.
    energy[f] = Math.log1p((sum / HOP) * 1000);
  }

  const flux = new Float32Array(frames);
  for (let f = 1; f < frames; f += 1) {
    const rise = energy[f]! - energy[f - 1]!;
    flux[f] = rise > 0 ? rise : 0;
  }

  return normalise(flux);
}

function normalise(values: Float32Array): Float32Array {
  let max = 0;
  for (const v of values) if (v > max) max = v;
  if (max === 0) return values;
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i += 1) out[i] = values[i]! / max;
  return out;
}

/**
 * Autocorrelate the onset envelope and take the strongest lag in the plausible
 * tempo range. Confidence is how far that peak stands above the average lag,
 * which is what separates "there is a beat" from "this is just noise".
 */
function estimatePeriod(
  envelope: Float32Array,
  frameRate: number,
): { period: number; confidence: number } {
  const minLag = Math.floor((60 / MAX_BPM) * frameRate);
  const maxLag = Math.min(Math.ceil((60 / MIN_BPM) * frameRate), Math.floor(envelope.length / 2));
  if (maxLag <= minLag) return { period: 0, confidence: 0 };

  const scores = new Float32Array(maxLag + 1);
  let bestLag = 0;
  let bestScore = 0;
  let total = 0;
  let count = 0;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0;
    for (let i = 0; i + lag < envelope.length; i += 1) sum += envelope[i]! * envelope[i + lag]!;
    const score = sum / (envelope.length - lag);
    scores[lag] = score;
    total += score;
    count += 1;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  const mean = count > 0 ? total / count : 0;
  if (bestScore <= 0 || mean <= 0) return { period: 0, confidence: 0 };

  // How many times stronger than an average lag, mapped into 0..1.
  const ratio = bestScore / mean;
  const confidence = Math.max(0, Math.min(1, (ratio - 1) / 2));

  return { period: refinePeak(scores, bestLag, minLag, maxLag), confidence };
}

/**
 * Sub-frame refinement of the autocorrelation peak.
 *
 * At ~23ms per frame, an integer period is up to half a frame wrong per beat,
 * and that error ACCUMULATES: by the tenth beat the grid can be over 100ms out,
 * which is audible and would put every cue slightly off. Fitting a parabola to
 * the peak and its neighbours recovers the fractional period.
 */
function refinePeak(scores: Float32Array, peak: number, minLag: number, maxLag: number): number {
  if (peak <= minLag || peak >= maxLag) return peak;
  const before = scores[peak - 1]!;
  const at = scores[peak]!;
  const after = scores[peak + 1]!;
  const denominator = before - 2 * at + after;
  if (denominator === 0) return peak;
  const adjustment = (0.5 * (before - after)) / denominator;
  return peak + Math.max(-0.5, Math.min(0.5, adjustment));
}

/**
 * Where the grid starts: the offset whose beat positions collect the most onset.
 * Searched at quarter-frame resolution so the phase is not itself quantised.
 */
function estimatePhase(envelope: Float32Array, period: number): number {
  let bestOffset = 0;
  let bestSum = -1;
  const step = 0.25;

  for (let offset = 0; offset < period; offset += step) {
    let sum = 0;
    for (let frame = offset; frame < envelope.length; frame += period) {
      // Onset energy lands on the frame containing the hit and often the next
      // one, so take the stronger of the two straddling this position.
      const low = envelope[Math.floor(frame)] ?? 0;
      const high = envelope[Math.ceil(frame)] ?? 0;
      sum += Math.max(low, high);
    }
    if (sum > bestSum) {
      bestSum = sum;
      bestOffset = offset;
    }
  }

  return bestOffset;
}
