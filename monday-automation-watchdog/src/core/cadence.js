/**
 * Decides whether a signal that used to fire regularly has gone quiet.
 *
 * This is the whole product. monday silently deactivates automations and sends
 * no alert, so the job is to notice the silence — not to explain it. An
 * automation that stopped firing is broken whether the cause was a deleted
 * status label, an expired OAuth token or a deactivated owner.
 *
 * The hard part is not detecting silence. It is **not crying wolf**. A
 * monitoring tool that fires false alarms gets muted within a week, and a muted
 * watchdog is worth exactly nothing. Everything below exists to avoid alerting
 * on a weekend, a quiet Monday, or an automation that was always irregular.
 *
 * Knows nothing about monday.com. Takes timestamps, returns a verdict.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Gaps needed before this will call anything wrong.
 *
 * Six firings give five gaps, which is the least that supports a median and a
 * spread. Below that, "normal" is a guess, and guessing is how a watchdog earns
 * its mute button.
 */
export const MIN_GAPS = 5;

/**
 * A signal that has not fired for this long, with no history explaining it, is
 * treated as retired rather than broken. Someone who turned an automation off on
 * purpose three weeks ago does not want a daily reminder about it.
 */
export const DORMANT_AFTER_MS = 30 * DAY;

/**
 * Multipliers applied to the observed spread. `late` is a nudge, `silent` is an
 * alert. Two levels, not five: a watchdog whose output needs interpreting is a
 * report, and reports get cancelled.
 */
const LATE_MULTIPLIER = 1.5;
const SILENT_MULTIPLIER = 3;

/**
 * Floor under the tolerance window. Without it, an automation that fires every
 * 30 seconds would alert after 90 seconds of quiet — technically correct and
 * operationally useless, since nobody acts on a two-minute-old alert and every
 * deploy would trigger one.
 */
const MIN_TOLERANCE_MS = 2 * HOUR;

