/**
 * The only file that talks to monday.com.
 *
 * Everything monday-specific lives here so the detection engine in src/core
 * stays testable without an account, a token or a network.
 */

import { singleLine } from '../core/sanitize.js';

/**
 * The window a millisecond timestamp must land in, used to decide what unit an
 * activity log is using. 1e12 ms is Sep 2001; 1e13 ms is 2286.
 *
 * Deliberately exactly one decade wide. A wider window would make
 * power-of-ten normalisation ambiguous — a value could land inside it at the
 * wrong scale and be silently off by 10x. monday was founded in 2012, so
 * nothing it returns predates the lower bound.
 */
const MS_LOWER = 1e12;
const MS_UPPER = 1e13;

/**
 * Parses a monday activity-log timestamp into epoch milliseconds.
 *
 * **This is defensive on purpose.** The exact format `created_at` uses is
 * UNVERIFIED — developer.monday.com was unreachable while this was written, and
 * there is a community thread specifically about the `created_at` field format,
 * which is not a thread that exists for a plain ISO string. monday is known to
 * return microsecond-precision integers in some fields.
 *
 * Guessing wrong here would not throw. It would silently rescale every interval,
 * and the cadence engine would then report confident nonsense — the precise
 * failure this product exists to prevent. So instead of assuming a format, this
 * normalises by magnitude until the number lands in a range that is a real date.
 *
 * **Verified against a real account on 21 Sep 2026.** monday returns 17-digit
 * values like `17899565625638124`, which are **100-nanosecond ticks** — 10^-7
 * seconds, or ten thousand times a millisecond. That is not a factor of 1000
 * away from any of the usual units, and the first version of this function
 * stepped by 1000, so it overshot the window and returned null for every real
 * entry. The app would have reported an empty account rather than a wrong one —
 * the defensive direction, and still useless.
 *
 * Stepping by ten instead handles seconds, milliseconds, microseconds,
 * 100-nanosecond ticks and nanoseconds alike, and anything that cannot be made
 * sense of still returns null rather than a wrong number.
 *
 * @param {unknown} value
 * @returns {number|null} Epoch ms, or null if unusable.
 */
