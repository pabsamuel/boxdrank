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
        newlySilent.push({ ...result, silentSince, boardLabel: result.boardLabel ?? result.boardId });
        state[result.key] = { status: 'silent', notifiedAt: now, silentSince };
        continue;
      }

      if (now - before.notifiedAt >= REMINDER_AFTER_MS) {
        stillSilent.push({ ...result, silentSince, silentForMs: now - silentSince, boardLabel: result.boardLabel ?? result.boardId });
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

  // Ordering is a correctness concern, not presentation. The lists get capped
  // for display, so whatever sorts last is what gets thrown away.
  //
  // `results` arrives longest-quiet-first, inherited from the dashboard's
  // ranking. Announcing breakages in that order meant the cap discarded exactly
  // the automations that had *just* broken — the only ones the email exists to
  // announce — while keeping ones the reader was told about weeks ago. In an
  // account with more than MAX_LISTED failures the newest breakage was silently
  // trimmed out. Someone able to create boards could also force that on purpose
  // by parking decoys in a long silence.
  newlySilent.sort((a, b) => a.activeElapsedMs - b.activeElapsedMs);
  // Reminders are the other way round: the longest-unfixed is the most overdue.
  stillSilent.sort((a, b) => b.silentForMs - a.silentForMs);
  recovered.sort((a, b) => a.wasSilentForMs - b.wasSilentForMs);

  return {
    newlySilent,
    stillSilent,
    recovered,
    shouldSend: newlySilent.length + stillSilent.length + recovered.length > 0,
    state,
  };
}

/**
 * Picks which items to spell out when there are more than fit.
 *
 * Takes them round-robin by board rather than straight off the top, so one
 * noisy board cannot crowd every other board out of the list. Order within each
 * board is preserved, so the caller's ranking still decides which of a board's
 * failures is shown first.
 *
 * @param {{boardId?: string|null}[]} items Already in priority order.
 * @param {number} limit
 * @returns {{shown: object[], hiddenCount: number, hiddenBoards: string[]}}
 */
export function selectForDisplay(items, limit = MAX_LISTED) {
  if (items.length <= limit) return { shown: items, hiddenCount: 0, hiddenBoards: [] };

  const queues = new Map();
  for (const item of items) {
    const board = item.boardId ?? 'unknown';
    if (!queues.has(board)) queues.set(board, []);
    queues.get(board).push(item);
  }

  const shown = [];
  const order = [...queues.keys()];
  while (shown.length < limit) {
    let tookAny = false;
    for (const board of order) {
      if (shown.length >= limit) break;
      const queue = queues.get(board);
      if (queue.length > 0) {
        shown.push(queue.shift());
        tookAny = true;
      }
    }
    if (!tookAny) break;
  }

  const hidden = [...queues.values()].flat();
  // Naming the boards that were dropped matters: "and 6 more" tells the reader
  // nothing, while a board name tells them where to look.
  const hiddenBoards = [...new Set(hidden.map((item) => item.boardLabel ?? item.boardId ?? 'unknown'))];

  return { shown, hiddenCount: hidden.length, hiddenBoards };
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
