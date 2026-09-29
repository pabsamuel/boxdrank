import { describe, expect, it } from 'vitest';
import { NEUTRAL_POSE } from '@perde/shared';
import { computePose, headingDelta, poseChanged, DEFAULT_CALIBRATION } from './motion';

const base = {
  calibration: DEFAULT_CALIBRATION,
  bounce: 0,
  touchX: null,
  talking: false,
  prev: NEUTRAL_POSE,
};

describe('motion mapping', () => {
  it('wraps heading deltas', () => {
    expect(headingDelta(350, 10)).toBe(-20);
    expect(headingDelta(10, 350)).toBe(20);
  });
  it('leans with sideways tilt and ignores the deadzone', () => {
    expect(computePose({ ...base, orientation: { alpha: 0, beta: 40, gamma: 2 } }).lean).toBe(0);
    const p = computePose({ ...base, orientation: { alpha: 0, beta: 40, gamma: 30 } });
    expect(p.lean).toBeGreaterThan(0.2);
  });
  it('raises the arm when the phone tips back from the calibrated pitch', () => {
    const p = computePose({ ...base, orientation: { alpha: 0, beta: 0, gamma: 0 } });
    expect(p.arm).toBeGreaterThan(0.2);
  });
  it('touch overrides yaw for x', () => {
    const yaw = computePose({ ...base, orientation: { alpha: 30, beta: 40, gamma: 0 } });
    expect(yaw.x).toBeLessThan(0);
    const touch = computePose({
      ...base,
      orientation: { alpha: 30, beta: 40, gamma: 0 },
      touchX: 0.9,
    });
    expect(touch.x).toBeGreaterThan(0.2);
  });
  it('hops on a bounce and decays', () => {
    const up = computePose({
      ...base,
      orientation: { alpha: null, beta: null, gamma: null },
      bounce: 7,
    });
    expect(up.y).toBeGreaterThan(0.5);
    const down = computePose({
      ...base,
      orientation: { alpha: null, beta: null, gamma: null },
      prev: up,
    });
    expect(down.y).toBeLessThan(up.y);
  });
  it('detects meaningful change only', () => {
    expect(poseChanged(NEUTRAL_POSE, { ...NEUTRAL_POSE, x: 0.001 })).toBe(false);
    expect(poseChanged(NEUTRAL_POSE, { ...NEUTRAL_POSE, talking: true })).toBe(true);
  });
});
