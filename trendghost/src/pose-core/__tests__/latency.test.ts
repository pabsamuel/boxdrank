import { describe, expect, it } from 'vitest';
import { LatencyTracker } from '../latency';

describe('latency tracking', () => {
  it('uses the configured default until it has real measurements', () => {
    const tracker = new LatencyTracker(70);
    expect(tracker.milliseconds).toBe(70);
    expect(tracker.measured).toBe(false);

    tracker.record(40);
    tracker.record(42);
    expect(tracker.milliseconds).toBe(70);
  });

  it('switches to the measured median once it has enough samples', () => {
    const tracker = new LatencyTracker(70);
    for (const ms of [40, 44, 41, 43, 42]) tracker.record(ms);
    expect(tracker.measured).toBe(true);
    expect(tracker.milliseconds).toBe(42);
  });

  it('is not dragged around by one stalled frame', () => {
    const tracker = new LatencyTracker(70);
    for (const ms of [40, 41, 42, 43, 44]) tracker.record(ms);
    tracker.record(2000); // a GC pause or thermal hiccup
    expect(tracker.milliseconds).toBeLessThan(60);
  });

  it('follows the device as it changes', () => {
    const tracker = new LatencyTracker(70);
    for (let i = 0; i < 40; i += 1) tracker.record(40);
    expect(tracker.milliseconds).toBe(40);
    for (let i = 0; i < 40; i += 1) tracker.record(90);
    expect(tracker.milliseconds).toBe(90);
  });

  it('ignores nonsense', () => {
    const tracker = new LatencyTracker(70);
    for (let i = 0; i < 10; i += 1) tracker.record(50);
    tracker.record(Number.NaN);
    tracker.record(-5);
    expect(tracker.milliseconds).toBe(50);
  });
});
