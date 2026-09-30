import { describe, expect, it } from 'vitest';
import { PuppetSchema, orderParts } from './puppet';
import {
  buildRig,
  capsulePolygon,
  guessKeypoints,
  maskBounds,
  thicknessAt,
  type AlphaMask,
} from './rig';

/** A stick figure mask: head blob, torso column, one arm out to the right, two legs. */
function figure(w = 100, h = 200): AlphaMask {
  const data = new Uint8Array(w * h);
  const set = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < w && y < h) data[y * w + x] = 255;
  };
  for (let y = 10; y < 40; y++) for (let x = 35; x < 65; x++) set(x, y); // head
  for (let y = 40; y < 120; y++) for (let x = 42; x < 58; x++) set(x, y); // torso
  for (let y = 50; y < 60; y++) for (let x = 58; x < 95; x++) set(x, y); // arm (10 px thick)
  for (let y = 120; y < 190; y++) for (let x = 36; x < 46; x++) set(x, y); // left leg
  for (let y = 120; y < 190; y++) for (let x = 54; x < 64; x++) set(x, y); // right leg
  return { width: w, height: h, data };
}

describe('rig helpers', () => {
  it('measures thickness through a point', () => {
    const m = figure();
    expect(thicknessAt(m, [75, 55], 0, 1)).toBe(10); // arm, vertically
    expect(thicknessAt(m, [50, 80], 1, 0)).toBe(16); // torso, horizontally
    expect(thicknessAt(m, [5, 5], 1, 0)).toBe(0);
  });
  it('builds a capsule with round ends', () => {
    const poly = capsulePolygon([0, 0], [100, 0], 10);
    expect(poly.length).toBe(18);
    expect(Math.min(...poly.map((p) => p[0]))).toBeCloseTo(-10, 0);
    expect(Math.max(...poly.map((p) => p[0]))).toBeCloseTo(110, 0);
  });
  it('finds the figure bounds and guesses keypoints inside them', () => {
    const m = figure();
    expect(maskBounds(m)).toEqual({ x: 35, y: 10, w: 60, h: 180 });
    const k = guessKeypoints(m)!;
    expect(k.head[1]).toBeLessThan(k.neck[1]);
    expect(k.neck[1]).toBeLessThan(k.hips[1]);
    expect(k.leftFoot![1]).toBeGreaterThan(k.hips[1]);
    expect(k.shoulder[0]).toBeGreaterThan(k.neck[0] - 30);
  });
});

describe('buildRig', () => {
  const m = figure();
  const rig = buildRig({
    id: 'kedi',
    name: 'Kedi',
    image: 'data:image/png;base64,AAAA',
    width: 100,
    height: 200,
    mask: m,
    keypoints: {
      head: [50, 10],
      neck: [50, 40],
      shoulder: [58, 55],
      hand: [92, 55],
      hips: [50, 120],
      leftFoot: [41, 188],
      rightFoot: [59, 188],
    },
  });
  it('is a valid puppet that hangs from the neck', () => {
    const parsed = PuppetSchema.parse(rig);
    expect(parsed.id).toBe('custom:kedi');
    expect(parsed.rod).toEqual([50, 40]);
    expect(parsed.image).toBeDefined();
    expect(orderParts(parsed)[0]!.id).toBe('body');
  });
  it('has head, arm and two legs with the right drivers', () => {
    const byId = Object.fromEntries(rig.parts.map((p) => [p.id, p]));
    expect(byId.head?.driver).toBe('talk');
    expect(byId.arm?.driver).toBe('arm');
    expect(byId.arm?.gain).toBeLessThan(0); // arm points right: negative gain raises it
    expect(byId['leg-left']?.driver).toBe('stride');
    expect(byId['leg-right']?.driver).toBe('stride-inverse');
    expect(byId.arm?.pivot).toEqual([58, 55]);
  });
  it('sizes the arm strip from the mask thickness', () => {
    const arm = rig.parts.find((p) => p.id === 'arm')!;
    const ys = arm.polygon!.map((p) => p[1]);
    const halfWidth = (Math.max(...ys) - Math.min(...ys)) / 2;
    expect(halfWidth).toBeGreaterThan(5);
    expect(halfWidth).toBeLessThan(10);
  });
  it('skips legs when no feet were given', () => {
    const noLegs = buildRig({
      id: 'x',
      name: 'x',
      image: 'data:',
      width: 100,
      height: 200,
      keypoints: {
        head: [50, 10],
        neck: [50, 40],
        shoulder: [58, 55],
        hand: [92, 55],
        hips: [50, 120],
      },
    });
    expect(noLegs.parts.map((p) => p.id)).toEqual(['body', 'head', 'arm']);
  });
});
