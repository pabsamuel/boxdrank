import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordRun, summarizeRuns, MAX_RUNS, DEFAULT_INTERVAL_MS, STALE_MULTIPLIER } from '../src/core/run-log.js';

const HOUR = 3600_000;
const NOW = Date.UTC(2026, 8, 20, 9, 0, 0);
const run = (at, over = {}) => ({ at, watched: 6, silent: 0, sent: false, ...over });

test('runs are kept newest first and capped', () => {
  let history = [];
  for (let i = 0; i < MAX_RUNS + 10; i += 1) history = recordRun(history, run(NOW + i * HOUR));
  assert.equal(history.length, MAX_RUNS);
  assert.equal(history[0].at, NOW + (MAX_RUNS + 9) * HOUR, 'newest first');
});

test('recordRun copes with no prior history', () => {
  assert.equal(recordRun(undefined, run(NOW)).length, 1);
  assert.equal(recordRun(null, run(NOW)).length, 1);
});

test('never having run is reported as such, not as overdue', () => {
  // Telling someone who installed the app a minute ago that checks are overdue
  // is both wrong and alarming.
  const summary = summarizeRuns([], NOW);
  assert.equal(summary.neverRun, true);
  assert.equal(summary.isStale, false);
  assert.equal(summary.lastRunAt, null);
});

test('a recent run is not stale', () => {
  const summary = summarizeRuns([run(NOW - HOUR)], NOW);
  assert.equal(summary.isStale, false);
  assert.equal(summary.sinceLastMs, HOUR);
});

test('one missed run is tolerated, a stopped job is not', () => {
  // A scheduled job that quietly stops looks exactly like an account where
  // nothing is broken — a calm screen and no email — and the calm screen is
  // the more convincing of the two.
  const nearlyLate = summarizeRuns([run(NOW - 2 * DEFAULT_INTERVAL_MS)], NOW);
  assert.equal(nearlyLate.isStale, false, 'one missed run plus slippage is tolerated');

  const stopped = summarizeRuns([run(NOW - (STALE_MULTIPLIER + 1) * DEFAULT_INTERVAL_MS)], NOW);
  assert.equal(stopped.isStale, true);
});

test('a custom interval changes what counts as stale', () => {
  const hourly = summarizeRuns([run(NOW - 4 * HOUR)], NOW, HOUR);
  assert.equal(hourly.isStale, true, 'four hours is stale for an hourly check');
  assert.equal(summarizeRuns([run(NOW - 4 * HOUR)], NOW).isStale, false, 'but fine for a daily one');
});

test('runs that happen but keep failing are counted separately from runs that stop', () => {
  const history = [run(NOW - HOUR, { error: 'API 500' }), run(NOW - 2 * HOUR, { error: 'API 500' }), run(NOW - 3 * HOUR)];
  const summary = summarizeRuns(history, NOW);
  assert.equal(summary.consecutiveErrors, 2);
  assert.equal(summary.lastError, 'API 500');
  assert.equal(summary.isStale, false, 'the job is alive, it is the calls that are failing');
});

test('a successful run resets the error streak', () => {
  const history = [run(NOW - HOUR), run(NOW - 2 * HOUR, { error: 'boom' })];
  assert.equal(summarizeRuns(history, NOW).consecutiveErrors, 0);
});
