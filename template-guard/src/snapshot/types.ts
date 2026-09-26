import type { PartialFailure } from '../api/errors.js';

/**
 * The stored shape of a board's configuration.
 *
 * Storage rule, non-negotiable: **board IDs, column IDs and configuration
 * only.** No item names, no column values, no files, no user emails. If a
 * field you are adding could contain something a customer typed into a row,
 * it does not belong in this type. See CLAUDE.md rule 4.
 */

/**
 * Bumped to 2 on 21 Sep 2026: `AutomationSnapshot.configuration` never existed
 * on monday's schema and was replaced by the three real recipe fields
 * (ADR-031). Any snapshot written before that is refused on read rather than
 * coerced — a diff against a snapshot we cannot fully read would report
 * artefacts of our own schema change as findings.
 */
export const SNAPSHOT_SCHEMA_VERSION = 2;

export interface ColumnSnapshot {
  id: string;
  title: string;
  /** monday column type, e.g. `status`, `board_relation`, `text`. */
  type: string;
  description: string | null;
  archived: boolean;
  /** Cosmetic. Never blocks a diff. */
  width: number | null;
  /**
   * Parsed column settings. For `board_relation` (connect boards) this is
   * where the linked board IDs live — the mis-wiring detector's raw material.
   */
  settings: Record<string, unknown>;
  /** True when we had to fall back to the deprecated `settings_str`. */
  settingsFromDeprecatedField: boolean;
}

export interface GroupSnapshot {
  id: string;
  title: string;
  color: string | null;
  position: string | null;
  archived: boolean;
}

export interface ViewSnapshot {
  id: string;
  name: string;
  type: string;
  settings: Record<string, unknown>;
  /** Index in the board's view order. Cosmetic. */
  position: number;
}

export interface AutomationSnapshot {
  id: string;
  title: string;
  isActive: boolean;
  /**
   * The recipe graph. ✓ Structured JSON, verified 21 Sep 2026 — there is no
   * `configuration` field, which is what we spent months assuming.
   *
   * Three fields rather than one because they change independently, and a
   * finding that says *which* part moved is worth more than one that says
   * something did. `unknown` rather than a shape, because this is preview
   * schema: it may change without notice, and the diff compares it
   * structurally rather than reading into it.
   */
  workflowBlocks: unknown;
  workflowVariables: unknown;
  workflowHostData: unknown;
  /**
   * Set when the automation came from a monday recipe template.
   *
   * Not used yet. Recorded because an automation that lost its template
   * reference during duplication is a plausible shape for the documented
   * "44 became 39", and this is the only place that fact would be visible.
   */
  templateReferenceId: string | null;
  /** Always true for now: everything here came from the preview schema. */
  fromPreviewSchema: boolean;
}

export interface BoardSnapshot {
  schemaVersion: number;
  boardId: string;
  name: string;
  description: string | null;
  state: string;
  boardKind: string;
  workspaceId: string | null;
  boardFolderId: string | null;
  permissions: string | null;
  columns: ColumnSnapshot[];
  groups: GroupSnapshot[];
  views: ViewSnapshot[];
  tags: { id: string; name: string }[];
  ownerIds: string[];
  subscriberIds: string[];
  /**
   * Present only when FEATURE_AUTOMATIONS_PREVIEW was on AND the read
   * succeeded. `null` means "we did not or could not look" — which the UI must
   * render differently from an empty array, which means "we looked, there are
   * none."
   */
  automations: AutomationSnapshot[] | null;
  capturedAt: string;
  /** Everything that went wrong while capturing. Never empty-and-hidden. */
  failures: PartialFailure[];
}

/** A template board the user has designated, plus the copies linked to it. */
export interface TemplateRecord {
  templateBoardId: string;
  accountId: string;
  label: string;
  snapshot: BoardSnapshot;
  linkedBoardIds: string[];
  createdAt: string;
  updatedAt: string;
}

export function isSnapshotComplete(s: BoardSnapshot): boolean {
  return s.failures.length === 0;
}

/**
 * True when the snapshot is too damaged to diff honestly. The UI must refuse
 * to show a diff in this state rather than show a misleadingly short one.
 */
export function isSnapshotUnusable(s: BoardSnapshot): boolean {
  return s.failures.some((f) => f.degradesDiff && f.scope.endsWith('.columns'));
}
