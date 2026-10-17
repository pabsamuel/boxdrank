/**
 * The Sidekick tool: answers "which of my automations have stopped?" for
 * sidekick, monday's AI assistant, in words it can pass straight to the user.
 *
 * FACT (`apps/docs/sidekick-tool`, `sidekick-tools-best-practices`, read 28 Sep
 * 2026): a tool is an action block whose Run URL must "return results within a
 * few seconds", synchronously; users "talk in names, not numbers"; errors
 * should become guidance; and the answer should say where its data came from
 * and when. FACT (the Developer Center's submission form, 28 Sep 2026):
 * "monday.com is only accepting apps that include AI capabilities."
 *
 * It reads live, with the short-lived token monday sends for this one request,
 * and stores nothing. A deadline keeps it inside "a few seconds": a board name
 * narrows the read to one board, and a whole-account read that runs out of
 * time says how far it got rather than timing out.
 */

import { fetchBoards, fetchActivity, fetchUsers } from '../app/monday-source.js';
import { classifyActors } from '../core/actors.js';
import { singleLine } from '../core/sanitize.js';
import { watch } from '../core/watch.js';
import { HISTORY_DAYS } from './run-check.js';

export const SIDEKICK_PATH = '/monday/sidekick/check';

/** Time allowed for reading activity before answering with what was read. */
export const SIDEKICK_BUDGET_MS = 8000;

const DAY = 24 * 3600_000;
const MAX_STOPPED_LISTED = 10;
const MAX_OVERDUE_LISTED = 5;

const normalise = (name) => String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Reads and judges the account's automations, or one board's.
 *
 * @param {object} deps
 * @param {{api: Function}} deps.monday  A client holding the short-lived token.
 * @param {string} [deps.boardName]      Optional; matched by name, as users say it.
 * @param {number} [deps.now]
 * @param {() => number} [deps.clock]    For the deadline; real time by default.
 * @param {number} [deps.budgetMs]
 */
export async function checkForSidekick({ monday, boardName = '', now = Date.now(), clock = () => Date.now(), budgetMs = SIDEKICK_BUDGET_MS }) {
  const startedAt = clock();
  const boards = await fetchBoards(monday);

  const wanted = normalise(boardName);
  let scope = boards;
  if (wanted) {
    scope = boards.filter((board) => normalise(board.name) === wanted);
    if (scope.length === 0) scope = boards.filter((board) => normalise(board.name).includes(wanted));
    if (scope.length === 0) {
      const words = wanted.split(' ').filter((word) => word.length > 2);
      const similar = boards
        .filter((board) => words.some((word) => normalise(board.name).includes(word)))
        .map((board) => board.name)
        .slice(0, 5);
      return { notFound: String(boardName), similar };
    }
  }

  const activity = await fetchActivity(
    monday,
    scope.map((board) => board.id),
    now - HISTORY_DAYS * DAY,
    now,
    undefined,
    () => clock() - startedAt > budgetMs,
  );
  const users = await fetchUsers(monday);
  const { automationActors, unknown } = classifyActors(activity.entries, (users ?? []).map((user) => user.id));
  const results = watch(activity.entries, now, {
    boardNames: new Map(boards.map((board) => [board.id, board.name])),
    actorNames: new Map((users ?? []).map((user) => [user.id, user.name])),
    automationActors: unknown ? undefined : automationActors,
  });

  return {
    results,
    boardsChecked: activity.boardsRead,
    boardsInScope: scope.length,
    scopeNames: wanted ? scope.map((board) => board.name) : null,
  };
}

/**
 * What sidekick shows the user, as the block's output fields.
 *
 * @returns {{summary: string, stopped_count: number, checked_boards: number}}
 */
export function sidekickAnswer(check, now) {
  if (check.notFound !== undefined) {
    const hint = check.similar.length > 0
      ? ` Boards with similar names: ${check.similar.map((name) => `"${singleLine(name)}"`).join(', ')}.`
      : ' Check the board name, or ask without one to check every board you can see.';
    return {
      summary: `Automation Watchdog couldn't find a board named "${singleLine(check.notFound)}".${hint}`,
      stopped_count: 0,
      checked_boards: 0,
    };
  }

  const stopped = check.results.filter((result) => result.status === 'silent');
  const overdue = check.results.filter((result) => result.status === 'late');
  const where = check.scopeNames
    ? `the board${check.scopeNames.length === 1 ? '' : 's'} ${check.scopeNames.map((name) => `"${singleLine(name)}"`).join(', ')}`
    : `${check.boardsChecked} board${check.boardsChecked === 1 ? '' : 's'}`;
  const lines = [
    `Automation Watchdog checked ${where} against the last ${HISTORY_DAYS} days of activity, at ${new Date(now).toISOString().slice(0, 16).replace('T', ' ')} UTC.`,
  ];
  if (check.boardsChecked < check.boardsInScope) {
    lines.push(
      `It had time to read ${check.boardsChecked} of ${check.boardsInScope} boards. Name a board to check it fully, or open the Automation Watchdog board view to see every board.`,
    );
  }

  if (check.results.length === 0) {
    lines.push('No automation here acts often enough to watch yet: it needs about seven runs in 60 days to learn a normal rhythm.');
  } else if (stopped.length === 0) {
    lines.push(`None of the ${check.results.length} recurring automations it watches has stopped.`);
  } else {
    lines.push(`${stopped.length} automation${stopped.length === 1 ? ' has' : 's have'} stopped:`);
    for (const result of stopped.slice(0, MAX_STOPPED_LISTED)) {
      lines.push(`- ${singleLine(result.label)}: ${singleLine(result.reason, 200)}`);
    }
    if (stopped.length > MAX_STOPPED_LISTED) lines.push(`- and ${stopped.length - MAX_STOPPED_LISTED} more, in the board view.`);
  }
  if (overdue.length > 0) {
    lines.push(`${overdue.length} more ${overdue.length === 1 ? 'is' : 'are'} overdue but not yet stopped:`);
    for (const result of overdue.slice(0, MAX_OVERDUE_LISTED)) {
      lines.push(`- ${singleLine(result.label)}: ${singleLine(result.reason, 200)}`);
    }
  }
  if (stopped.length > 0) {
    lines.push("To see why, open the board's Automations page; monday shows the error there.");
  }

  return { summary: lines.join('\n'), stopped_count: stopped.length, checked_boards: check.boardsChecked };
}
