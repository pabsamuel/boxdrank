import type { MondayClient } from '../api/client.js';
import { TemplateGuardError } from '../api/errors.js';
import { captureBoards } from '../snapshot/capture.js';
import type { BoardSnapshot, TemplateRecord } from '../snapshot/types.js';
import { diffBoards } from '../diff/diff.js';
import { countBySeverity, type DiffResult } from '../diff/types.js';
import { canUseDriftMonitoring, type AccountPlan } from '../billing/tiers.js';

/**
 * Scheduled drift monitoring — the Pro feature.
 *
 * What it sells is not detection (the free tier detects) but *not having to
 * remember*. A board drifts weeks after it was duplicated, when someone
 * "tidies up" a column or an admin turns a recipe off. Nobody re-runs a manual
 * comparison on a board that has been fine for a month.
 *
 * This is also the single most likely feature to get the app rate-limited,
 * because it issues reads on a timer across every linked board of every paying
 * account. So it is deliberately unhurried: small batches, a pause between
 * them, an overall budget, and a hard stop the moment monday pushes back.
 * Being an hour late with a drift alert costs nothing. Getting the app's API
 * access throttled costs every customer at once.
 */

export interface DriftFinding {
  templateBoardId: string;
  copyBoardId: string;
  diff: DiffResult;
  /** Severity counts, for deciding whether this is worth a notification. */
  counts: ReturnType<typeof countBySeverity>;
}

export interface DriftReport {
  accountId: string;
  checkedBoardIds: string[];
  drifted: DriftFinding[];
  /** Boards we intended to check but did not get to. Never silently dropped. */
  skippedBoardIds: string[];
  /** Why each skip happened, in the same order. */
  skipReasons: string[];
  startedAt: string;
  finishedAt: string;
}

export interface DriftOptions {
  /** Boards per API round trip. Kept small; see the note above. */
  batchSize?: number;
  /** Pause between batches, to stay well inside the complexity budget. */
  pauseMs?: number;
  /** Hard ceiling on a single sweep, so one big account cannot monopolise. */
  maxBoardsPerRun?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  automationsPreviewEnabled?: boolean;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runDriftCheck(
  client: MondayClient,
  plan: AccountPlan,
  template: TemplateRecord,
  opts: DriftOptions = {},
): Promise<DriftReport> {
  const gate = canUseDriftMonitoring(plan);
  if (!gate.allowed) {
    throw new TemplateGuardError(gate.reason, 'permission_denied');
  }

  const now = opts.now ?? (() => new Date());
  const sleep = opts.sleep ?? defaultSleep;
  const batchSize = opts.batchSize ?? 5;
  const pauseMs = opts.pauseMs ?? 1_000;
  const maxBoards = opts.maxBoardsPerRun ?? 100;

  const startedAt = now().toISOString();
  const targets = template.linkedBoardIds.slice(0, maxBoards);
  const skippedBoardIds = template.linkedBoardIds.slice(maxBoards);
  const skipReasons = skippedBoardIds.map(
    () => 'Not checked in this run: the account exceeded the per-run board budget. It will be picked up next run.',
  );

  const checkedBoardIds: string[] = [];
  const drifted: DriftFinding[] = [];

  for (let i = 0; i < targets.length; i += batchSize) {
    const batch = targets.slice(i, i + batchSize);

    let snapshots: BoardSnapshot[];
    try {
      snapshots = await captureBoards(client, batch, {
        automationsPreviewEnabled: opts.automationsPreviewEnabled ?? false,
        now,
      });
    } catch (err) {
      // Stop the sweep rather than hammering an API that is already pushing
      // back — but record every board we did not reach, so the report never
      // implies "checked and clean".
      const unreached = targets.slice(i);
      skippedBoardIds.push(...unreached);
      skipReasons.push(
        ...unreached.map(
          () =>
            err instanceof TemplateGuardError && err.kind === 'rate_limited'
              ? 'Not checked: monday rate-limited this account mid-sweep. Template Guard stopped rather than make it worse.'
              : 'Not checked: Template Guard could not reach monday during this run.',
        ),
      );
      break;
    }

    for (const snapshot of snapshots) {
      checkedBoardIds.push(snapshot.boardId);
      const diff = diffBoards(template.snapshot, snapshot, { now });
      const counts = countBySeverity(diff.findings);
      if (isWorthReporting(diff)) {
        drifted.push({
          templateBoardId: template.templateBoardId,
          copyBoardId: snapshot.boardId,
          diff,
          counts,
        });
      }
    }

    if (i + batchSize < targets.length) await sleep(pauseMs);
  }

  return {
    accountId: plan.accountId,
    checkedBoardIds,
    drifted,
    skippedBoardIds,
    skipReasons,
    startedAt,
    finishedAt: now().toISOString(),
  };
}

/**
 * Whether a drift result deserves the user's attention.
 *
 * Cosmetic-only drift does not. A monitor that emails about a column width
 * teaches people to ignore it, and then the one that matters gets ignored too.
 * A failed read, on the other hand, always surfaces — "we could not check this
 * board" is exactly the kind of thing this product refuses to swallow.
 */
export function isWorthReporting(diff: DiffResult): boolean {
  if (diff.basedOnIncompleteData) return true;
  return diff.findings.some((f) => f.severity !== 'cosmetic');
}

/** One notification per drifted board, worded for a push or email. */
export function notificationFor(finding: DriftFinding, boardName: string): string {
  const { counts } = finding;
  if (counts.miswired > 0) {
    return `“${boardName}” has ${counts.miswired === 1 ? 'a connect column' : `${counts.miswired} connect columns`} pointing at the wrong board. Items may be going to the wrong client's board.`;
  }
  if (counts.missing > 0) {
    return `“${boardName}” is missing ${counts.missing} thing${counts.missing === 1 ? '' : 's'} its template has.`;
  }
  return `“${boardName}” has drifted from its template.`;
}
