import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCadence, activeElapsedMs, formatDuration, MIN_GAPS, DORMANT_AFTER_MS } from '../src/core/cadence.js';

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** A Wednesday 09:00 UTC, so weekday arithmetic in these tests is readable. */
const WED = Date.UTC(2026, 8, 16, 9, 0, 0);

/** `count` firings ending at `end`, spaced `stepMs` apart. */
const series = (end, stepMs, count) =>
  Array.from({ length: count }, (_, i) => end - (count - 1 - i) * stepMs);

test('a steady hourly signal that just fired is healthy', () => {
  const result = analyzeCadence(series(WED, HOUR, 20), WED + 10 * 60_000);
  assert.equal(result.status, 'healthy');
  assert.equal(result.typicalGapMs, HOUR);
});

test('history shorter than the minimum is refused rather than guessed at', () => {
  // Guessing "normal" from three samples is how a watchdog earns its mute button.
  const result = analyzeCadence(series(WED, HOUR, MIN_GAPS), WED + 100 * DAY);
  assert.equal(result.status, 'insufficient_history');
  assert.equal(result.gapCount, MIN_GAPS - 1);
});

test('exactly enough history is accepted', () => {
  const result = analyzeCadence(series(WED, HOUR, MIN_GAPS + 1), WED + 10 * 60_000);
  assert.equal(result.status, 'healthy');
  assert.equal(result.gapCount, MIN_GAPS);
});

test('a fast signal is not alarmed on after a couple of quiet minutes', () => {
  // Every 30 seconds, silent for 5 minutes. Technically anomalous, operationally
  // noise — nobody acts on a five-minute-old alert.
  const result = analyzeCadence(series(WED, 30_000, 40), WED + 5 * 60_000);
  assert.equal(result.status, 'healthy', 'the tolerance floor absorbs this');
});

test('an hourly signal silent for half a day is silent', () => {
  const result = analyzeCadence(series(WED, HOUR, 30), WED + 12 * HOUR);
  assert.equal(result.status, 'silent');
  assert.match(result.reason, /Normally every 1 hr/);
});

test('an hourly signal a few hours late is late, not silent', () => {
  const result = analyzeCadence(series(WED, HOUR, 30), WED + 3 * HOUR);
  assert.equal(result.status, 'late');
  assert.match(result.reason, /not yet an alarm/);
});

test('a weekday-only signal is not alarmed on over the weekend', () => {
  // The single biggest source of false alarms. A Friday-evening automation that
  // has not fired by Sunday night is not late — those days never produce.
  const weekdays = [];
  let cursor = Date.UTC(2026, 6, 1, 10, 0, 0); // Wed 1 Jul 2026
  for (let i = 0; i < 40; i += 1) {
    const day = new Date(cursor).getUTCDay();
    if (day !== 0 && day !== 6) weekdays.push(cursor);
    cursor += DAY;
  }
  const lastFriday = weekdays[weekdays.length - 1];
  assert.equal(new Date(lastFriday).getUTCDay(), 5, 'test fixture ends on a Friday');

  // Sunday evening: ~2 wall-clock days of silence, but zero active time.
  const result = analyzeCadence(weekdays, lastFriday + 2 * DAY + 8 * HOUR);
  assert.equal(result.status, 'healthy');
  assert.deepEqual(result.activeDays, [1, 2, 3, 4, 5]);
});

test('a weekday-only signal that misses a working day is still caught', () => {
  // The weekend allowance must not become a blanket excuse.
  const weekdays = [];
  let cursor = Date.UTC(2026, 6, 1, 10, 0, 0);
  for (let i = 0; i < 40; i += 1) {
    const day = new Date(cursor).getUTCDay();
    if (day !== 0 && day !== 6) weekdays.push(cursor);
    cursor += DAY;
  }
  const lastFriday = weekdays[weekdays.length - 1];
  // Through the weekend and most of the following week.
  const result = analyzeCadence(weekdays, lastFriday + 6 * DAY);
  assert.equal(result.status, 'silent');
});

test('one holiday shutdown in the history does not widen tolerance forever', () => {
  // Using the maximum gap would let a single Christmas break mask every future
  // outage. The 90th percentile is why this stays sensitive.
  const times = series(WED - 20 * DAY, DAY, 15);
  times.push(times[times.length - 1] + 14 * DAY); // a two-week shutdown
  let cursor = times[times.length - 1];
  for (let i = 0; i < 15; i += 1) times.push((cursor += DAY));

  const last = times[times.length - 1];
  const result = analyzeCadence(times, last + 5 * DAY);
  assert.notEqual(result.status, 'healthy', 'five days of silence on a daily signal is not fine');
});

test('a month of silence reports as switched off, not as an emergency', () => {
  const result = analyzeCadence(series(WED, DAY, 20), WED + DORMANT_AFTER_MS + DAY);
  assert.equal(result.status, 'dormant');
  assert.match(result.reason, /switched off/);
});

