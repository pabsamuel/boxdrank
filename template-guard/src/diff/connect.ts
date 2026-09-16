import type { ColumnSnapshot } from '../snapshot/types.js';

/**
 * Connect-board wiring.
 *
 * This is the centre of the product. Everything else Template Guard finds is
 * something the user could eventually have noticed on their own; a mis-wired
 * connect column is the one that **looks completely fine** in the UI and
 * quietly writes into the wrong client's board for weeks.
 *
 * It is also, happily, fully detectable on the stable API: a connect column's
 * settings carry the IDs of the boards it points at (ADR-003).
 */

/** monday column types that carry a reference to another board. */
export const BOARD_REFERENCING_TYPES = new Set([
  'board_relation', // "Connect boards"
  'mirror', // "Mirror" — reads through a connect column
  'dependency', // "Dependency" — connect column under the hood
]);

export function isBoardReferencing(column: ColumnSnapshot): boolean {
  return BOARD_REFERENCING_TYPES.has(column.type);
}

/**
 * ✱ PARTIALLY UNVERIFIED — the settings key holding linked board IDs.
 *
 * In the `settings_str` era this was `boardIds`. The typed `settings` object
 * introduced in 2025-10 may spell it differently (`board_ids`, or nested under
 * `relation`). We read every plausible spelling rather than guessing one,
 * because guessing wrong here does not throw — it silently reports every board
 * as correctly wired, which is the single worst failure mode this app has.
 *
 * `linkedBoardIds` returning an empty array for a connect column is therefore
 * treated by the caller as suspicious, not as "no links".
 */
const BOARD_ID_KEYS = ['boardIds', 'board_ids', 'boardsIds', 'linkedBoardIds'];

function readIdArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value
    .map((v) => (typeof v === 'string' || typeof v === 'number' ? String(v) : null))
    .filter((v): v is string => v !== null);
  return ids.length === value.length ? ids : null;
}

/**
 * Extracts the board IDs a column points at.
 *
 * Returns `null` — not `[]` — when the settings did not contain a recognisable
 * board-id list at all. The caller must treat that as "could not determine",
 * never as "points at nothing".
 */
export function linkedBoardIds(column: ColumnSnapshot): string[] | null {
  const settings = column.settings;

  for (const key of BOARD_ID_KEYS) {
    const direct = readIdArray(settings[key]);
    if (direct) return direct;
  }

  // One level of nesting, for shapes like { relation: { boardIds: [...] } }.
  for (const value of Object.values(settings)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = value as Record<string, unknown>;
      for (const key of BOARD_ID_KEYS) {
        const found = readIdArray(nested[key]);
        if (found) return found;
      }
    }
  }

  return null;
}

export type WiringVerdict =
  /** Copy points where it should. */
  | { status: 'correct' }
  /** Copy points at the template's board. The dangerous one. */
  | { status: 'miswired'; pointsAt: string[]; shouldPointAt: string[]; selfLink: boolean }
  /** Links differ, but not in a way that implicates the template board. */
  | { status: 'altered'; templateLinks: string[]; copyLinks: string[] }
  /** Settings were unreadable on one side. Never silently "correct". */
  | { status: 'indeterminate'; reason: string };

/**
 * Compares the wiring of one matched connect-column pair.
 *
 * The failure we are hunting: the template board self-references (a connect
 * column on board A pointing back at board A — extremely common for
 * subitem-style or parent/child setups). Duplicate the board and monday copies
 * the *literal board ID*, so the copy A' still points at A. Every automation
 * running through that column now reads and writes the template, or whichever
 * client's board A happens to be.
 */
export function compareWiring(
  templateColumn: ColumnSnapshot,
  copyColumn: ColumnSnapshot,
  templateBoardId: string,
  copyBoardId: string,
): WiringVerdict {
  const templateLinks = linkedBoardIds(templateColumn);
  const copyLinks = linkedBoardIds(copyColumn);

  if (templateLinks === null || copyLinks === null) {
    return {
      status: 'indeterminate',
      reason:
        templateLinks === null
          ? 'The template column did not report which boards it connects to.'
          : 'The duplicated column did not report which boards it connects to.',
    };
  }

  const templateSelfLinks = templateLinks.includes(templateBoardId);
  const copyPointsAtTemplate = copyLinks.includes(templateBoardId);
  const copyPointsAtItself = copyLinks.includes(copyBoardId);

  // Case 1: the template self-referenced, and the copy kept pointing at the
  // template instead of re-pointing at itself.
  if (templateSelfLinks && copyPointsAtTemplate && !copyPointsAtItself) {
    return {
      status: 'miswired',
      pointsAt: copyLinks,
      shouldPointAt: templateLinks.map((id) => (id === templateBoardId ? copyBoardId : id)),
      selfLink: true,
    };
  }

  // Case 2: the copy acquired a link to the template board that the template
  // itself never had. Same practical consequence, different cause.
  if (!templateSelfLinks && copyPointsAtTemplate) {
    return {
      status: 'miswired',
      pointsAt: copyLinks,
      shouldPointAt: templateLinks,
      selfLink: false,
    };
  }

  const expected = new Set(
    templateLinks.map((id) => (id === templateBoardId ? copyBoardId : id)),
  );
  const actual = new Set(copyLinks);
  const same = expected.size === actual.size && [...expected].every((id) => actual.has(id));

  if (same) return { status: 'correct' };
  return { status: 'altered', templateLinks, copyLinks };
}
