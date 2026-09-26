/**
 * Keeps a short record of when checks ran, and notices when they stop.
 *
 * **Who watches the watchdog.** Every failure this product detects is a silent
 * one, so the worst thing it can do is fail silently itself. A scheduled job
 * that stops firing — a crashed worker, a revoked token, an uninstalled
 * integration — produces exactly the same experience as an account where
 * nothing is broken: a calm screen and no email. The user has no way to tell
 * those apart, and the calm screen is the more convincing of the two.
 *
 * So the UI must be able to say "last checked 20 minutes ago" and, when that
 * stops being true, say so loudly and without being asked.
 */

const HOUR = 3600_000;

/**
 * How many runs to keep. Enough to show a short history and to tell a regular
 * cadence from a sputtering one; short enough that stored state stays small.
 */
export const MAX_RUNS = 20;

/** A check is expected roughly daily; the schedule is configurable, this is the default. */
export const DEFAULT_INTERVAL_MS = 24 * HOUR;

/**
 * How far past the expected interval before the checks themselves are called
 * stale. Two and a half intervals tolerates one missed run plus slippage, and
 * still notices a job that has genuinely stopped.
 */
export const STALE_MULTIPLIER = 2.5;

/**
 * Appends a run, keeping the newest MAX_RUNS.
 *
 * @param {{at: number, watched: number, silent: number, sent: boolean, error?: string|null}[]} history
 * @param {object} entry
 * @returns {object[]} Newest first.
 */
export function recordRun(history, entry) {
  return [entry, ...(history ?? [])].slice(0, MAX_RUNS);
}

/**
 * What to tell the user about the checks themselves.
 *
 * @param {object[]} history Newest first.
 * @param {number} now
 * @param {number} [expectedIntervalMs]
 */
export function summarizeRuns(history, now, expectedIntervalMs = DEFAULT_INTERVAL_MS) {
  const runs = history ?? [];
  const last = runs[0] ?? null;

  if (!last) {
    // Never having run is not the same as being overdue, and saying "overdue"
    // to someone who installed the app a minute ago is wrong and alarming.
    return {
      lastRunAt: null,
      sinceLastMs: null,
      isStale: false,
      neverRun: true,
      consecutiveErrors: 0,
      expectedIntervalMs,
    };
  }

  let consecutiveErrors = 0;
  for (const run of runs) {
    if (!run.error) break;
    consecutiveErrors += 1;
  }

  const sinceLastMs = now - last.at;

  return {
    lastRunAt: last.at,
    sinceLastMs,
    isStale: sinceLastMs > expectedIntervalMs * STALE_MULTIPLIER,
    neverRun: false,
    // A run that happened but failed every time is a different problem from a
    // run that never happened, and needs saying differently.
    consecutiveErrors,
    lastError: last.error ?? null,
    expectedIntervalMs,
  };
}
