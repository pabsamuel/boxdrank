/**
 * Compares the column structure of boards against a reference board and reports
 * where they have drifted apart.
 *
 * This module knows nothing about monday.com. It takes plain board objects and
 * returns plain findings, so it can be unit tested without an account, an API
 * token or a network. The monday-specific code lives in src/app/monday.js.
 *
 * @typedef {{ id: string, title: string, type: string }} Column
 * @typedef {{ id: string, name: string, workspaceId?: string|null, columns: Column[] }} Board
 * @typedef {{ kind: string, severity: string, severityRank: number, message: string,
 *             columnTitle?: string, referenceTitle?: string, boardTitle?: string,
 *             referenceType?: string, boardType?: string }} Finding
 */

import { normalizeTitle } from './normalize.js';

/** Findings, worst first. Rank is exposed so callers can sort without a lookup. */
export const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };

/**
 * Why each finding kind carries the severity it does:
 *
 *  type_mismatch — the silent killer. A dashboard reading Budget as a number on
 *                  one board and as text on another produces a wrong total with
 *                  no error anywhere.
 *  missing       — the column a report depends on is simply absent.
 *  renamed       — inferred, not certain. Same type, adjacent position, different
 *                  title. Worth a human look, not worth panicking over.
 *  title_variant — "Due date" vs "Due Date". Groups split in two on a dashboard.
 *  extra         — usually deliberate local customisation. Informational.
 *  order         — cosmetic. Included because consultants standardising a
 *                  template do care, and because it costs nothing to report.
 */
const SEVERITY_BY_KIND = {
  type_mismatch: 'high',
  missing: 'high',
  renamed: 'medium',
  title_variant: 'medium',
  extra: 'low',
  order: 'low',
};

/**
 * How far apart two columns may sit and still be considered a rename of one
 * another. Template-derived boards keep roughly the same column order, so a
 * same-type column that has moved more than a few places is more likely a
 * different column than a renamed one. Conservative on purpose: a missed rename
 * degrades into a missing plus an extra, which is noisier but not wrong. A false
 * rename actively misleads.
 */
const RENAME_POSITION_WINDOW = 3;

function finding(kind, message, extra = {}) {
  const severity = SEVERITY_BY_KIND[kind];
  return { kind, severity, severityRank: SEVERITY_RANK[severity], message, ...extra };
}

/**
 * Pairs up the columns of two boards in three passes, most confident first.
 * Each pass only considers columns left unmatched by the previous one.
 *
 * @param {Column[]} referenceColumns
 * @param {Column[]} boardColumns
 */
function matchColumns(referenceColumns, boardColumns) {
  const pairs = [];
  const refOpen = new Set(referenceColumns.map((_, i) => i));
  const boardOpen = new Set(boardColumns.map((_, i) => i));

  const claim = (refIndex, boardIndex, how) => {
    pairs.push({ refIndex, boardIndex, how });
    refOpen.delete(refIndex);
    boardOpen.delete(boardIndex);
  };

  // Pass 1 and 2 are the same shape, differing only in how a title is keyed.
  // Duplicate titles on one board are legal in monday, so each pass indexes
  // every candidate and takes the first still-open one.
  const matchByKey = (keyOf, how) => {
    const index = new Map();
    boardColumns.forEach((column, i) => {
      const key = keyOf(column.title);
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(i);
    });
    referenceColumns.forEach((column, refIndex) => {
      if (!refOpen.has(refIndex)) return;
      const candidates = index.get(keyOf(column.title));
      if (!candidates) return;
      const boardIndex = candidates.find((i) => boardOpen.has(i));
      if (boardIndex === undefined) return;
      claim(refIndex, boardIndex, how);
    });
  };

  matchByKey((title) => title, 'exact');
  matchByKey(normalizeTitle, 'variant');

  // Pass 3: a column of the same type sitting near the same position is most
  // likely the same column under a new name.
  referenceColumns.forEach((column, refIndex) => {
    if (!refOpen.has(refIndex)) return;
    let best;
    for (const boardIndex of boardOpen) {
      if (boardColumns[boardIndex].type !== column.type) continue;
      const distance = Math.abs(boardIndex - refIndex);
      if (distance > RENAME_POSITION_WINDOW) continue;
      if (!best || distance < best.distance) best = { boardIndex, distance };
    }
    if (best) claim(refIndex, best.boardIndex, 'renamed');
  });

  return {
    pairs,
    missingRefIndexes: [...refOpen].sort((a, b) => a - b),
    extraBoardIndexes: [...boardOpen].sort((a, b) => a - b),
  };
}

