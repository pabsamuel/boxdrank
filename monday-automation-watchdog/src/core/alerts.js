/**
 * Decides what to actually tell someone, given what they were told last time.
 *
 * The cadence engine decides whether a signal is broken. This decides whether
 * that is worth an email — a different and harder question. A monitor that mails
 * every run about the same known problem is nagging, and nagging gets a filter
 * rule, which takes the next real alert down with it.
 *
 * Rules, in the order they matter:
 *
 *  - **Only `silent` is worth an email.** `late` is a nudge; escalating it would
 *    be crying wolf, and the whole product dies the first time it does.
 *  - **Say it once.** A repeat within the reminder window is suppressed.
 *  - **Then say it again, rarely.** Still broken after the reminder window gets
 *    one more mail, because a problem ignored for days is worse, not stale.
 *  - **Say when it comes back.** Recovery closes the loop; without it, people
 *    keep checking manually and stop trusting the silence.
 *  - **Never mail about `dormant`.** Someone switched that off on purpose.
 *
 * Pure functions over plain state, so all of this is testable without a clock,
 * a mailbox or an account.
 */

const DAY = 24 * 3600_000;

/**
 * How long to stay quiet about a problem already reported.
 *
 * Three days, not one. A daily reminder about a known breakage reads as noise
 * and trains people to filter the sender; three days reads as "this is still
 * not fixed", which is the message that actually needs sending.
 */
export const REMINDER_AFTER_MS = 3 * DAY;

/**
 * Notifications are capped so one account-wide outage cannot produce a wall of
 * text. The count is always reported in full — only the detail is trimmed.
 */
export const MAX_LISTED = 20;

/**
 * @typedef {{ status: string, notifiedAt: number, silentSince: number }} SignalState
 * @typedef {Record<string, SignalState>} WatchState
 */

/**
 * Works out which notifications to send, and the state to persist for next time.
 *
 * @param {{key: string, label: string, status: string, reason: string}[]} results
 * @param {WatchState} previous State stored after the last run; `{}` on first run.
 * @param {number} now Epoch ms.
 * @returns {{ newlySilent: object[], stillSilent: object[], recovered: object[],
 *             shouldSend: boolean, state: WatchState }}
 */
export function planNotifications(results, previous, now) {
  const newlySilent = [];
  const stillSilent = [];
  const recovered = [];
  /** @type {WatchState} */
  const state = {};

  for (const result of results) {
    const before = previous?.[result.key];

    if (result.status === 'silent') {
      const silentSince = before?.silentSince ?? now;

      if (!before || before.status !== 'silent') {
        newlySilent.push({ ...result, silentSince });
        state[result.key] = { status: 'silent', notifiedAt: now, silentSince };
        continue;
      }

      if (now - before.notifiedAt >= REMINDER_AFTER_MS) {
        stillSilent.push({ ...result, silentSince, silentForMs: now - silentSince });
        state[result.key] = { status: 'silent', notifiedAt: now, silentSince };
        continue;
      }

      // Already reported and still inside the quiet window: carry the state
      // forward untouched so the reminder clock keeps running from the last
      // thing actually sent, not from this run.
      state[result.key] = before;
      continue;
    }

    // Recovery is only worth announcing to someone who was told it broke.
    if (result.status === 'healthy' && before?.status === 'silent') {
      recovered.push({ ...result, wasSilentForMs: now - before.silentSince });
      continue;
    }

    // Everything else — healthy, late, dormant, insufficient history — carries
    // no state. Dropping it here is also what prunes signals that vanished, so
    // stored state cannot grow without limit.
  }

  return {
    newlySilent,
    stillSilent,
    recovered,
    shouldSend: newlySilent.length + stillSilent.length + recovered.length > 0,
    state,
  };
}

/**
 * One-line subject describing the whole run.
 *
 * Leads with the number, because that is what gets read in a notification
 * preview and it is the only part that has to survive being skimmed.
 */
export function subjectFor(plan) {
  const broken = plan.newlySilent.length + plan.stillSilent.length;

  if (broken > 0) {
    const noun = broken === 1 ? 'automation has' : 'automations have';
    const stillNote = plan.newlySilent.length === 0 ? ' (still)' : '';
    return `${broken} monday ${noun} stopped${stillNote}`;
  }

  if (plan.recovered.length > 0) {
    const noun = plan.recovered.length === 1 ? 'automation is' : 'automations are';
    return `${plan.recovered.length} monday ${noun} running again`;
  }

  return 'monday automations: nothing to report';
}
