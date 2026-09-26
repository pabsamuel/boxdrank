import type { Finding } from '../diff/types.js';
import {
  automationNavigationHint,
  automationsLink,
  boardLink,
  columnLink,
  columnNavigationHint,
  viewLink,
  type DeepLinkContext,
} from './deeplinks.js';

/**
 * The repair layer: turning findings into either a button or a checklist item.
 *
 * The governing judgement is conservative. A repair that half-works on a live
 * client board is worse than no repair at all, so anything we are not certain
 * the stable API can do correctly becomes a manual checklist item with a deep
 * link — not an optimistic mutation that might leave the board in a worse
 * state than it started.
 *
 * Note especially that the highest-severity finding we produce — a mis-wired
 * connect column — is **manual**. See `MISWIRED_IS_MANUAL` below. Offering a
 * one-click fix there would be the most marketable thing this app could do and
 * also the most dangerous.
 */

export type RepairMode = 'auto' | 'manual';

export interface AutoRepair {
  mode: 'auto';
  findingId: string;
  /** Which mutation runs. Kept abstract so `execute.ts` owns the GraphQL. */
  action:
    | { type: 'create_column'; boardId: string; title: string; columnType: string; settings: Record<string, unknown> }
    | { type: 'create_group'; boardId: string; title: string }
    | { type: 'rename_column'; boardId: string; columnId: string; title: string };
  /** Shown before the user commits. Plain language, exact. */
  preview: string;
  /** What the user should check afterwards. */
  verifyHint: string;
}

export interface ManualRepair {
  mode: 'manual';
  findingId: string;
  /** Imperative, specific, one action. */
  instruction: string;
  link: string;
  /** Why we are not doing this for you. Users ask; answer before they do. */
  whyManual: string;
  navigationHint?: string;
}

export type RepairStep = AutoRepair | ManualRepair;

export interface RepairPlan {
  auto: AutoRepair[];
  manual: ManualRepair[];
  /** Findings that need no action (cosmetic, informational). */
  ignored: string[];
}

/**
 * Why a mis-wired connect column is not one-click.
 *
 * Two independent reasons, either of which alone would be enough:
 *
 *  1. monday requires that the boards being connected are linked **manually**
 *     first — "to connect items using the API, the board(s) these items reside
 *     in must be connected to the current board" or the call errors. So the
 *     one-click path does not reliably exist.
 *  2. This column already has items linked to the wrong board. Re-pointing it
 *     is not a config edit, it is a data decision: those existing links either
 *     break or get orphaned, and only the user knows which is acceptable.
 *
 * A button that silently made that choice would be exactly the kind of quiet
 * destructive behaviour this product exists to catch.
 */
const MISWIRED_IS_MANUAL =
  'monday requires connected boards to be linked by hand before the API will accept a change, and this column already has items pointing at the wrong board. Re-pointing it is a decision about that existing data, not a settings edit, so Template Guard will not make it for you.';

export function buildRepairPlan(
  findings: Finding[],
  ctx: DeepLinkContext,
  templateBoardName: string,
): RepairPlan {
  const auto: AutoRepair[] = [];
  const manual: ManualRepair[] = [];
  const ignored: string[] = [];

  for (const f of findings) {
    const step = planFor(f, ctx, templateBoardName);
    if (!step) {
      ignored.push(f.id);
      continue;
    }
    if (step.mode === 'auto') auto.push(step);
    else manual.push(step);
  }

  return { auto, manual, ignored };
}

