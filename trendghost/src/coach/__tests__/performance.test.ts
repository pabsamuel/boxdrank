import { describe, expect, it } from 'vitest';
import { PerformanceWatch, REDUCE_BELOW_HZ, SUSTAINED_MS } from '../performance';

describe('reduced mode trigger', () => {
  it('does not trigger on a brief dip while the model warms up', () => {
    const watch = new PerformanceWatch();
    expect(watch.record(4, 0)).toBe(false);
    expect(watch.record(6, 1000)).toBe(false);
    expect(watch.record(25, 2000)).toBe(false);
    expect(watch.record(5, 3000)).toBe(false);
    expect(watch.record(5, 4000)).toBe(false);
  });

  it('triggers once the device has been too slow for long enough', () => {
    const watch = new PerformanceWatch();
    expect(watch.record(5, 0)).toBe(false);
    expect(watch.record(5, SUSTAINED_MS - 1)).toBe(false);
    expect(watch.record(5, SUSTAINED_MS)).toBe(true);
  });

  it('only fires once — the user is not told twice', () => {
    const watch = new PerformanceWatch();
    watch.record(5, 0);
    expect(watch.record(5, SUSTAINED_MS)).toBe(true);
    expect(watch.record(2, SUSTAINED_MS * 3)).toBe(false);
  });

  it('a recovery resets the clock', () => {
    const watch = new PerformanceWatch();
    watch.record(5, 0);
    watch.record(30, 2000); // recovered
    expect(watch.record(5, 4000)).toBe(false);
    expect(watch.record(5, 8999)).toBe(false); // only 5s since it went bad again
    expect(watch.record(5, 9000)).toBe(true);
  });

  it('a device comfortably above the floor never triggers', () => {
    const watch = new PerformanceWatch();
    for (let t = 0; t < 60_000; t += 500) {
      expect(watch.record(REDUCE_BELOW_HZ + 1, t)).toBe(false);
    }
  });
});
