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
/**
 * ✓ SIGNATURE VERIFIED 21 Sep 2026, by introspecting the dev schema.
 *
 * Every earlier version of this query was wrong, in almost every particular —
 * the argument name, the page field, the active flag, and the configuration
 * field, which does not exist at all. It was written from a documentation
 * summary and never once ran. The schema declares:
 *
 *   board_automations(ids: [ID!], board_ids: [ID!], limit: Int, cursor: String): AutomationsPage!
 *   AutomationsPage  { cursor: String, items: [BoardAutomation!], legacy_automations: JSON }
 *   BoardAutomation  { id, user_id, active, title, description, created_at,
 *                      updated_at, workflow_host_data: JSON,
 *                      workflow_blocks: JSON, workflow_variables: JSON,
 *                      importance, notice_message, template_reference_id }
 *
 * Two things follow that matter beyond fixing the call.
 *
 * **`configuration` was never real.** The recipe is three JSON fields —
 * `workflow_blocks` above all — so automation diffing is genuinely structural,
 * not the presence-counting fallback ADR-002 planned for. Kept as `unknown`
 * and compared structurally, because JSON from a preview schema is exactly the
 * shape that changes without notice.
 *
 * **`legacy_automations` exists next to `items`.** A separate bucket of
 * automations from an older era, on the same page. If the documented "44
 * became 39" case is partly legacy recipes that the modern list omits, this is
 * where that shows up — so it is captured rather than ignored, and counted
 * rather than trusted. ✱ Its shape is unverified; the account tested has none.
 *
 * **`board_ids` accepts at most one board.** No batching across boards, unlike
 * BOARD_CONFIG_QUERY. That is a rate-limit fact for any future sweep.
 */
const BOARD_AUTOMATIONS_QUERY = `
  query TemplateGuardBoardAutomations($boardIds: [ID!], $limit: Int, $cursor: String) {
    board_automations(board_ids: $boardIds, limit: $limit, cursor: $cursor) {
      cursor
      legacy_automations
      items {
        id
        title
        active
        template_reference_id
        workflow_blocks
        workflow_variables
        workflow_host_data
      }
    }
  }
`;

/** One board's worth of automations per request; the field allows no more. */
const AUTOMATIONS_PAGE_LIMIT = 100;

const MAX_AUTOMATION_PAGES = 20;

interface RawAutomationPage {
  board_automations?: {
    cursor?: string | null;
    legacy_automations?: unknown;
    items?: {
      id: string;
      title?: string | null;
      active?: boolean | null;
      template_reference_id?: string | null;
      workflow_blocks?: unknown;
      workflow_variables?: unknown;
      workflow_host_data?: unknown;
    }[] | null;
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
        { boardIds: [boardId], limit: AUTOMATIONS_PAGE_LIMIT, cursor },
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

    for (const a of payload.items ?? []) {
      collected.push({
        id: String(a.id),
        title: a.title ?? '(untitled automation)',
        isActive: a.active ?? true,
        // The recipe itself. Three fields rather than the single
        // `configuration` we invented; kept separate because they change
        // independently and a diff that says which one moved is worth more.
        workflowBlocks: a.workflow_blocks ?? null,
        workflowVariables: a.workflow_variables ?? null,
        workflowHostData: a.workflow_host_data ?? null,
        templateReferenceId: a.template_reference_id != null ? String(a.template_reference_id) : null,
        fromPreviewSchema: true,
      });
    }

    // A page carries `legacy_automations` alongside `items`. If any are
    // present they are recorded once, loudly: an older bucket of recipes that
    // the modern list omits is a plausible mechanism for the documented
    // 44-became-39 case, and silently ignoring it would be this app doing the
    // thing it exists to catch.
    if (page === 0 && hasLegacyAutomations(payload.legacy_automations)) {
      failures.push(
        partial(
          'preview_unavailable',
          `board.${boardId}.automations.legacy`,
          `This board has automations in monday's legacy format, which Template Guard does not yet read. They are NOT included in the comparison below.`,
          { degradesDiff: false, cause: payload.legacy_automations },
        ),
      );
    }

    // There is no `hasMore`; an absent cursor is the end of the list.
    cursor = payload.cursor ?? null;
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

/** ✱ Shape unverified — the tested account had none. Counted, never trusted. */
function hasLegacyAutomations(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as object).length > 0;
  return true;
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
