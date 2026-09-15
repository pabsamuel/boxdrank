import { describe, expect, it } from 'vitest';
import { findDips } from '../TakeReview';

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
