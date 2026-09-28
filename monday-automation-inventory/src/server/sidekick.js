/**
 * The Sidekick tool: finds automations for sidekick, monday's AI assistant —
 * "which automations are switched off?", "which automations post to Slack on
 * the Sales board?" — in words it can pass straight to the user.
 *
 * FACT (`apps/docs/sidekick-tool`, `sidekick-tools-best-practices`, read 28 Sep
 * 2026 while building Automation Watchdog): a tool is an action block whose
 * Run URL must "return results within a few seconds", synchronously; users
 * "talk in names, not numbers"; errors should become guidance; and the answer
 * should say where its data came from and when. FACT (the submission form, 28
 * Sep 2026): "monday.com is only accepting apps that include AI capabilities."
 *
 * The shape is Watchdog's `src/server/sidekick.js`, which ran live ("Success",
 * 7 s) on 28 Sep. It reads with the short-lived token monday sends for this one
 * request and stores nothing. A deadline keeps it inside "a few seconds": a
 * board name narrows the read to one board, and a whole-account read that runs
 * out of time says how far it got rather than timing out.
 */

import { fetchBoards, fetchAutomations } from '../app/monday-source.js';
import { buildInventory, searchInventory } from '../core/inventory.js';
import { singleLine } from '../core/sanitize.js';
import { APP_NAME } from '../core/brand.js';

export const SIDEKICK_PATH = '/monday/sidekick/find';

/** Time allowed for reading automations before answering with what was read. */
export const SIDEKICK_BUDGET_MS = 8000;

const MAX_LISTED = 15;

const normalise = (name) => String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Reads the automations on every board the user can see, or on one board, and
 * picks those matching the search.
 *
 * @param {object} deps
 * @param {{api: Function}} deps.monday  A client holding the short-lived token.
 * @param {string} [deps.boardName]      Optional; matched by name, as users say it.
 * @param {string} [deps.search]         Optional; every word must match.
 * @param {() => number} [deps.clock]    For the deadline; real time by default.
 * @param {number} [deps.budgetMs]
 */
export async function findForSidekick({ monday, boardName = '', search = '', clock = () => Date.now(), budgetMs = SIDEKICK_BUDGET_MS }) {
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

  const { automations, failedBoards, boardsRead } = await fetchAutomations(
    monday,
    scope.map((board) => board.id),
    undefined,
    () => clock() - startedAt > budgetMs,
  );
  const { rows } = buildInventory(automations, boards);
  return {
    rows,
    matches: searchInventory(rows, search),
    search: singleLine(search, 100),
    boardsRead,
    boardsInScope: scope.length,
    failedBoards,
    scopeNames: wanted ? scope.map((board) => board.name) : null,
  };
}

function stateWords(row) {
  if (row.active === false) return 'switched off';
  if (row.active === true) return 'on';
  if (row.legacy) return 'older type, monday does not say whether it is on';
  return 'monday does not say whether it is on';
}

/**
 * What sidekick shows the user, as the block's output fields.
 *
 * @returns {{summary: string, match_count: number, total_count: number, checked_boards: number}}
 */
export function sidekickAnswer(found, now) {
  if (found.notFound !== undefined) {
    const hint = found.similar.length > 0
      ? ` Boards with similar names: ${found.similar.map((name) => `"${singleLine(name)}"`).join(', ')}.`
      : ' Check the board name, or ask without one to search every board you can see.';
    return {
      summary: `${APP_NAME} couldn't find a board named "${singleLine(found.notFound)}".${hint}`,
      match_count: 0,
      total_count: 0,
      checked_boards: 0,
    };
  }

  const where = found.scopeNames
    ? `the board${found.scopeNames.length === 1 ? '' : 's'} ${found.scopeNames.map((name) => `"${singleLine(name)}"`).join(', ')}`
    : `${found.boardsRead} board${found.boardsRead === 1 ? '' : 's'}`;
  const total = found.rows.length;
  const lines = [
    `${APP_NAME} listed ${total} automation${total === 1 ? '' : 's'} on ${where}, as monday reported them at ${new Date(now).toISOString().slice(0, 16).replace('T', ' ')} UTC.`,
  ];
  if (found.boardsRead < found.boardsInScope) {
    lines.push(
      `It had time to read ${found.boardsRead} of ${found.boardsInScope} boards. Name a board to search it fully, or open the ${APP_NAME} board view to see every board.`,
    );
  }
  if (found.failedBoards > 0) {
    lines.push(`${found.failedBoards} board${found.failedBoards === 1 ? '' : 's'} could not be read, so ${found.failedBoards === 1 ? 'its' : 'their'} automations are missing.`);
  }

  const listed = found.search ? found.matches : found.rows;
  if (total === 0) {
    lines.push('monday listed no automations there.');
  } else if (found.search && listed.length === 0) {
    lines.push(`None of them match "${found.search}".`);
  } else {
    lines.push(
      found.search
        ? `${listed.length} match${listed.length === 1 ? 'es' : ''} "${found.search}":`
        : 'Those monday flags come first:',
    );
    for (const row of listed.slice(0, MAX_LISTED)) {
      const notice = row.notice ? `; monday says: ${singleLine(row.notice, 200)}` : '';
      // Already single-line from buildInventory; flattened again because a
      // new line here would let a board's owner write sidekick's next line.
      lines.push(`- ${singleLine(row.title)} (board "${singleLine(row.board)}", ${stateWords(row)}${notice})`);
    }
    if (listed.length > MAX_LISTED) lines.push(`- and ${listed.length - MAX_LISTED} more, in the ${APP_NAME} board view.`);
  }

  return {
    summary: lines.join('\n'),
    match_count: found.search ? found.matches.length : total,
    total_count: total,
    checked_boards: found.boardsRead,
  };
}