function planFor(
  f: Finding,
  ctx: DeepLinkContext,
  templateBoardName: string,
): RepairStep | null {
  switch (f.kind) {
    case 'column.missing': {
      const columnType = String(f.evidence.type ?? '');
      const settings = (f.evidence.settings ?? {}) as Record<string, unknown>;

      // A connect column cannot be recreated correctly without also deciding
      // what it points at, so it follows the mis-wiring rule rather than the
      // create-column rule.
      if (columnType === 'board_relation' || columnType === 'mirror' || columnType === 'dependency') {
        return {
          mode: 'manual',
          findingId: f.id,
          instruction: `Add a “${f.subject.title}” connect column to this board and point it at the correct board.`,
          link: columnLink(ctx, null),
          whyManual:
            'Template Guard can create the column but cannot know which board it should connect to on this copy — pointing it at the template’s target is exactly the mistake this app exists to catch.',
          navigationHint: columnNavigationHint(f.subject.title),
        };
      }

      return {
        mode: 'auto',
        findingId: f.id,
        action: {
          type: 'create_column',
          boardId: ctx.boardId,
          title: f.subject.title,
          columnType,
          settings,
        },
        preview: `Create a ${columnType} column called “${f.subject.title}” on this board, with the same settings as the template.`,
        verifyHint: `Check that “${f.subject.title}” appears with the right options, then re-run the comparison.`,
      };
    }

    case 'group.missing':
      return {
        mode: 'auto',
        findingId: f.id,
        action: { type: 'create_group', boardId: ctx.boardId, title: f.subject.title },
        preview: `Create a group called “${f.subject.title}” on this board.`,
        verifyHint: 'Groups are created at the bottom of the board — drag it into position if order matters.',
      };

    case 'column.renamed': {
      const templateTitle = String(f.evidence.templateTitle ?? '');
      const columnId = String(f.evidence.copyColumnId ?? '');
      if (!templateTitle || !columnId) return null;
      return {
        mode: 'auto',
        findingId: f.id,
        action: { type: 'rename_column', boardId: ctx.boardId, columnId, title: templateTitle },
        preview: `Rename “${f.subject.title}” back to “${templateTitle}”.`,
        verifyHint: 'Renaming a column does not affect the data in it.',
      };
    }

    case 'column.miswired':
      return {
        mode: 'manual',
        findingId: f.id,
        instruction: `Open the “${f.subject.title}” column’s settings and change the connected board from “${templateBoardName}” to this board.`,
        link: columnLink(ctx, f.subject.id),
        whyManual: MISWIRED_IS_MANUAL,
        navigationHint: columnNavigationHint(f.subject.title),
      };

    case 'column.wiring_indeterminate':
      return {
        mode: 'manual',
        findingId: f.id,
        instruction: `Check by eye which board “${f.subject.title}” connects to, and correct it if it points at “${templateBoardName}”.`,
        link: columnLink(ctx, f.subject.id),
        whyManual:
          'Template Guard could not read this column’s settings, so it has nothing to act on. It is listed rather than skipped because an unreadable connect column is the last thing that should be assumed fine.',
        navigationHint: columnNavigationHint(f.subject.title),
      };

    case 'column.type_changed':
      return {
        mode: 'manual',
        findingId: f.id,
        instruction: `Change “${f.subject.title}” from ${String(f.evidence.copyType)} back to ${String(f.evidence.templateType)}, or add a new column of the right type and move the values across.`,
        link: columnLink(ctx, f.subject.id),
        whyManual:
          'monday cannot convert between most column types without discarding what is in them. Only you can decide whether the existing values matter.',
        navigationHint: columnNavigationHint(f.subject.title),
      };

    case 'column.settings_changed':
      return {
        mode: 'manual',
        findingId: f.id,
        instruction: `Reconcile the settings on “${f.subject.title}” with the template’s — most often this is a missing or renamed status label.`,
        link: columnLink(ctx, f.subject.id),
        whyManual:
          'Overwriting status labels would re-label existing items on this board. That is a data change, not a settings change.',
        navigationHint: columnNavigationHint(f.subject.title),
      };

    case 'column.links_changed':
      return {
        mode: 'manual',
        findingId: f.id,
        instruction: `Confirm that “${f.subject.title}” connects to the boards you intend for this client.`,
        link: columnLink(ctx, f.subject.id),
        whyManual: MISWIRED_IS_MANUAL,
        navigationHint: columnNavigationHint(f.subject.title),
      };

    case 'view.missing':
      return {
        mode: 'manual',
        findingId: f.id,
        instruction: `Recreate the “${f.subject.title}” view (type: ${String(f.evidence.type ?? 'unknown')}) on this board.`,
        link: viewLink(ctx, null),
        whyManual:
          'monday’s API does not expose view creation, so this one genuinely has to be done in the interface.',
      };

    case 'view.type_changed':
      return {
        mode: 'manual',
        findingId: f.id,
        instruction: `Recreate “${f.subject.title}” as the view type the template uses.`,
        link: viewLink(ctx, f.subject.id),
        whyManual: 'monday’s API does not expose view creation or conversion.',
      };

    case 'automation.missing':
      return {
        mode: 'manual',
        findingId: f.id,
        instruction: `Rebuild the recipe “${f.subject.title}” on this board.`,
        link: automationsLink(ctx),
        whyManual:
          'monday has not made automations part of its stable API. Template Guard will not write to your automations through a preview interface that can change without notice — the risk of silently breaking a working recipe is not worth the convenience.',
        navigationHint: automationNavigationHint(),
      };

    case 'automation.inactive':
      return {
        mode: 'manual',
        findingId: f.id,
        instruction: `Switch the recipe “${f.subject.title}” back on.`,
        link: automationsLink(ctx),
        whyManual: 'Same reason: automations are not on monday’s stable API, so Template Guard reads them at most, never writes them.',
        navigationHint: automationNavigationHint(),
      };

    case 'automation.altered':
      return {
        mode: 'manual',
        findingId: f.id,
        instruction: `Compare the recipe “${f.subject.title}” against the template’s version, step by step.`,
        link: automationsLink(ctx),
        whyManual: 'Automations are not on monday’s stable API; Template Guard never writes to them.',
        navigationHint: automationNavigationHint(),
      };

    case 'column.added':
    case 'column.width_changed':
    case 'view.reordered':
      return null;

    default:
      // An unrecognised finding kind still gets surfaced as something the user
      // can act on. Returning null here would make new finding types silently
      // vanish from the repair list — the failure mode this app is named for.
      return {
        mode: 'manual',
        findingId: f.id,
        instruction: f.howToFix,
        link: boardLink(ctx),
        whyManual: 'Template Guard has no automatic fix for this yet.',
      };
  }
}
