/**
 * The automation inventory: every automation in the account, in one list,
 * searchable — what Patrick Fallon (a monday consultant) named as the bigger
 * pain on 27 Sep 2026: automations "siloed in multiple boards", weak search,
 * and "impossible to 'see' all your automations in one place".
 *
 * Pure functions over what monday returns (src/app/monday-source.js,
 * fetchAutomations), so ordering, counting and search are testable offline.
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
  const rows = (automations ?? []).map((automation) => ({
    id: automation.id,
    title: singleLine(automation.title),
    description: singleLine(automation.description ?? '', 300),
    active: automation.active,
    board: automation.boardId
      ? singleLine(boardNames.get(automation.boardId) ?? `Board ${automation.boardId}`)
      : 'Not on a board',
    notice: singleLine(automation.notice ?? '', 300),
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
