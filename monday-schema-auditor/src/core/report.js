/**
 * Turns per-board findings into the numbers the report header shows, and into
 * a flat CSV a consultant can hand to a client.
 */

import { SEVERITY_RANK } from './diff.js';

const SEVERITIES = Object.keys(SEVERITY_RANK);

/**
 * Rolls per-board results up into account-level counts.
 *
 * `cleanBoards` is reported separately from `boardsWithFindings` because "9 of
 * 14 boards match the template" is the sentence an admin actually wants, and it
 * cannot be derived from a list that omits the clean ones.
 *
 * @param {{ boardId: string, boardName: string, findings: {kind:string,severity:string}[] }[]} results
 */
export function summarize(results) {
  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  const byKind = {};
  let totalFindings = 0;

  for (const result of results) {
    for (const item of result.findings) {
      totalFindings += 1;
      bySeverity[item.severity] += 1;
      byKind[item.kind] = (byKind[item.kind] ?? 0) + 1;
    }
  }

  const boardsWithFindings = results.filter((r) => r.findings.length > 0).length;

  return {
    boardsCompared: results.length,
    boardsWithFindings,
    cleanBoards: results.length - boardsWithFindings,
    totalFindings,
    bySeverity,
    byKind,
  };
}

/**
 * Orders boards worst-first for display: most high-severity findings, then most
 * medium, then most low, then by name so the order is stable between runs.
 * A stable order matters — an admin re-running the audit after a fix should see
 * the list shift only where something actually changed.
 */
export function rankBoards(results) {
  const weight = (result, severity) => result.findings.filter((f) => f.severity === severity).length;
  return [...results].sort(
    (a, b) =>
      weight(b, 'high') - weight(a, 'high') ||
      weight(b, 'medium') - weight(a, 'medium') ||
      weight(b, 'low') - weight(a, 'low') ||
      a.boardName.localeCompare(b.boardName),
  );
}

/** Quotes a value for CSV: doubles any quote, wraps if it could break a cell. */
function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Flat CSV, one row per finding. Excel-friendly CRLF line endings.
 * Boards with no findings are omitted — the summary already counts them, and a
 * row saying "nothing wrong" is not something anyone acts on.
 */
export function toCsv(results, referenceName) {
  const header = [
    'reference_board',
    'board',
    'severity',
    'finding',
    'column',
    'reference_column',
    'board_type',
    'reference_type',
    'message',
  ];
  const rows = [header.map(csvCell).join(',')];

  for (const result of results) {
    for (const item of result.findings) {
      rows.push(
        [
          referenceName,
          result.boardName,
          item.severity,
          item.kind,
          item.columnTitle ?? '',
          item.referenceTitle ?? '',
          item.boardType ?? '',
          item.referenceType ?? '',
          item.message,
        ]
          .map(csvCell)
          .join(','),
      );
    }
  }

  return rows.join('\r\n');
}
