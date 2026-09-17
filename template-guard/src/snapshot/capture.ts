import { MondayClient, type GraphQLError } from '../api/client.js';
import { classifyGraphQLError, partial, type PartialFailure } from '../api/errors.js';
import {
  BOARD_BATCH_SIZE,
  BOARD_CONFIG_QUERY,
  BOARD_PEOPLE_QUERY,
  USERS_PAGE_LIMIT,
} from '../api/queries.js';
import { readBoardAutomations } from '../api/preview/automations.js';
import {
  SNAPSHOT_SCHEMA_VERSION,
  type BoardSnapshot,
  type ColumnSnapshot,
  type GroupSnapshot,
  type ViewSnapshot,
} from './types.js';

/** Raw shapes as they come off the wire. Narrow, then discard. */
interface RawColumn {
  id: string;
  title: string;
  type: string;
  description?: string | null;
  archived?: boolean | null;
  width?: number | null;
  settings?: unknown;
  settings_str?: string | null;
}

interface RawBoard {
  id: string;
  name: string;
  description?: string | null;
  state?: string | null;
  board_kind?: string | null;
  board_folder_id?: string | null;
  workspace_id?: string | null;
  permissions?: string | null;
  columns?: RawColumn[] | null;
  groups?:
    | {
        id: string;
        title: string;
        color?: string | null;
        position?: string | null;
        archived?: boolean | null;
      }[]
    | null;
  views?:
    | {
        id: string;
        name: string;
        type: string;
        settings_str?: string | null;
        view_specific_data_str?: string | null;
      }[]
    | null;
  tags?: { id: string; name: string }[] | null;
}

/**
 * Parses a JSON-ish settings value into an object without ever throwing.
 *
 * A column whose settings we cannot parse is a real finding, not a crash — the
 * caller gets `null` and turns it into a visible failure.
 */
export function parseSettings(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '' || trimmed === '{}') return {};
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      // Deliberate: a malformed settings blob is reported, never swallowed.
      // The `null` return is what makes it visible upstream.
      return null;
    }
  }
  return null;
}

export function toColumnSnapshot(
  raw: RawColumn,
  boardId: string,
  failures: PartialFailure[],
): ColumnSnapshot {
  const typed = parseSettings(raw.settings);
  const deprecated = typed === null ? parseSettings(raw.settings_str) : null;
  const settings = typed ?? deprecated;

  if (settings === null) {
    failures.push(
      partial(
        'unexpected_shape',
        `board.${boardId}.columns.${raw.id}.settings`,
        `Could not read the settings for column "${raw.title}". Anything configured inside that column is excluded from the comparison.`,
        { degradesDiff: true },
      ),
    );
  }

  return {
    id: raw.id,
    title: raw.title,
    type: raw.type,
    description: raw.description ?? null,
    archived: raw.archived ?? false,
    width: raw.width ?? null,
    settings: settings ?? {},
    settingsFromDeprecatedField: typed === null && deprecated !== null,
  };
}

function toGroupSnapshot(raw: NonNullable<RawBoard['groups']>[number]): GroupSnapshot {
  return {
    id: raw.id,
    title: raw.title,
    color: raw.color ?? null,
    position: raw.position ?? null,
    archived: raw.archived ?? false,
  };
}

function toViewSnapshot(
  raw: NonNullable<RawBoard['views']>[number],
  index: number,
): ViewSnapshot {
  return {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    settings: parseSettings(raw.settings_str) ?? {},
    position: index,
  };
}

function failuresFromGraphQL(errors: GraphQLError[], boardId: string): PartialFailure[] {
  return errors.map((e) => {
    const kind = classifyGraphQLError(e);
    const scope = e.path?.length ? `board.${boardId}.${e.path.join('.')}` : `board.${boardId}`;
    const message =
      kind === 'permission_denied'
        ? `monday refused part of this board's configuration. Template Guard may need broader board permissions, or this board is restricted.`
        : kind === 'schema_mismatch'
          ? `Template Guard asked monday for a field it no longer recognises. This is a bug in Template Guard, not in your board — please report it.`
          : (e.message ?? 'monday returned an error while reading this board.');
    return partial(kind, scope, message, { degradesDiff: true, cause: e });
  });
}

export interface CaptureOptions {
  /** Reads automations from the preview schema. Default off. See ADR-002. */
  automationsPreviewEnabled?: boolean;
  now?: () => Date;
}

/**
 * Captures board configuration for up to BOARD_BATCH_SIZE boards per round trip.
 *
 * Returns one snapshot per requested board ID. A board that could not be read
 * at all still produces a snapshot — an empty one carrying the failure — so a
 * caller can never mistake "we could not read it" for "it is empty". That
 * distinction is the whole product.
 */