test('an irregular signal is judged against its own irregularity', () => {
  // Gaps of 1h to 9h. A 10-hour silence is unremarkable here even though it
  // would be an alert for a steady hourly signal.
  const gaps = [1, 5, 2, 9, 3, 7, 4, 8, 2, 6, 3, 5].map((h) => h * HOUR);
  const times = [WED - 60 * HOUR];
  for (const gap of gaps) times.push(times[times.length - 1] + gap);

  const last = times[times.length - 1];
  assert.equal(analyzeCadence(times, last + 10 * HOUR).status, 'healthy');
  assert.equal(analyzeCadence(times, last + 40 * HOUR).status, 'silent');
});

test('duplicate and unsorted timestamps are handled', () => {
  // Activity logs arrive newest-first and can repeat across paged requests.
  const ordered = series(WED, HOUR, 12);
  const messy = [...ordered].reverse().concat(ordered.slice(0, 4));
  const result = analyzeCadence(messy, WED + 10 * 60_000);
  assert.equal(result.status, 'healthy');
  assert.equal(result.gapCount, 11, 'duplicates collapsed');
  assert.equal(result.lastFiredAt, WED);
});

test('no history at all is reported, not crashed on', () => {
  const result = analyzeCadence([], WED);
  assert.equal(result.status, 'insufficient_history');
  assert.equal(result.lastFiredAt, null);
  assert.equal(result.gapCount, 0);
});

test('activeElapsedMs counts only days the signal fires on', () => {
  const weekdaysOnly = new Set([1, 2, 3, 4, 5]);
  const fridayNoon = Date.UTC(2026, 6, 3, 12, 0, 0);
  assert.equal(new Date(fridayNoon).getUTCDay(), 5);

  // Friday noon to Monday noon: 3 wall-clock days, 1 active day.
  const mondayNoon = fridayNoon + 3 * DAY;
  assert.equal(activeElapsedMs(fridayNoon, mondayNoon, weekdaysOnly), 24 * HOUR);

  // Every day active: no adjustment.
  const allDays = new Set([0, 1, 2, 3, 4, 5, 6]);
  assert.equal(activeElapsedMs(fridayNoon, mondayNoon, allDays), 3 * DAY);
});

test('activeElapsedMs handles reversed and empty inputs', () => {
  const days = new Set([1, 2, 3, 4, 5]);
  assert.equal(activeElapsedMs(WED + DAY, WED, days), 0);
  assert.equal(activeElapsedMs(WED, WED, days), 0);
  assert.equal(activeElapsedMs(WED, WED + DAY, new Set()), 0);
});

test('formatDuration stays readable at every scale', () => {
  assert.equal(formatDuration(30_000), 'less than a minute');
  assert.equal(formatDuration(45 * 60_000), '45 min');
  assert.equal(formatDuration(2.5 * HOUR), '2.5 hr');
  assert.equal(formatDuration(1 * HOUR), '1 hr');
  assert.equal(formatDuration(30 * HOUR), '1.3 days');
  assert.equal(formatDuration(45 * DAY), '45 days');
});

test('a short history keeps all seven days so the clock never freezes', () => {
  // Regression. Inferring inactive days from absence alone meant a signal whose
  // history spanned three days was treated as never firing Thu/Fri/Sat. Active
  // time then stopped accumulating and a dead signal could never escalate past
  // 'late' — a monitor that silently stops escalating, which is the exact
  // failure this product exists to catch.
  const HOUR_ = 3600_000;
  const gaps = [1, 5, 2, 9, 3, 7, 4, 8, 2, 6, 3, 5].map((h) => h * HOUR_);
  const times = [WED - 60 * HOUR_];
  for (const gap of gaps) times.push(times[times.length - 1] + gap);

  const result = analyzeCadence(times, times[times.length - 1] + 40 * HOUR_);
  assert.deepEqual(result.activeDays, [0, 1, 2, 3, 4, 5, 6], 'too little evidence to exclude any day');
  assert.equal(result.status, 'silent', 'elapsed time keeps accruing, so it escalates');
});

test('a weekday is only excluded after repeatedly coming and going unused', () => {
  // One unused Monday is a public holiday. Several is a pattern.
  const weekdays = [];
  let cursor = Date.UTC(2026, 6, 1, 10, 0, 0);
  for (let i = 0; i < 40; i += 1) {
    const day = new Date(cursor).getUTCDay();
    if (day !== 0 && day !== 6) weekdays.push(cursor);
    cursor += DAY;
  }
  const result = analyzeCadence(weekdays, weekdays[weekdays.length - 1] + HOUR);
  assert.deepEqual(result.activeDays, [1, 2, 3, 4, 5], 'eight unused weekends is evidence');
});
