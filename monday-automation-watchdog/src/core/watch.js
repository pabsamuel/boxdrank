/**
 * Joins signal extraction to cadence analysis and produces the thing a person
 * actually reads: what is quiet, and how worried to be.
 */

import { extractSignals } from './signals.js';
import { analyzeCadence } from './cadence.js';

/** Worst first. 'dormant' outranks 'healthy' only because it is worth a glance. */
export const STATUS_RANK = {
  silent: 0,
  late: 1,
  dormant: 2,
  healthy: 3,
  insufficient_history: 4,
};

/**
 * @param {object[]} entries Activity-log entries.
 * @param {number} now Epoch ms.
 * @param {object} [options] Passed through to extractSignals.
 */
export function watch(entries, now, options = {}) {
  return extractSignals(entries, options)
    .map((signal) => ({ ...signal, ...analyzeCadence(signal.timestamps, now) }))
    .sort(
      (a, b) =>
        STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
        b.activeElapsedMs - a.activeElapsedMs ||
        a.label.localeCompare(b.label),
    );
}

/**
 * Counts for the header, and the one number that decides whether to send an
 * email at all.
 *
 * A watchdog that emails "everything is fine" every morning gets filtered into a
 * folder nobody reads, taking the real alerts with it. `shouldAlert` is false
 * unless something is actually silent.
 */
export function summarize(results) {
  const counts = Object.fromEntries(Object.keys(STATUS_RANK).map((status) => [status, 0]));
  for (const result of results) counts[result.status] += 1;

  return {
    watched: results.length,
    counts,
    shouldAlert: counts.silent > 0,
  };
}
