/**
 * Regroups findings by the fix they require rather than by the board they were
 * found on.
 *
 * A per-board report answers "what is wrong with this board?". Someone actually
 * repairing an account has the opposite question: "what do I have to do, and how
 * many boards does each thing touch?" Twelve boards each missing the same column
 * is one job, not twelve, and the per-board view hides that.
 */

import { SEVERITY_RANK } from './diff.js';

/**
 * Builds the human label for a group, and the key that decides what gets grouped
 * together. Two findings share a group when they describe the same repair.
 *
 * Renames group on the reference title, not the board's new title: "Status was
 * renamed" is one job even when three boards each picked a different new name.
 * Those names go in `variants` so the label can stay short without losing them.
 */
const GROUPERS = {
  missing: (finding) => ({
    key: `missing:${finding.referenceTitle}:${finding.referenceType}`,
    label: `Add "${finding.referenceTitle}" (${finding.referenceType})`,
  }),
  type_mismatch: (finding) => ({
    key: `type:${finding.referenceTitle}:${finding.referenceType}`,
    label: `Change "${finding.referenceTitle}" to ${finding.referenceType}`,
    variant: finding.boardType,
  }),
  renamed: (finding) => ({
    key: `renamed:${finding.referenceTitle}`,
    label: `Rename back to "${finding.referenceTitle}"`,
    variant: finding.columnTitle,
  }),
  title_variant: (finding) => ({
    key: `variant:${finding.referenceTitle}`,
    label: `Match the reference spelling of "${finding.referenceTitle}"`,
    variant: finding.columnTitle,
  }),
  extra: (finding) => ({
    key: `extra:${finding.columnTitle}`,
    label: `Review extra column "${finding.columnTitle}"`,
  }),
  order: () => ({
    key: 'order',
    label: 'Reorder columns to match the reference',
  }),
};

/**
 * Collapses every finding into a list of jobs, worst first, then by how many
 * boards each one touches.
 *
 * @param {{boardId: string, boardName: string, findings: object[]}[]} results
 * @returns {{key: string, kind: string, severity: string, label: string,
 *            boards: string[], variants: string[]}[]}
 */
export function groupByFix(results) {
  const groups = new Map();

  for (const result of results) {
    for (const finding of result.findings) {
      const grouper = GROUPERS[finding.kind];
      // An unrecognised kind still has to reach the user. Falling back to the
      // finding's own message keeps a future finding type visible instead of
      // silently dropping it from the fix list.
      const { key, label, variant } = grouper
        ? grouper(finding)
        : { key: `${finding.kind}:${finding.message}`, label: finding.message };

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          kind: finding.kind,
          severity: finding.severity,
          severityRank: finding.severityRank,
          label,
          boards: [],
          variants: [],
        });
      }

      const group = groups.get(key);
      if (!group.boards.includes(result.boardName)) group.boards.push(result.boardName);
      if (variant && !group.variants.includes(variant)) group.variants.push(variant);
    }
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      boards: [...group.boards].sort((a, b) => a.localeCompare(b)),
      variants: [...group.variants].sort((a, b) => a.localeCompare(b)),
    }))
    .sort(
      (a, b) =>
        (a.severityRank ?? SEVERITY_RANK[a.severity]) - (b.severityRank ?? SEVERITY_RANK[b.severity]) ||
        b.boards.length - a.boards.length ||
        a.label.localeCompare(b.label),
    );
}