/**
 * Compares one board against the reference and returns its findings, worst
 * first. A board with no findings is returned with an empty array rather than
 * omitted, so callers can show "12 of 14 boards match" without recounting.
 *
 * @param {Board} reference
 * @param {Board} board
 * @returns {{ boardId: string, boardName: string, findings: Finding[] }}
 */
export function diffBoard(reference, board) {
  const referenceColumns = reference.columns ?? [];
  const boardColumns = board.columns ?? [];
  const { pairs, missingRefIndexes, extraBoardIndexes } = matchColumns(referenceColumns, boardColumns);
  const findings = [];

  for (const { refIndex, boardIndex, how } of pairs) {
    const ref = referenceColumns[refIndex];
    const own = boardColumns[boardIndex];

    // Reported independently of how the pair was found: a renamed column that
    // also changed type is two separate problems for whoever fixes it.
    if (ref.type !== own.type) {
      findings.push(
        finding('type_mismatch', `"${own.title}" is ${own.type}, reference has ${ref.type}`, {
          columnTitle: own.title,
          referenceTitle: ref.title,
          referenceType: ref.type,
          boardType: own.type,
        }),
      );
    }

    if (how === 'variant') {
      findings.push(
        finding('title_variant', `"${own.title}" differs from reference "${ref.title}" only in formatting`, {
          columnTitle: own.title,
          referenceTitle: ref.title,
        }),
      );
    }

    if (how === 'renamed') {
      findings.push(
        finding('renamed', `"${ref.title}" appears to have been renamed to "${own.title}"`, {
          columnTitle: own.title,
          referenceTitle: ref.title,
        }),
      );
    }
  }

  for (const refIndex of missingRefIndexes) {
    const ref = referenceColumns[refIndex];
    findings.push(
      finding('missing', `"${ref.title}" (${ref.type}) is missing`, {
        referenceTitle: ref.title,
        referenceType: ref.type,
      }),
    );
  }

  for (const boardIndex of extraBoardIndexes) {
    const own = boardColumns[boardIndex];
    findings.push(
      finding('extra', `"${own.title}" (${own.type}) is not in the reference`, {
        columnTitle: own.title,
        boardType: own.type,
      }),
    );
  }

  // One order finding per board, not one per column. Reporting every displaced
  // column would bury the high-severity findings under noise.
  const matchedInReferenceOrder = [...pairs].sort((a, b) => a.refIndex - b.refIndex);
  const outOfOrder = matchedInReferenceOrder.some(
    (pair, i) => i > 0 && pair.boardIndex < matchedInReferenceOrder[i - 1].boardIndex,
  );
  if (outOfOrder) {
    findings.push(finding('order', 'Shared columns appear in a different order than the reference'));
  }

  findings.sort((a, b) => a.severityRank - b.severityRank);
  return { boardId: board.id, boardName: board.name, findings };
}

/**
 * Compares every board against the reference. The reference is skipped if it
 * appears in the list, since comparing it with itself is always clean and only
 * pads the report.
 *
 * @param {Board} reference
 * @param {Board[]} boards
 */
export function diffBoards(reference, boards) {
  return boards.filter((board) => board.id !== reference.id).map((board) => diffBoard(reference, board));
}
