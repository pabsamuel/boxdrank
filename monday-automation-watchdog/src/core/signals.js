/**
 * Turns a stream of activity-log entries into named signals whose rhythm can be
 * watched.
 *
 * Built this way because of an unknown that could not be resolved while writing
 * it: monday's UI marks automation-performed actions with a robot icon and the
 * tooltip "This operation was made by an automation", but whether the GraphQL
 * activity log exposes that distinction is **UNVERIFIED** — there is even an open
 * community request asking for automation detail in the activity log.
 *
 * So nothing here depends on the answer. A signal is any repeating
 * (actor, event, entity, board) pattern. If the API does identify automations,
 * each automation becomes its own signal and the labels get sharper. If it does
 * not, the patterns are still there and still go quiet when an automation dies —
 * which is the thing being detected. Monitoring by outcome rather than by status.
 */

import { describeEvent } from './event-labels.js';
import { singleLine } from './sanitize.js';

/**
 * Minimum firings before a pattern is worth watching at all.
 *
 * Deliberately one above the cadence engine's MIN_GAPS requirement: a pattern
 * that only just qualifies would be admitted and then immediately reported as
 * having insufficient history, which reads like a broken tool.
 */
export const MIN_OCCURRENCES = 7;

/**
 * Builds the grouping key for one log entry.
 *
 * Board is included because the same automation recipe copied onto ten boards
 * fails independently on each, and an alert that cannot say which board is not
 * actionable. Actor is included because it is the field most likely to separate
 * an automation from a human, if monday exposes it at all.
 */
function signatureOf(entry) {
  return [entry.boardId ?? 'unknown-board', entry.actor ?? 'unknown-actor', entry.event ?? 'unknown-event', entry.entity ?? 'item'].join('|');
}

/**
 * Human-readable name for a signal, in the form "X creates an item on Y".
 * Deliberately plain prose: an alert that needs decoding gets ignored, and this
 * one gets read at 8am by someone who has not thought about monday yet.
 */
function labelFor(entry, actorNames, boardNames) {
  const actor = actorNames?.get(entry.actor) ?? (entry.actor ? `Actor ${entry.actor}` : 'Something');
  const board = boardNames?.get(entry.boardId) ?? `board ${entry.boardId}`;
  // Every untrusted name passes through here, so flattening once covers the
  // text email, the HTML email and the DOM at the same time.
  return singleLine(`${singleLine(actor, 60)} ${describeEvent(entry.event)} on ${singleLine(board, 60)}`);
}

/**
 * Groups log entries into candidate signals.
 *
 * @param {{boardId?: string, actor?: string, event?: string, entity?: string, at: number}[]} entries
 * @param {{ actorNames?: Map<string,string>, boardNames?: Map<string,string>,
 *           minOccurrences?: number, automationActors?: Set<string> }} [options]
 *        `automationActors`, when known, restricts watching to automation-driven
 *        patterns. Left empty, every repeating pattern is a candidate.
 * @returns {{key: string, label: string, boardId: string, actor: string,
 *            event: string, entity: string, timestamps: number[], isAutomation: boolean}[]}
 */
export function extractSignals(entries, options = {}) {
  const { actorNames, boardNames, minOccurrences = MIN_OCCURRENCES, automationActors } = options;
  const groups = new Map();

  for (const entry of entries) {
    // An entry with no usable timestamp cannot contribute to a rhythm, and a
    // NaN would silently poison every statistic downstream.
    if (!Number.isFinite(entry?.at)) continue;
    if (automationActors && automationActors.size > 0 && !automationActors.has(entry.actor)) continue;

    const key = signatureOf(entry);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: labelFor(entry, actorNames, boardNames),
        boardId: entry.boardId ?? null,
        boardLabel: singleLine(boardNames?.get(entry.boardId) ?? `board ${entry.boardId}`, 60),
        actor: entry.actor ?? null,
        event: entry.event ?? null,
        entity: entry.entity ?? null,
        timestamps: [],
        isAutomation: Boolean(automationActors?.has(entry.actor)),
      });
    }
    groups.get(key).timestamps.push(entry.at);
  }

  return [...groups.values()]
    .map((signal) => ({ ...signal, timestamps: [...new Set(signal.timestamps)].sort((a, b) => a - b) }))
    .filter((signal) => signal.timestamps.length >= minOccurrences)
    .sort((a, b) => b.timestamps.length - a.timestamps.length || a.label.localeCompare(b.label));
}
