import { describe, expect, it } from 'vitest';
import { NEUTRAL_POSE } from '@perde/shared';
import {
  DEFAULT_TUNING,
  MotionModel,
  TrackedAxis,
  accelInWorld,
  gravityInDevice,
  headingDeg,
  headingDelta,
  leanDeg,
  pitchDeg,
  poseChanged,
  rotationMatrix,
} from './motion';

const UPRIGHT = rotationMatrix(0, 90, 0);
const FLAT = rotationMatrix(0, 0, 0);

describe('orientation maths', () => {
  const near = (v: number[], e: number[]) => v.forEach((n, i) => expect(n).toBeCloseTo(e[i]!, 6));
  it('knows which way is down', () => {
    near(gravityInDevice(FLAT), [0, 0, -1]);
    near(gravityInDevice(UPRIGHT), [0, -1, 0]);
  });
  it('an upright phone has no lean, no pitch, heading 0', () => {
    expect(Math.abs(leanDeg(UPRIGHT))).toBeLessThan(1e-6);
    expect(Math.abs(pitchDeg(UPRIGHT))).toBeLessThan(1e-6);
    expect(Math.abs(headingDeg(UPRIGHT))).toBeLessThan(1e-6);
  });
  it('a flat phone is fully tipped back', () => {
    expect(pitchDeg(FLAT)).toBeCloseTo(90, 5);
  });
  it('heading survives the gimbal lock: alpha and gamma add up when upright', () => {
    expect(headingDeg(rotationMatrix(10, 90, 0))).toBeCloseTo(-10, 5);
    expect(headingDeg(rotationMatrix(0, 90, 10))).toBeCloseTo(-10, 5);
    expect(headingDeg(rotationMatrix(7, 90, 3))).toBeCloseTo(-10, 5);
  });
  it('rolling an upright phone reads as lean with the top going right = positive', () => {
    // Rotate the device frame about its own screen normal; negative = top goes right.
    const rollAboutScreen = (R: number[], deg: number) => {
      const c = Math.cos(deg * (Math.PI / 180));
      const s = Math.sin(deg * (Math.PI / 180));
      const Rz = [c, -s, 0, s, c, 0, 0, 0, 1];
      const out = new Array<number>(9).fill(0);
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++)
          for (let k = 0; k < 3; k++) out[i * 3 + j]! += R[i * 3 + k]! * Rz[k * 3 + j]!;
      return out;
    };
    expect(leanDeg(rollAboutScreen(UPRIGHT, -20))).toBeCloseTo(20, 5);
    expect(leanDeg(rollAboutScreen(UPRIGHT, 20))).toBeCloseTo(-20, 5);
    // The same roll on a phone that is also tipped back 25° still reads as ~20°.
    expect(leanDeg(rollAboutScreen(rotationMatrix(0, 65, 0), -20))).toBeCloseTo(20, 0);
  });
  it('wraps heading deltas', () => {
    expect(headingDelta(350, 10)).toBe(-20);
    expect(headingDelta(10, 350)).toBe(20);
  });
  it("maps device acceleration to the holder's right and up", () => {
    const a = accelInWorld(UPRIGHT, 2, 0, 0);
    expect(a.lateral).toBeCloseTo(2, 5);
    expect(a.up).toBeCloseTo(0, 5);
    const b = accelInWorld(UPRIGHT, 0, 3, 0);
    expect(b.up).toBeCloseTo(3, 5);
    expect(b.lateral).toBeCloseTo(0, 5);
  });
});

describe('TrackedAxis', () => {
  const axis = () =>
    new TrackedAxis({ deadband: 0.35, stillAfter: 0.12, leak: 0.8, min: -0.25, max: 0.25 });
  it('moves on a push and holds when the hand stops', () => {
    const a = axis();
    for (let i = 0; i < 10; i++) a.step(3, 0.02); // 0.2 s at 3 m/s²
    for (let i = 0; i < 10; i++) a.step(-3, 0.02); // brake
    const after = a.p;
    expect(after).toBeGreaterThan(0.03);
    for (let i = 0; i < 20; i++) a.step(0.1, 0.02); // still (inside deadband)
    expect(a.v).toBe(0);
    expect(Math.abs(a.p - after)).toBeLessThan(0.02);
  });
  it('clamps at the bounds and comes straight back', () => {
    const a = axis();
    for (let i = 0; i < 100; i++) a.step(5, 0.02);
    expect(a.p).toBe(0.25);
    for (let i = 0; i < 5; i++) a.step(-5, 0.02);
    expect(a.p).toBeLessThan(0.25);
  });
  it('a wall kills momentum so the way back is immediate', () => {
    const a = axis();
    for (let i = 0; i < 100; i++) a.step(5, 0.02);
    expect(a.v).toBe(0);
  });
});

