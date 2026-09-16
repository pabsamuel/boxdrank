import { describe, expect, it } from 'vitest';
import { findDips, worstLimbsAt } from '../TakeReview';

describe('take review dips', () => {
  it('marks the moments the user drifted, not every single low frame', () => {
    const scores = Array.from({ length: 120 }, (_, i) => ({
      t: i / 30,
      // Good throughout, except a clear slump around 1.5s.
      score: i >= 42 && i <= 54 ? 0.3 : 0.9,
    }));

    const dips = findDips(scores);

    expect(dips.length).toBeGreaterThan(0);
    expect(dips[0]!.t).toBeGreaterThan(1.2);
    expect(dips[0]!.t).toBeLessThan(2.0);
    expect(dips[0]!.score).toBeLessThan(0.6);
  });

  it('never reports the same dip three times', () => {
    const scores = Array.from({ length: 90 }, (_, i) => ({
      t: i / 30,
      score: i > 40 ? 0.2 : 0.95,
    }));
    const dips = findDips(scores);
    const gaps = dips.slice(1).map((d, i) => d.t - dips[i]!.t);
    for (const gap of gaps) expect(gap).toBeGreaterThan(1);
  });

  it('handles a take with nothing scored', () => {
    expect(findDips([{ t: 0, score: null }])).toEqual([]);
  });
});

describe('worst limbs at a moment', () => {
  const frames = [
    { t: 1.0, score: 0.5, segments: { forearmL: 0.2, upperArmR: 0.9, thighL: 0.85 } },
    { t: 1.1, score: 0.5, segments: { forearmL: 0.25, upperArmR: 0.88, thighL: 0.8 } },
    { t: 1.2, score: 0.5, segments: { forearmL: 0.15, upperArmR: 0.92, thighL: 0.9 } },
    // Far away in time — must not influence the answer.
    { t: 5.0, score: 0.9, segments: { forearmL: 0.99, upperArmR: 0.2, thighL: 0.99 } },
  ];

  it('names the limb that actually went wrong', () => {
    const worst = worstLimbsAt(frames, 1.1);
    expect(worst[0]!.segment).toBe('forearmL');
    expect(worst[0]!.score).toBeLessThan(0.3);
  });

  it('averages over a window, so one bad frame is not the whole story', () => {
    const blip = [
      { t: 2.0, score: 0.9, segments: { forearmL: 0.95 } },
      { t: 2.1, score: 0.2, segments: { forearmL: 0.05 } }, // single-frame tracking blip
      { t: 2.2, score: 0.9, segments: { forearmL: 0.95 } },
    ];
    const worst = worstLimbsAt(blip, 2.1);
    expect(worst[0]!.score).toBeGreaterThan(0.5);
  });

  it('ignores frames far from the moment asked about', () => {
    const worst = worstLimbsAt(frames, 5.0);
    expect(worst[0]!.segment).toBe('upperArmR');
  });

  it('returns nothing when a take has no per-limb detail', () => {
    expect(worstLimbsAt([{ t: 1, score: 0.5 }], 1)).toEqual([]);
  });
});