export async function captureBoards(
  client: MondayClient,
  boardIds: string[],
  opts: CaptureOptions = {},
): Promise<BoardSnapshot[]> {
  const now = opts.now ?? (() => new Date());
  const out: BoardSnapshot[] = [];

  for (let i = 0; i < boardIds.length; i += BOARD_BATCH_SIZE) {
    const batch = boardIds.slice(i, i + BOARD_BATCH_SIZE);
    const { data, errors } = await client.request<{ boards: RawBoard[] | null }>(
      BOARD_CONFIG_QUERY,
      { ids: batch },
    );

    const boards = data?.boards ?? [];
    const byId = new Map(boards.map((b) => [String(b.id), b]));

    for (const boardId of batch) {
      const raw = byId.get(boardId);
      const failures = failuresFromGraphQL(errors, boardId);

      if (!raw) {
        out.push(emptySnapshot(boardId, now(), [
          ...failures,
          partial(
            'permission_denied',
            `board.${boardId}`,
            `monday returned nothing for board ${boardId}. It may have been deleted, or Template Guard may not have access to it.`,
            { degradesDiff: true },
          ),
        ]));
        continue;
      }

      const columns = (raw.columns ?? []).map((c) => toColumnSnapshot(c, boardId, failures));
      if (raw.columns == null) {
        failures.push(
          partial(
            'unexpected_shape',
            `board.${boardId}.columns`,
            `monday returned no column list for this board. Template Guard cannot compare it — the result would be misleading.`,
            { degradesDiff: true },
          ),
        );
      }

      const people = await capturePeople(client, boardId, failures);
      const automations = opts.automationsPreviewEnabled
        ? await readBoardAutomations(client, boardId, failures)
        : null;

      out.push({
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        boardId,
        name: raw.name,
        description: raw.description ?? null,
        state: raw.state ?? 'active',
        boardKind: raw.board_kind ?? 'public',
        workspaceId: raw.workspace_id != null ? String(raw.workspace_id) : null,
        boardFolderId: raw.board_folder_id != null ? String(raw.board_folder_id) : null,
        permissions: raw.permissions ?? null,
        columns,
        groups: (raw.groups ?? []).map(toGroupSnapshot),
        views: (raw.views ?? []).map(toViewSnapshot),
        tags: raw.tags ?? [],
        ownerIds: people.ownerIds,
        subscriberIds: people.subscriberIds,
        automations,
        capturedAt: now().toISOString(),
        failures,
      });
    }
  }

  return out;
}

/**
 * Owners and subscribers, explicitly paginated.
 *
 * 2026-07 capped `users` at 200 per page and made over-reading fail silently.
 * We therefore walk pages until one comes back short, and if we hit the page
 * ceiling we record a failure rather than quietly returning a truncated list.
 */
async function capturePeople(
  client: MondayClient,
  boardId: string,
  failures: PartialFailure[],
): Promise<{ ownerIds: string[]; subscriberIds: string[] }> {
  const ownerIds: string[] = [];
  const subscriberIds: string[] = [];
  const MAX_PAGES = 25; // 5,000 people on one board is already pathological.

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data, errors } = await client.request<{
      boards: { id: string; owners?: { id: string }[]; subscribers?: { id: string }[] }[] | null;
    }>(BOARD_PEOPLE_QUERY, { ids: [boardId], limit: USERS_PAGE_LIMIT, page });

    if (errors.length > 0) {
      failures.push(...failuresFromGraphQL(errors, boardId));
      break;
    }

    const board = data?.boards?.[0];
    const owners = board?.owners ?? [];
    const subscribers = board?.subscribers ?? [];
    ownerIds.push(...owners.map((u) => String(u.id)));
    subscriberIds.push(...subscribers.map((u) => String(u.id)));

    const full = owners.length === USERS_PAGE_LIMIT || subscribers.length === USERS_PAGE_LIMIT;
    if (!full) return { ownerIds, subscriberIds };

    if (page === MAX_PAGES) {
      failures.push(
        partial(
          'unexpected_shape',
          `board.${boardId}.people`,
          `This board has an unusually large number of owners or subscribers; Template Guard stopped reading after ${MAX_PAGES * USERS_PAGE_LIMIT}. Permissions comparison for this board may be incomplete.`,
          { degradesDiff: false },
        ),
      );
    }
  }

  return { ownerIds, subscriberIds };
}

export function emptySnapshot(
  boardId: string,
  at: Date,
  failures: PartialFailure[],
): BoardSnapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    boardId,
    name: '',
    description: null,
    state: 'unknown',
    boardKind: 'unknown',
    workspaceId: null,
    boardFolderId: null,
    permissions: null,
    columns: [],
    groups: [],
    views: [],
    tags: [],
    ownerIds: [],
    subscriberIds: [],
    automations: null,
    capturedAt: at.toISOString(),
    failures,
  };
}