describe('MotionModel', () => {
  const still = { ax: 0, ay: 0, az: 0, dt: 1 / 60 };
  it('turns the arm into stage position after recentring', () => {
    const m = new MotionModel({ ...DEFAULT_TUNING, smoothing: 0 });
    m.update({ alpha: 0, beta: 90, gamma: 0, ...still });
    m.recenter();
    m.update({ alpha: -22.5, beta: 90, gamma: 0, ...still }); // turn right by 22.5°
    const p = m.pose(null, false);
    expect(p.x).toBeCloseTo(0.5, 1);
    expect(m.pose(null, false).lean).toBe(0);
  });
  it('slides with a sideways push of the hand', () => {
    const m = new MotionModel({ ...DEFAULT_TUNING, smoothing: 0, yawRangeDeg: 45, travelCm: 25 });
    m.update({ alpha: 0, beta: 90, gamma: 0, ...still });
    m.recenter();
    for (let i = 0; i < 12; i++)
      m.update({ alpha: 0, beta: 90, gamma: 0, ax: 4, ay: 0, az: 0, dt: 0.02 });
    for (let i = 0; i < 12; i++)
      m.update({ alpha: 0, beta: 90, gamma: 0, ax: -4, ay: 0, az: 0, dt: 0.02 });
    expect(m.pose(null, false).x).toBeGreaterThan(0.15);
    expect(m.current().lateralCm).toBeGreaterThan(4);
  });
  it('honours invertX and the iOS acceleration sign', () => {
    const m = new MotionModel({ ...DEFAULT_TUNING, smoothing: 0, invertX: true, accelSign: -1 });
    m.update({ alpha: 0, beta: 90, gamma: 0, ...still });
    m.recenter();
    for (let i = 0; i < 12; i++)
      m.update({ alpha: 0, beta: 90, gamma: 0, ax: -4, ay: 0, az: 0, dt: 0.02 });
    for (let i = 0; i < 12; i++)
      m.update({ alpha: 0, beta: 90, gamma: 0, ax: 4, ay: 0, az: 0, dt: 0.02 });
    // sign flip makes it a rightward push; invertX sends the puppet left
    expect(m.pose(null, false).x).toBeLessThan(-0.15);
  });
  it('touch overrides and leaves an offset behind', () => {
    const m = new MotionModel({ ...DEFAULT_TUNING, smoothing: 0 });
    m.update({ alpha: 0, beta: 90, gamma: 0, ...still });
    m.recenter();
    expect(m.pose(0.8, false).x).toBe(0.8);
    expect(m.pose(null, false).x).toBe(0.8);
    m.recenter();
    expect(m.pose(null, false).x).toBe(0);
  });
  it('raises the arm when the phone tips back and hops on an upward push', () => {
    const m = new MotionModel({ ...DEFAULT_TUNING, smoothing: 0, armRangeDeg: 40, hopCm: 10 });
    m.update({ alpha: 0, beta: 90, gamma: 0, ...still });
    m.recenter();
    m.update({ alpha: 0, beta: 60, gamma: 0, ...still }); // tipped back 30°
    expect(m.pose(null, false).arm).toBeGreaterThan(0.5);
    for (let i = 0; i < 8; i++)
      m.update({ alpha: 0, beta: 90, gamma: 0, ax: 0, ay: 6, az: 0, dt: 0.02 });
    expect(m.pose(null, false).y).toBeGreaterThan(0.2);
  });
  it('turns on a sharp wrist twist (once) and bows when tipped well forward', () => {
    const m = new MotionModel({ ...DEFAULT_TUNING, smoothing: 0 });
    m.update({ alpha: 0, beta: 90, gamma: 0, ...still });
    m.recenter();
    for (let i = 0; i < 5; i++)
      m.update({ alpha: 0, beta: 90, gamma: 0, ...still, twistRate: 500 });
    expect(m.takeGestures()).toEqual(['turn']);
    expect(m.takeGestures()).toEqual([]);
    m.update({ alpha: 0, beta: 130, gamma: 0, ...still }); // top tipped 40° toward the TV
    expect(m.takeGestures()).toEqual(['bow']);
    m.update({ alpha: 0, beta: 130, gamma: 0, ...still });
    expect(m.takeGestures()).toEqual([]);
    m.update({ alpha: 0, beta: 90, gamma: 0, ...still });
    m.update({ alpha: 0, beta: 130, gamma: 0, ...still });
    expect(m.takeGestures()).toEqual(['bow']);
  });
  it('detects meaningful change only', () => {
    expect(poseChanged(NEUTRAL_POSE, { ...NEUTRAL_POSE, x: 0.001 })).toBe(false);
    expect(poseChanged(NEUTRAL_POSE, { ...NEUTRAL_POSE, talking: true })).toBe(true);
  });
});
