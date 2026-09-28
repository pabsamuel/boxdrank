/**
 * The automation inventory: every automation in the account, in one list,
 * searchable — what Patrick Fallon (a monday consultant) named as the bigger
 * pain on 27 Sep 2026: automations "siloed in multiple boards", weak search,
 * and "impossible to 'see' all your automations in one place".
 *
 * Pure functions over what monday returns (src/app/monday-source.js,
 * fetchAutomations), so ordering, counting, filtering and search are testable
 * offline. Carried over from Automation Watchdog, where it was built first.
 */

import { singleLine } from './sanitize.js';

/** Most in need of attention first: a notice from monday, then switched off. */
const rank = (row) => (row.notice ? 0 : row.active === false ? 1 : row.active === null ? 2 : 3);

/**
 * @param {{id: string, title: string, description: string, active: boolean|null,
 *          boardId: string|null, updatedAt: string|null, createdAt: string|null, notice: string}[]} automations
 * @param {{id: string, name: string}[]} boards
 */
export function buildInventory(automations, boards) {
  const boardNames = new Map((boards ?? []).map((board) => [String(board.id), board.name]));
  const boardUrls = new Map((boards ?? []).map((board) => [String(board.id), board.url ?? null]));
  const rows = (automations ?? []).map((automation) => ({
    id: automation.id,
    title: singleLine(automation.title),
    description: singleLine(automation.description ?? '', 300),
    active: automation.active,
    board: automation.boardId
      ? singleLine(boardNames.get(automation.boardId) ?? `Board ${automation.boardId}`)
      : 'Not on a board',
    boardUrl: automation.boardId ? boardUrls.get(automation.boardId) ?? null : null,
    notice: singleLine(automation.notice ?? '', 300),
    legacy: automation.legacy === true,
    updatedAt: automation.updatedAt,
    createdAt: automation.createdAt,
  }));
  rows.sort((a, b) => rank(a) - rank(b) || a.board.localeCompare(b.board) || a.title.localeCompare(b.title));
  return {
    rows,
    counts: {
      total: rows.length,
      active: rows.filter((row) => row.active === true).length,
      off: rows.filter((row) => row.active === false).length,
      withNotice: rows.filter((row) => row.notice !== '').length,
      boards: new Set(rows.map((row) => row.board)).size,
    },
  };
}

const fold = (text) => String(text ?? '').toLocaleLowerCase('en').normalize('NFKD').replace(/[̀-ͯ]/g, '');

/**
 * Rows matching every word of the search, in title, board, description or
 * notice; "off" and "on" also match the state.
 */
export function searchInventory(rows, text) {
  const words = fold(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return rows;
  return rows.filter((row) => {
    const haystack = fold(`${row.title} ${row.board} ${row.description} ${row.notice} ${row.active === false ? 'off' : row.active ? 'on active' : ''}`);
    return words.every((word) => haystack.includes(word));
  });
}

/** The state filters the view offers, in its order. */
export const SHOW_OPTIONS = [
  ['all', 'All'],
  ['off', 'Switched off'],
  ['notice', 'With a warning'],
];

/**
 * Rows in one state and, optionally, on one board. States are exact, unlike
 * the search's words: "off" in a search also finds "office".
 *
 * @param {object[]} rows
 * @param {{show?: string, board?: string}} [filters]
 */
export function filterInventory(rows, { show = 'all', board = '' } = {}) {
  return rows.filter((row) => {
    if (board && row.board !== board) return false;
    if (show === 'off') return row.active === false;
    if (show === 'notice') return row.notice !== '';
    return true;
  });
}

/** The boards that have at least one automation, by name, for the board filter. */
export function boardsIn(rows) {
  return [...new Set(rows.map((row) => row.board))].sort((a, b) => a.localeCompare(b));
}
