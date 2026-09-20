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

const DAY = 24 * 3600_000;

/** How much history each run reads. Long enough for the engine to learn a rhythm. */
export const HISTORY_DAYS = 60;

/** Where an account's alert state lives. Namespaced so it cannot collide. */
export const stateKey = (accountId) => `watchdog:state:v1:${accountId}`;

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
  const boards = await fetchBoards(monday);

  const { entries, unparsedTimestamps } = await fetchActivity(
    monday,
    boards.map((board) => board.id),
    now - HISTORY_DAYS * DAY,
    now,
  );

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

  return {
    watched: summary.watched,
    sent: plan.shouldSend,
    subject,
    counts: summary.counts,
    unparsedTimestamps,
  };
}
