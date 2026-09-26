/**
 * Measuring the real capture -> result latency (POSE_MATCHING.md §6, §8).
 *
 * Scoring compares a camera frame against the reference frame at the time that
 * camera frame was CAPTURED, so this number has to be right: too small and
 * feedback lags the ghost, too large and it leads it. The spec says measure it,
 * never guess — this keeps a rolling median of real measurements.
 *
 * Median, not mean: one stalled frame (a GC pause, a thermal hiccup) would drag
 * a mean around for seconds.
 */

const WINDOW = 30;

export class LatencyTracker {
  private samples: number[] = [];

  constructor(private fallbackMs: number) {}

  /** One measurement: how long after capture the result became usable. */
  record(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.samples.push(ms);
    if (this.samples.length > WINDOW) this.samples.shift();
  }

  /** Best current estimate; the configured default until we have real data. */
  get milliseconds(): number {
    if (this.samples.length < 5) return this.fallbackMs;
    const sorted = [...this.samples].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)]!;
  }

  get measured(): boolean {
    return this.samples.length >= 5;
  }

  reset(): void {
    this.samples = [];
  }
}