function median(sorted) {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * The value below which `fraction` of the sorted samples fall, interpolating
 * between neighbours. Used instead of the maximum gap because one holiday
 * shutdown in the history would otherwise widen the tolerance window forever.
 */
function percentile(sorted, fraction) {
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/**
 * How many times a weekday must have come and gone, unused, before this will
 * conclude the signal never fires on it.
 *
 * One unused Monday is a public holiday. Two or more is a pattern.
 */
const MIN_UNUSED_OPPORTUNITIES = 2;

/**
 * The weekdays (0 = Sunday) on which this signal plausibly fires.
 *
 * An automation driven by people working only fires when people work, and
 * knowing Saturday has never once appeared in six months is what stops this
 * emailing an admin at 3am on a Sunday about a Friday automation.
 *
 * The subtlety — and an earlier bug here — is that a weekday must be *excluded
 * on evidence*, not merely by being absent. A signal whose history spans three
 * days has never fired on Thursday, Friday or Saturday simply because those days
 * have not happened yet. Treating them as inactive froze the active-time clock,
 * so elapsed time stopped accumulating and a genuinely dead signal could never
 * escalate past 'late'. A monitor that silently stops escalating is precisely
 * the failure this product exists to catch, so it must not have it.
 *
 * A weekday is therefore only dropped when it has come around at least
 * MIN_UNUSED_OPPORTUNITIES times within the observed window and produced
 * nothing. Short histories keep all seven days, which is the safe direction:
 * elapsed time keeps counting and silence stays detectable.
 *
 * **Timestamps are read in UTC.** An account whose working week sits far from
 * UTC can have a Friday-evening firing land on Saturday UTC. That widens the
 * active-day set and therefore produces *fewer* alerts, never more — the
 * failure mode is quiet rather than noisy.
 */
function activeWeekdays(timestamps) {
  const fired = new Set(timestamps.map((time) => new Date(time).getUTCDay()));

  // Count how often each weekday occurred between the first and last firing.
  const opportunities = new Map();
  const firstDay = Date.UTC(
    new Date(timestamps[0]).getUTCFullYear(),
    new Date(timestamps[0]).getUTCMonth(),
    new Date(timestamps[0]).getUTCDate(),
  );
  const lastTime = timestamps[timestamps.length - 1];

  for (let cursor = firstDay; cursor <= lastTime; cursor += DAY) {
    const day = new Date(cursor).getUTCDay();
    opportunities.set(day, (opportunities.get(day) ?? 0) + 1);
  }

  const active = new Set([0, 1, 2, 3, 4, 5, 6]);
  for (const day of active) {
    const seen = opportunities.get(day) ?? 0;
    if (!fired.has(day) && seen >= MIN_UNUSED_OPPORTUNITIES) active.delete(day);
  }

  return active;
}

/**
 * Milliseconds between two instants, counting only days the signal actually
 * fires on.
 *
 * A Friday-evening automation that has not fired by Sunday night is not late —
 * two of those days were never going to produce anything. Measuring elapsed time
 * in raw hours is the single biggest source of weekend false alarms.
 */
export function activeElapsedMs(fromMs, toMs, activeDays) {
  if (toMs <= fromMs) return 0;
  // Every day is active: no adjustment to make, and no reason to walk the range.
  if (activeDays.size >= 7) return toMs - fromMs;
  if (activeDays.size === 0) return 0;

  let total = 0;
  let cursor = fromMs;

  while (cursor < toMs) {
    const date = new Date(cursor);
    const endOfDay = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
    const sliceEnd = Math.min(endOfDay, toMs);
    if (activeDays.has(date.getUTCDay())) total += sliceEnd - cursor;
    cursor = sliceEnd;
  }

  return total;
}

/**
 * Judges one signal.
 *
 * @param {number[]} timestamps Epoch ms of past firings, any order.
 * @param {number} now Epoch ms.
 * @returns {{
 *   status: 'healthy'|'late'|'silent'|'dormant'|'insufficient_history',
 *   lastFiredAt: number|null, gapCount: number,
 *   typicalGapMs: number|null, toleranceMs: number|null,
 *   elapsedMs: number, activeElapsedMs: number, activeDays: number[],
 *   reason: string
 * }}
 */
export function analyzeCadence(timestamps, now) {
  const times = [...new Set(timestamps)].sort((a, b) => a - b);
  const lastFiredAt = times.length > 0 ? times[times.length - 1] : null;
  const elapsedMs = lastFiredAt === null ? 0 : now - lastFiredAt;

  const base = {
    lastFiredAt,
    gapCount: Math.max(times.length - 1, 0),
    typicalGapMs: null,
    toleranceMs: null,
    elapsedMs,
    activeElapsedMs: elapsedMs,
    activeDays: [],
  };

  if (times.length - 1 < MIN_GAPS) {
    return {
      ...base,
      status: 'insufficient_history',
      reason: `Only ${Math.max(times.length - 1, 0)} intervals observed; ${MIN_GAPS} needed before this can tell normal from broken.`,
    };
  }

  const activeDays = activeWeekdays(times);
  const activeElapsed = activeElapsedMs(lastFiredAt, now, activeDays);

  // Gaps are measured in active time too, so a routine weekend does not inflate
  // the notion of a normal interval and mask a real weekday outage.
  const gaps = [];
  for (let i = 1; i < times.length; i += 1) {
    gaps.push(activeElapsedMs(times[i - 1], times[i], activeDays));
  }
  gaps.sort((a, b) => a - b);

  const typicalGapMs = median(gaps);
  const spread = Math.max(percentile(gaps, 0.9), typicalGapMs);
  const toleranceMs = Math.max(spread * LATE_MULTIPLIER, MIN_TOLERANCE_MS);
  const silentMs = Math.max(spread * SILENT_MULTIPLIER, MIN_TOLERANCE_MS * 2);

  const result = {
    ...base,
    typicalGapMs,
    toleranceMs,
    activeElapsedMs: activeElapsed,
    activeDays: [...activeDays].sort(),
  };

  // Checked before 'silent' so a long-abandoned automation reports as retired
  // rather than as an emergency. Uses wall-clock time, not active time: a month
  // of silence is a month regardless of which days it skipped.
  if (elapsedMs > DORMANT_AFTER_MS) {
    return {
      ...result,
      status: 'dormant',
      reason: `Nothing for ${Math.round(elapsedMs / DAY)} days. Treating this as switched off rather than broken.`,
    };
  }

  if (activeElapsed > silentMs) {
    return {
      ...result,
      status: 'silent',
      reason: `Normally every ${formatDuration(typicalGapMs)}, but nothing for ${formatDuration(activeElapsed)} of working time.`,
    };
  }

  if (activeElapsed > toleranceMs) {
    return {
      ...result,
      status: 'late',
      reason: `Normally every ${formatDuration(typicalGapMs)}; ${formatDuration(activeElapsed)} so far. Worth a look, not yet an alarm.`,
    };
  }

  return {
    ...result,
    status: 'healthy',
    reason: `Last fired ${formatDuration(activeElapsed)} ago, within its usual ${formatDuration(typicalGapMs)} rhythm.`,
  };
}

/** Short human duration. Rounded hard — nobody needs "2.37 hours". */
export function formatDuration(ms) {
  if (ms < MINUTE) return 'less than a minute';
  if (ms < HOUR) return `${Math.round(ms / MINUTE)} min`;
  if (ms < DAY) {
    const hours = ms / HOUR;
    return `${hours < 10 ? hours.toFixed(1).replace(/\.0$/, '') : Math.round(hours)} hr`;
  }
  const days = ms / DAY;
  return `${days < 10 ? days.toFixed(1).replace(/\.0$/, '') : Math.round(days)} days`;
}
