import { describe, expect, it } from 'vitest';
import { MIN_CONFIDENCE, detectBeats, onsetEnvelope } from '../beats';

const RATE = 44100;

/** A click track: short percussive bursts at a fixed tempo, plus optional noise. */
function clickTrack(bpm: number, seconds: number, noise = 0, offsetSec = 0): Float32Array {
  const samples = new Float32Array(Math.floor(RATE * seconds));
  const period = (60 / bpm) * RATE;

  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = noise > 0 ? (Math.random() * 2 - 1) * noise : 0;
  }

  for (let beat = offsetSec * RATE; beat < samples.length; beat += period) {
    const start = Math.floor(beat);
    // ~20ms decaying burst, like a kick drum.
    for (let i = 0; i < RATE * 0.02 && start + i < samples.length; i += 1) {
      const decay = 1 - i / (RATE * 0.02);
      samples[start + i]! += Math.sin((i / RATE) * 2 * Math.PI * 120) * decay;
    }
  }

  return samples;
}

describe('beat detection', () => {
  it('finds the tempo of a clean 120 BPM track', () => {
    const grid = detectBeats(clickTrack(120, 8), RATE);
    expect(grid.confidence).toBeGreaterThan(MIN_CONFIDENCE);
    expect(grid.bpm).toBeGreaterThan(115);
    expect(grid.bpm).toBeLessThan(125);
  });

  it('finds a slower tempo too', () => {
    const grid = detectBeats(clickTrack(90, 10), RATE);
    expect(grid.confidence).toBeGreaterThan(MIN_CONFIDENCE);
    expect(grid.bpm).toBeGreaterThan(86);
    expect(grid.bpm).toBeLessThan(94);
  });

  it('puts the beats on the actual hits, not just at the right spacing', () => {
    const grid = detectBeats(clickTrack(120, 8), RATE);
    const period = 0.5;

    // Every detected beat should sit close to a multiple of the true period.
    for (const beat of grid.beats.slice(0, 8)) {
      const distance = Math.abs(beat - Math.round(beat / period) * period);
      expect(distance, `beat at ${beat.toFixed(3)}s is off-grid`).toBeLessThan(0.06);
    }
    expect(grid.beats.length).toBeGreaterThan(10);
  });

  it('survives a noisy recording', () => {
    const grid = detectBeats(clickTrack(128, 8, 0.15), RATE);
    expect(grid.confidence).toBeGreaterThan(MIN_CONFIDENCE);
    expect(grid.bpm).toBeGreaterThan(122);
    expect(grid.bpm).toBeLessThan(134);
  });

  it('reports no grid for noise — a wrong grid is worse than none', () => {
    const noise = new Float32Array(RATE * 6);
    for (let i = 0; i < noise.length; i += 1) noise[i] = Math.random() * 2 - 1;

    const grid = detectBeats(noise, RATE);
    expect(grid.confidence).toBeLessThan(MIN_CONFIDENCE);
    expect(grid.beats).toHaveLength(0);
  });

  it('reports no grid for silence', () => {
    const grid = detectBeats(new Float32Array(RATE * 4), RATE);
    expect(grid.beats).toHaveLength(0);
  });

  it('handles empty input without throwing', () => {
    expect(detectBeats(new Float32Array(0), RATE).beats).toHaveLength(0);
    expect(detectBeats(new Float32Array(100), 0).beats).toHaveLength(0);
  });

  it('onset envelope spikes at the hits and is quiet between them', () => {
    const envelope = onsetEnvelope(downmixTo11k(clickTrack(120, 4)));
    const frameRate = 11025 / 256;

    // The rise can land on either side of the exact frame, so compare a small
    // window at the beat against the same-sized window halfway between beats.
    const peakNear = (seconds: number) => {
      const centre = Math.round(seconds * frameRate);
      let peak = 0;
      for (let f = centre - 1; f <= centre + 1; f += 1) peak = Math.max(peak, envelope[f] ?? 0);
      return peak;
    };

    expect(peakNear(0.5)).toBeGreaterThan(peakNear(0.75));
    expect(peakNear(1.0)).toBeGreaterThan(peakNear(1.25));
  });
});

/** The detector downsamples internally; this mirrors it for the envelope test. */
function downmixTo11k(samples: Float32Array): Float32Array {
  const ratio = RATE / 11025;
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
