/**
 * One scheduled check for one monday account: read activity, judge it, decide
 * what to say, say it, remember what was said.
 *
 * **Storage and mail are injected, not imported.** monday code's exact storage
 * and scheduling APIs could not be verified while this was written —
 * developer.monday.com is unreachable from this environment — so rather than
 * writing them from memory and shipping something that does not compile against
 * the real platform, this depends on two tiny interfaces:
 *
 *   storage: { get(key) -> Promise<any|null>, set(key, value) -> Promise<void> }
 *   mailer:  { send({ to, subject, text, html }) -> Promise<void> }
 *
 * Adapting those to whatever monday code actually provides is a contained job in
 * one file. Everything below is already tested.
 */

import { fetchBoards, fetchActivity } from '../app/monday-source.js';
import { watch, summarize } from '../core/watch.js';
import { planNotifications } from '../core/alerts.js';
import { renderEmail } from '../core/email.js';
import { recordRun } from '../core/run-log.js';

const DAY = 24 * 3600_000;

/** How much history each run reads. Long enough for the engine to learn a rhythm. */
export const HISTORY_DAYS = 60;

/** Where an account's alert state lives. Namespaced so it cannot collide. */
export const stateKey = (accountId) => `watchdog:state:v1:${accountId}`;

/**
 * Where the record of runs lives, separately from alert state.
 *
 * Separate on purpose: the run log has to be written even when a check fails,
 * and alert state must not be. Sharing one key would force a single write and
 * one of those two rules would have to give.
 */
export const runLogKey = (accountId) => `watchdog:runs:v1:${accountId}`;

/**
 * @param {object} deps
 * @param {{api: Function}} deps.monday
 * @param {{get: Function, set: Function}} deps.storage
 * @param {{send: Function}} deps.mailer
 * @param {string} deps.accountId
 * @param {string} deps.recipient
 * @param {number} [deps.now]
 * @returns {Promise<{watched: number, sent: boolean, subject: string|null,
 *                    counts: object, unparsedTimestamps: number}>}
 */
export async function runCheck({ monday, storage, mailer, accountId, recipient, now = Date.now() }) {
  // Recorded whatever happens, including a failure, so the UI can tell "the
  // checks stopped" apart from "the checks run and keep erroring". Those look
  // identical from the outside and need completely different responses.
  const logRun = async (entry) => {
    try {
      const history = (await storage.get(runLogKey(accountId))) ?? [];
      await storage.set(runLogKey(accountId), recordRun(history, { at: now, ...entry }));
    } catch {
      // A run log that cannot be written must never take down a check that
      // otherwise worked. Losing a history entry is survivable; losing an
      // alert is not.
    }
  };

  let boards;
  try {
    boards = await fetchBoards(monday);

    var activity = await fetchActivity(
      monday,
      boards.map((board) => board.id),
      now - HISTORY_DAYS * DAY,
      now,
    );
  } catch (error) {
    await logRun({ watched: 0, silent: 0, sent: false, error: error?.message ?? String(error) });
    throw error;
  }

  const { entries, unparsedTimestamps } = activity;

  const results = watch(entries, now, { boardNames: new Map(boards.map((b) => [b.id, b.name])) });
  const summary = summarize(results);

  const previous = (await storage.get(stateKey(accountId))) ?? {};
  const plan = planNotifications(results, previous, now);

  let subject = null;
  if (plan.shouldSend) {
    const email = renderEmail(plan);
    subject = email.subject;
    await mailer.send({ to: recipient, subject: email.subject, text: email.text, html: email.html });
  }

  // Persisted after the send, never before. A storage write that succeeded while
  // the mail failed would record the alert as delivered and silently swallow it —
  // and a watchdog that loses alerts is worse than no watchdog, because it is
  // trusted. Failing the other way just repeats an alert, which is survivable.
  await storage.set(stateKey(accountId), plan.state);

  await logRun({
    watched: summary.watched,
    silent: summary.counts.silent,
    muted: plan.mutedCount,
    sent: plan.shouldSend,
    error: null,
  });

  return {
    watched: summary.watched,
    sent: plan.shouldSend,
    subject,
    counts: summary.counts,
    unparsedTimestamps,
  };
}
