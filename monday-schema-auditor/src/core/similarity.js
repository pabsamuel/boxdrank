/**
 * Decides which boards are plausibly built from the same template as the
 * reference, so the report is about template drift rather than about every
 * board in the account.
 *
 * The first version of this tool compared the reference against every board the
 * user could see. That is fine on a demo where all boards came from one
 * template, and useless on a real account: an HR onboarding board compared
 * against a client-project template yields a wall of findings that are all
 * technically true and all meaningless.
 */

import { normalizeTitle } from './normalize.js';

/**
 * How much of the reference a board reproduces, from 0 to 1.
 *
 *   matched / (referenceColumns + unmatchedBoardColumns)
 *
 * Two deliberate choices:
 *
 * 1. **Names only.** This does not reuse the diff engine's matching, even
 *    though that would be less code. The diff engine also pairs columns by type
 *    and position to detect renames, and that is far too generous here: an HR
 *    board of people/date/status/checkbox/people has the same type shape as a
 *    client template of people/status/date/numbers/checkbox and scored 0.71
 *    against it. A rename is evidence of drift *given* two boards are related.
 *    It is weak evidence that they are related at all.
 *
 * 2. **Unmatched board columns count against.** Scoring matched-over-reference
 *    alone would give a 50-column operations board 1.0 for merely containing
 *    Owner, Status and a date — the three column names half of monday uses.
 *
 * Titles are compared normalised, so "Due Date" and "Due date" count as the
 * same column here exactly as they do in the report.
 *
 * @param {{columns?: {title: string}[]}} reference
 * @param {{columns?: {title: string}[]}} board
 * @returns {number} 0 when the reference has no columns to match against.
 */
export function similarity(reference, board) {
  const referenceTitles = (reference.columns ?? []).map((column) => normalizeTitle(column.title));
  if (referenceTitles.length === 0) return 0;

  // A multiset, not a set: monday allows two columns with the same title, and
  // one board column must not be able to satisfy two reference columns.
  const available = new Map();
  for (const column of board.columns ?? []) {
    const key = normalizeTitle(column.title);
    available.set(key, (available.get(key) ?? 0) + 1);
  }

  let matched = 0;
  for (const title of referenceTitles) {
    const remaining = available.get(title) ?? 0;
    if (remaining > 0) {
      available.set(title, remaining - 1);
      matched += 1;
    }
  }

  const unmatchedBoardColumns = [...available.values()].reduce((total, n) => total + n, 0);
  return matched / (referenceTitles.length + unmatchedBoardColumns);
}

/**
 * Boards at or above this score are pre-selected for the audit.
 *
 * 0.5 means at least half of the combined column vocabulary is shared. On the
 * demo account that cleanly separates template-derived boards (0.5 and up) from
 * unrelated ones (an HR board at 0, a marketing calendar at 0.18).
 *
 * It is a starting point, not a verdict — every board can be checked or
 * unchecked by hand, which is why a round number is good enough here.
 */
export const SIMILARITY_THRESHOLD = 0.5;

/**
 * Scores every board against the reference, worst last.
 *
 * Returns the boards it rejects as well as the ones it keeps, so the UI can say
 * what it left out. Silently hiding boards from an audit tool would undermine
 * the one thing the tool is for.
 *
 * **Known limitation:** a fully translated board — the same template with every
 * column renamed into another language — shares no titles with the reference
 * and scores 0. It is indistinguishable from an unrelated board on names alone,
 * and nothing else in the fetched data breaks the tie. Such boards have to be
 * ticked by hand, which is why the rejected ones stay visible and selectable.
 *
 * @param {{id: string, columns?: object[]}} reference
 * @param {{id: string, name: string, columns?: object[]}[]} boards
 */
export function scoreBoards(reference, boards) {
  return boards
    .filter((board) => board.id !== reference.id)
    .map((board) => {
      const score = similarity(reference, board);
      return { board, score, suggested: score >= SIMILARITY_THRESHOLD };
    })
    .sort((a, b) => b.score - a.score || a.board.name.localeCompare(b.board.name));
}
