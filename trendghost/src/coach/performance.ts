/**
 * Watching whether this device can actually keep up (PERFORMANCE_BUDGET.md,
 * "Reduced mode").
 *
 * If inference collapses we drop the ghost video layer and keep the skeleton,
 * rather than letting the user conclude the app is broken. The app says it
 * switched, and why — a silent degradation is its own kind of lie.
 */

/** Below this inference rate the feedback stops feeling live. */
export const REDUCE_BELOW_HZ = 12;
/** It has to stay bad this long: a brief dip while the model warms up is normal. */
export const SUSTAINED_MS = 5000;

export class PerformanceWatch {
  private badSince: number | null = null;
  private triggered = false;

  /** @returns true the moment reduced mode should be switched on. */
  record(inferenceHz: number, now: number): boolean {
    if (this.triggered) return false;

    if (inferenceHz >= REDUCE_BELOW_HZ) {
      this.badSince = null;
      return false;
    }

    // Ignore the very first samples, before the model has warmed up.
    this.badSince ??= now;
    if (now - this.badSince >= SUSTAINED_MS) {
      this.triggered = true;
      return true;
    }
    return false;
  }

  reset(): void {
    this.badSince = null;
    this.triggered = false;
  }
}
