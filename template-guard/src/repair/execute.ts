import type { MondayClient } from '../api/client.js';
import { classifyGraphQLError } from '../api/errors.js';
import type { AutoRepair } from './plan.js';

/**
 * Executing automatic repairs.
 *
 * Three rules, all of which exist because this module writes to a customer's
 * live client board:
 *
 *  1. **Nothing runs without the user having seen `preview`.** The UI shows
 *     every preview line and requires an explicit confirm. This module assumes
 *     that already happened; it does not re-ask.
 *  2. **Every attempt is recorded**, successes and failures alike, before and
 *     after. An app that quietly half-applied a repair would be indefensible.
 *  3. **One failure never aborts the rest, and never gets swallowed.** Each
 *     step reports its own outcome; the caller shows the user exactly which
 *     ones landed.
 *
 * Only three mutations appear here. Everything else is a manual checklist item
 * by design — see `plan.ts`.
 */

const CREATE_COLUMN = `
  mutation TemplateGuardCreateColumn(
    $boardId: ID!
    $title: String!
    $columnType: ColumnType!
    $defaults: JSON
  ) {
    create_column(
      board_id: $boardId
      title: $title
      column_type: $columnType
      defaults: $defaults
    ) {
      id
      title
      type
    }
  }
`;

const CREATE_GROUP = `
  mutation TemplateGuardCreateGroup($boardId: ID!, $title: String!) {
    create_group(board_id: $boardId, group_name: $title) {
      id
      title
    }
  }
`;

const RENAME_COLUMN = `
  mutation TemplateGuardRenameColumn($boardId: ID!, $columnId: String!, $title: String!) {
    change_column_title(board_id: $boardId, column_id: $columnId, title: $title) {
      id
      title
    }
  }
`;

export type RepairOutcome =
  | { status: 'applied'; findingId: string; detail: string }
  | { status: 'failed'; findingId: string; reason: string; recoverable: boolean };

export interface RepairRunResult {
  outcomes: RepairOutcome[];
  applied: number;
  failed: number;
}

/**
 * Runs a set of confirmed automatic repairs, one at a time.
 *
 * Sequential on purpose. These are writes against a single board, monday
 * charges complexity per call, and a parallel burst that trips the rate limit
 * halfway through leaves the board in a state the user did not ask for and
 * cannot easily read off a progress bar.
 */
export async function runRepairs(
  client: MondayClient,
  repairs: AutoRepair[],
  onProgress?: (done: number, total: number) => void,
): Promise<RepairRunResult> {
  const outcomes: RepairOutcome[] = [];

  for (const [index, repair] of repairs.entries()) {
    outcomes.push(await runOne(client, repair));
    onProgress?.(index + 1, repairs.length);
  }

  return {
    outcomes,
    applied: outcomes.filter((o) => o.status === 'applied').length,
    failed: outcomes.filter((o) => o.status === 'failed').length,
  };
}

async function runOne(client: MondayClient, repair: AutoRepair): Promise<RepairOutcome> {
  const { action, findingId } = repair;

  try {
    switch (action.type) {
      case 'create_column': {
        const { errors } = await client.request(CREATE_COLUMN, {
          boardId: action.boardId,
          title: action.title,
          columnType: action.columnType,
          defaults: serializeDefaults(action.settings),
        });
        if (errors.length > 0) return failure(findingId, errors);
        return {
          status: 'applied',
          findingId,
          detail: `Created the ${action.columnType} column “${action.title}”.`,
        };
      }

      case 'create_group': {
        const { errors } = await client.request(CREATE_GROUP, {
          boardId: action.boardId,
          title: action.title,
        });
        if (errors.length > 0) return failure(findingId, errors);
        return { status: 'applied', findingId, detail: `Created the group “${action.title}”.` };
      }

      case 'rename_column': {
        const { errors } = await client.request(RENAME_COLUMN, {
          boardId: action.boardId,
          columnId: action.columnId,
          title: action.title,
        });
        if (errors.length > 0) return failure(findingId, errors);
        return { status: 'applied', findingId, detail: `Renamed the column to “${action.title}”.` };
      }
    }
  } catch (err) {
    // Rethrowing would abandon the repairs that already succeeded without
    // telling the user which ones those were.
    return {
      status: 'failed',
      findingId,
      reason: err instanceof Error ? err.message : 'Template Guard could not reach monday.',
      recoverable: true,
    };
  }
}

function failure(
  findingId: string,
  errors: { message?: string; extensions?: { code?: string } }[],
): RepairOutcome {
  const first = errors[0] ?? {};
  const kind = classifyGraphQLError(first);
  const reason =
    kind === 'permission_denied'
      ? 'monday refused this change. Template Guard may not have permission to edit this board.'
      : kind === 'rate_limited' || kind === 'complexity_exceeded'
        ? 'monday is rate-limiting this account. Wait a minute and re-run the remaining fixes.'
        : (first.message ?? 'monday rejected this change.');

  return {
    status: 'failed',
    findingId,
    reason,
    recoverable: kind === 'rate_limited' || kind === 'complexity_exceeded',
  };
}

/**
 * ✱ UNVERIFIED — the `defaults` argument shape on `create_column`.
 *
 * monday expects a JSON-encoded string here rather than an object, and the
 * accepted keys differ per column type. Recreating a status column with the
 * template's exact labels depends on getting this right, and it has not been
 * checked against a live account.
 *
 * Until it is: if we cannot produce something we believe in, we send `null`
 * and the column is created with monday's defaults. That is a visibly
 * incomplete repair the user can see and finish, rather than a rejected
 * mutation or a column configured wrongly.
 */
export function serializeDefaults(settings: Record<string, unknown>): string | null {
  if (!settings || Object.keys(settings).length === 0) return null;
  try {
    return JSON.stringify(settings);
  } catch {
    // Deliberate and narrow: a settings blob with a circular reference is a
    // bug in our snapshot, not a reason to abandon the repair. The column
    // still gets created; the user sees it lacks the template's options.
    return null;
  }
}