export function parseActivityTimestamp(value) {
  if (value === null || value === undefined) return null;

  // Numeric, or a string of digits: decide the unit by magnitude.
  const isNumeric = typeof value === 'number' || /^\d+$/.test(String(value).trim());

  if (isNumeric) {
    const numeric = Number(typeof value === 'number' ? value : String(value).trim());
    // A numeric value is handled numerically or not at all. Falling through to
    // Date.parse would be worse than useless: Date.parse("0") yields the year
    // 2000 in Node, turning an obviously broken value into a confident date.
    if (!Number.isFinite(numeric) || numeric <= 0) return null;

    // Stepping by ten, not by a thousand: monday's real unit is 10^-7 seconds,
    // which no power of 1000 reaches from milliseconds.
    let candidate = numeric;
    let steps = 0;
    while (candidate < MS_LOWER && steps < 30) {
      candidate *= 10;
      steps += 1;
    }
    while (candidate >= MS_UPPER && steps < 30) {
      candidate /= 10;
      steps += 1;
    }
    return candidate >= MS_LOWER && candidate < MS_UPPER ? Math.round(candidate) : null;
  }

  // Otherwise treat it as a date string.
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Board ids and names, so alerts can name a board rather than an id. */
const BOARDS_QUERY = `
  query ($limit: Int!, $page: Int!) {
    boards(limit: $limit, page: $page) {
      id
      name
    }
  }
`;

/**
 * Activity logs for one board.
 *
 * Fields confirmed against monday's published activity-logs reference:
 * `id event entity data user_id created_at`, nested inside `boards`, with
 * `from`, `to`, `limit` and `page` arguments.
 *
 * **`data` is deliberately not requested.** Nothing here uses it, and it is
 * where an activity entry would carry item names and column values (INFERENCE:
 * never captured, see docs/AGENT-TASK-3-data-field.md). Not asking for it is
 * what makes "does not read item names or column values" in the privacy
 * policy true, rather than true only of what the code happens to keep.
 *
 * **Deliberately does not use `users { activity_logs }`** — monday's own
 * documentation marks user-scoped logs preview-only and explicitly not stable.
 */
const ACTIVITY_QUERY = `
  query ($boardId: ID!, $from: ISO8601DateTime!, $to: ISO8601DateTime!, $limit: Int!, $page: Int!) {
    boards(ids: [$boardId]) {
      activity_logs(from: $from, to: $to, limit: $limit, page: $page) {
        id
        event
        entity
        user_id
        created_at
      }
    }
  }
`;

/**
 * The account's real users, so activity by anything else can be recognised as
 * an automation or app.
 *
 * **Field names here are UNVERIFIED** — monday's basics page lists users as a
 * supported operation but the reference page was unreachable. Every caller
 * treats a failure here as "unknown", which makes the app watch every repeating
 * pattern exactly as it did before this query existed. A wrong guess therefore
 * costs precision, never correctness.
 */
const USERS_QUERY = `
  query {
    users {
      id
      name
    }
  }
`;

const PAGE_SIZE = 100;

/** monday returns at most 10,000 activity logs, so 100 pages is the real ceiling. */
const MAX_ACTIVITY_PAGES = 100;
const MAX_BOARD_PAGES = 50;

function explainApiError(rawMessage) {
  const message = String(rawMessage ?? 'Unknown error');
  const lower = message.toLowerCase();

  if (/unauthor|not authenticated|invalid token|forbidden|permission/.test(lower)) {
    return (
      `${message}\n\nmonday blocks API access for viewers, deactivated users, ` +
      'unconfirmed email addresses and student accounts. An admin or member has to run this.'
    );
  }
  if (/rate limit|too many requests|complexity|budget exhausted/.test(lower)) {
    return `${message}\n\nThe account hit a monday API limit. Wait a minute and try again.`;
  }
  return message;
}

async function query(monday, graphql, variables, apiVersion) {
  let response;
  try {
    response = await monday.api(graphql, apiVersion ? { variables, apiVersion } : { variables });
  } catch (error) {
    throw new Error(explainApiError(error?.message ?? error));
  }
  // The SDK resolves rather than rejects on GraphQL errors, so without this a
  // failed query looks like an account with no data.
  if (response?.errors?.length) {
    throw new Error(explainApiError(response.errors.map((e) => e.message).join('; ')));
  }
  return response?.data;
}

/** Every board the signed-in user can see. */
export async function fetchBoards(monday, onProgress) {
  const boards = [];
  for (let page = 1; page <= MAX_BOARD_PAGES; page += 1) {
    const data = await query(monday, BOARDS_QUERY, { limit: PAGE_SIZE, page });
    const batch = data?.boards ?? [];
    boards.push(
      ...batch.map((board) => ({ id: String(board.id), name: singleLine(board.name) || '(untitled board)' })),
    );
    onProgress?.(boards.length);
    if (batch.length < PAGE_SIZE) break;
  }
  return boards;
}

/**
 * Activity for the given boards, normalised into the shape src/core expects.
 *
 * Entries whose timestamp cannot be understood are **dropped rather than
 * guessed at**, and counted so the caller can tell the difference between a
 * quiet account and a parsing problem. A silently wrong timestamp would corrupt
 * every interval derived from it.
 *
 * `shouldStop`, checked before each board, lets a caller with a deadline (the
 * Sidekick tool, which must answer in seconds) stop early; `boardsRead` says
 * how far it got, so a partial answer can say it is partial.
 *
 * @returns {Promise<{entries: object[], unparsedTimestamps: number, boardsRead: number}>}
 */
export async function fetchActivity(monday, boardIds, fromMs, toMs, onProgress, shouldStop) {
  const entries = [];
  let unparsedTimestamps = 0;
  let boardsRead = 0;
  const from = new Date(fromMs).toISOString();
  const to = new Date(toMs).toISOString();

  for (const boardId of boardIds) {
    if (shouldStop?.()) break;
    boardsRead += 1;
    for (let page = 1; page <= MAX_ACTIVITY_PAGES; page += 1) {
      const data = await query(monday, ACTIVITY_QUERY, { boardId, from, to, limit: PAGE_SIZE, page });
      const logs = data?.boards?.[0]?.activity_logs ?? [];

      for (const log of logs) {
        const at = parseActivityTimestamp(log.created_at);
        if (at === null) {
          unparsedTimestamps += 1;
          continue;
        }
        entries.push({
          boardId: String(boardId),
          actor: log.user_id === null || log.user_id === undefined ? null : String(log.user_id),
          event: log.event ?? null,
          entity: log.entity ?? null,
          at,
        });
      }

      onProgress?.(entries.length);
      if (logs.length < PAGE_SIZE) break;
    }
  }

  return { entries, unparsedTimestamps, boardsRead };
}

/**
 * Fetches the account's people. Returns null rather than throwing when the query
 * is not available, because not knowing who the humans are must degrade to
 * watching everything, not to failing the run.
 *
 * @returns {Promise<{id: string, name: string}[]|null>}
 */
export async function fetchUsers(monday) {
  try {
    const data = await query(monday, USERS_QUERY, {});
    const users = data?.users;
    if (!Array.isArray(users) || users.length === 0) return null;
    return users.map((user) => ({ id: String(user.id), name: singleLine(user.name) || `user ${user.id}` }));
  } catch {
    return null;
  }
}

/** True when running inside monday rather than opened directly. */
export function looksLikeMondayContext() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * The account's automations, as monday lists them — the inventory Patrick
 * Fallon asked for: "impossible to 'see' all your automations in one place".
 *
 * FACT (the public schema, `api.monday.com/v2/get_schema?version=2026-10`,
 * read 28 Sep 2026): `board_automations(ids, board_ids, limit, cursor):
 * AutomationsPage!` — "Omit all filters to get all account automations" — and
 * `BoardAutomation { id user_id active title description created_at updated_at
 * workflow_host_data workflow_blocks workflow_variables importance
 * notice_message template_reference_id }`. It exists in 2026-10 only, not in
 * 2026-07 (the default) or earlier, hence the explicit version; the SDK takes
 * `apiVersion` as an option (monday-sdk-js client.js). Legacy automations are
 * returned only for single-board queries, so an account-wide list can miss them.
 */
export const AUTOMATIONS_API_VERSION = '2026-10';

const AUTOMATIONS_QUERY = `
  query ($limit: Int, $cursor: String) {
    board_automations(limit: $limit, cursor: $cursor) {
      cursor
      items {
        id
        title
        description
        active
        user_id
        created_at
        updated_at
        workflow_host_data
        notice_message
      }
    }
  }
`;

const MAX_AUTOMATION_PAGES = 50;

/**
 * The board an automation lives on. The schema says only "Host data (board ID
 * and type)" and types it as JSON, so its keys are UNKNOWN: this accepts the
 * plausible spellings and returns null rather than guessing further.
 */
export function hostBoardId(host) {
  let value = host;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const direct = value.board_id ?? value.boardId;
  if (direct !== undefined && direct !== null) return String(direct);
  const kind = String(value.type ?? value.host_type ?? value.hostType ?? '').toLowerCase();
  if (kind === 'board' && value.id !== undefined && value.id !== null) return String(value.id);
  return null;
}

/**
 * Every automation in the account, normalised.
 *
 * @returns {Promise<{id: string, title: string, description: string, active: boolean|null,
 *   boardId: string|null, userId: string|null, createdAt: string|null, updatedAt: string|null,
 *   notice: string}[]>}
 */
export async function fetchAutomations(monday, onProgress) {
  const automations = [];
  let cursor = null;
  for (let page = 0; page < MAX_AUTOMATION_PAGES; page += 1) {
    const data = await query(monday, AUTOMATIONS_QUERY, { limit: 100, cursor }, AUTOMATIONS_API_VERSION);
    const result = data?.board_automations;
    for (const item of result?.items ?? []) {
      automations.push({
        id: String(item.id ?? ''),
        title: typeof item.title === 'string' && item.title.trim() !== '' ? item.title : 'Untitled automation',
        description: typeof item.description === 'string' ? item.description : '',
        active: typeof item.active === 'boolean' ? item.active : null,
        boardId: hostBoardId(item.workflow_host_data),
        userId: item.user_id === null || item.user_id === undefined ? null : String(item.user_id),
        createdAt: typeof item.created_at === 'string' ? item.created_at : null,
        updatedAt: typeof item.updated_at === 'string' ? item.updated_at : null,
        notice: typeof item.notice_message === 'string' ? item.notice_message : '',
      });
    }
    onProgress?.(automations.length);
    cursor = result?.cursor ?? null;
    if (!cursor) break;
  }
  return automations;
}

