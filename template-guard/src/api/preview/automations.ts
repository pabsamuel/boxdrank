/**
 * THE PREVIEW BOUNDARY.
 *
 * Everything in this file talks to monday's **dev (preview)** GraphQL schema,
 * which monday documents as "subject to change" and which — unlike the stable
 * schema — **cannot be version-pinned**. When it changes, it changes under us
 * with no deprecation window and no header to freeze.
 *
 * The rules that make that acceptable (ADR-002):
 *
 *   1. This is the ONLY file that may reference a preview-schema operation.
 *      If you need preview data elsewhere, import from here.
 *   2. It is READ-ONLY. We never write to a customer's automation config from
 *      an unpinnable schema.
 *   3. It is behind FEATURE_AUTOMATIONS_PREVIEW, default OFF.
 *   4. **No paid tier may depend on it.** Billing gates on board-structure
 *      features only. If this file stops working tomorrow, no customer loses
 *      anything they paid for.
 *   5. Every failure here is non-fatal by construction: the caller gets `null`
 *      and a clearly-labelled failure, and the rest of the app is unaffected.
 *
 * If monday promotes `board_automations` to the stable schema, this file moves
 * up a directory, the flag is deleted, and ADR-002 gets a superseding entry.
 */

import type { GraphQLError, MondayClient } from '../client.js';
import { partial, type PartialFailure } from '../errors.js';
import { MONDAY_API_PREVIEW_VERSION } from '../version.js';
import type { AutomationSnapshot } from '../../snapshot/types.js';

/**
 * ✱ UNVERIFIED — every identifier in this query.
 *
 * Derived from monday's Platform MCP documentation for the `list_automations`
 * tool, which states it "queries `board_automations`" and returns `id`,
 * `title`, `is_active` and `configuration` plus `{ nextCursor, hasMore }`.
 * The exact GraphQL spelling, argument names and nesting have NOT been run
 * against a live account.
 *
 * This is precisely why the flag defaults to off.
 */
const BOARD_AUTOMATIONS_QUERY = `
  query TemplateGuardBoardAutomations($boardId: ID!, $cursor: String) {
    board_automations(board_id: $boardId, cursor: $cursor) {
      automations {
        id
        title
        is_active
        configuration
      }
      pagination {
        nextCursor
        hasMore
      }
    }
  }
`;

const MAX_AUTOMATION_PAGES = 20;

interface RawAutomationPage {
  board_automations?: {
    automations?: { id: string; title: string; is_active?: boolean; configuration?: unknown }[];
    pagination?: { nextCursor?: string | null; hasMore?: boolean };
  } | null;
}

/**
 * Reads a board's automations, or returns `null` if it could not.
 *
 * `null` and `[]` mean different things and the UI renders them differently:
 * `null` is "we did not manage to look", `[]` is "we looked, there are none."
 * Conflating those would let the app report a board as clean when it is
 * actually unread — the exact silent failure this product exists to catch.
 */
export async function readBoardAutomations(
  client: MondayClient,
  boardId: string,
  failures: PartialFailure[],
): Promise<AutomationSnapshot[] | null> {
  const collected: AutomationSnapshot[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < MAX_AUTOMATION_PAGES; page += 1) {
    let data: RawAutomationPage | undefined;
    let errors: GraphQLError[];

    try {
      ({ data, errors } = await client.request<RawAutomationPage>(
        BOARD_AUTOMATIONS_QUERY,
        { boardId, cursor },
        // The dev schema, not the pinned version. A live run on 21 Sep showed
        // this read failing while every stable query succeeded — preview
        // fields do not exist on a pinned version, which is precisely why
        // they cannot be version-pinned and why this sits behind a flag.
        MONDAY_API_PREVIEW_VERSION,
      ));
    } catch (cause) {
      failures.push(previewFailure(boardId, cause));
      return null;
    }

    if (errors.length > 0) {
      failures.push(previewFailure(boardId, errors));
      return null;
    }

    const payload: NonNullable<RawAutomationPage['board_automations']> | undefined =
      data?.board_automations ?? undefined;
    if (!payload) {
      failures.push(previewFailure(boardId, 'empty response'));
      return null;
    }

    for (const a of payload.automations ?? []) {
      collected.push({
        id: String(a.id),
        title: a.title,
        isActive: a.is_active ?? true,
        configuration: a.configuration ?? null,
        fromPreviewSchema: true,
      });
    }

    if (!payload.pagination?.hasMore) return collected;
    cursor = payload.pagination.nextCursor ?? null;
    if (!cursor) return collected;
  }

  failures.push(
    partial(
      'preview_unavailable',
      `board.${boardId}.automations`,
      `This board has more automations than Template Guard reads in one pass. The automation list shown is incomplete.`,
      { degradesDiff: false },
    ),
  );
  return collected;
}

function previewFailure(boardId: string, cause: unknown): PartialFailure {
  return partial(
    'preview_unavailable',
    `board.${boardId}.automations`,
    `Template Guard could not read this board's automations. monday has not yet made automations part of its stable API, and the preview interface changed or was unavailable. Everything else in this comparison is unaffected — but automations were NOT checked.`,
    { degradesDiff: false, cause },
  );
}

/** Reads the flag. Anything other than an explicit "true" is off. */
export function automationsPreviewEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.FEATURE_AUTOMATIONS_PREVIEW === 'true';
}
