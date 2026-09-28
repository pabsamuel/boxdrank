/**
 * The only file that talks to monday.com. Used by the board view (through
 * monday-sdk-js, seamless authentication) and by the Sidekick tool (through
 * src/server/http-client.js, with the request's short-lived token). Both
 * expose the same `api(query, { variables, apiVersion })` shape.
 *
 * Carried over from Automation Watchdog, where it was tested and the queries
 * were checked live on 28 Sep 2026.
 */

import { singleLine } from '../core/sanitize.js';

const BOARDS_QUERY = `
  query ($limit: Int!, $page: Int!) {
    boards(limit: $limit, page: $page) {
      id
      name
    }
  }
`;

const PAGE_SIZE = 100;
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

/** Inside monday the view runs in an iframe; opened on its own it is the demo. */
export function looksLikeMondayContext() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * FACT (the public schema, `api.monday.com/v2/get_schema?version=2026-10`,
 * read 28 Sep 2026, and a live query on the owner's account the same day):
 * `board_automations(ids, board_ids, limit, cursor): AutomationsPage!` exists
 * in 2026-10, 2027-01 and dev, not in 2026-07, the current default — hence the
 * explicit version. The SDK takes `apiVersion` as an option (monday-sdk-js
 * client.js); the server's client sends it as the `API-Version` header
 * (`api-reference/docs/api-versioning`, read 28 Sep 2026).
 * `AutomationsPage { cursor items: [BoardAutomation!] legacy_automations: JSON }`,
 * and `legacy_automations` — automations "set up in an older way" — is
 * "resolved only for board-scoped queries (null otherwise)". On the owner's
 * test board one automation came back in `items` and a second, older one only
 * in `legacy_automations`. So this asks board by board: one account-wide query
 * would silently miss every older automation.
 */
export const AUTOMATIONS_API_VERSION = '2026-10';

const AUTOMATIONS_QUERY = `
  query ($boardId: ID!, $limit: Int, $cursor: String) {
    board_automations(board_ids: [$boardId], limit: $limit, cursor: $cursor) {
      cursor
      items {
        id
        title
        description
        active
        user_id
        created_at
        updated_at
        notice_message
      }
      legacy_automations
    }
  }
`;

const MAX_AUTOMATION_PAGES_PER_BOARD = 20;

/**
 * The older automations on one board. The schema types them as JSON and says
 * the field is "best-effort, so it may carry an error marker instead of data";
 * the live answer showed an id, a boardId and a title. So the keys are read
 * defensively, and anything without an id or a title is left out rather than
 * guessed at. Whether one is switched on is kept only if monday says so.
 */
export function parseLegacyAutomations(value, boardId) {
  let data = value;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return [];
    }
  }
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.automations) ? data.automations
    : Array.isArray(data?.items) ? data.items
    : [];
  const flag = (entry) => {
    for (const key of ['active', 'is_active', 'isActive', 'enabled']) {
      if (typeof entry[key] === 'boolean') return entry[key];
    }
    if (typeof entry.status === 'string') {
      const status = entry.status.toLowerCase();
      if (status === 'active' || status === 'on' || status === 'enabled') return true;
      if (status === 'inactive' || status === 'off' || status === 'disabled') return false;
    }
    return null;
  };
  const rows = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const id = entry.id ?? entry.automation_id ?? entry.automationId;
    const title = [entry.title, entry.name, entry.description, entry.text].find(
      (candidate) => typeof candidate === 'string' && candidate.trim() !== '',
    );
    if (id === undefined || id === null || !title) continue;
    rows.push({
      id: String(id),
      title,
      description: '',
      active: flag(entry),
      boardId: String(entry.boardId ?? entry.board_id ?? boardId),
      userId: null,
      createdAt: null,
      updatedAt: null,
      notice: '',
      legacy: true,
    });
  }
  return rows;
}

/**
 * Every automation on the given boards, newer and older kinds, normalised.
 * A board that cannot be read is counted, not fatal: the rest still show.
 *
 * `shouldStop`, checked before each board, lets a caller with a deadline (the
 * Sidekick tool, which must answer in seconds) stop early; `boardsRead` says
 * how far it got, so a partial answer can say it is partial.
 *
 * @returns {Promise<{automations: object[], failedBoards: number, boardsRead: number}>}
 */
export async function fetchAutomations(monday, boardIds, onProgress, shouldStop) {
  const automations = [];
  const seen = new Set();
  let failedBoards = 0;
  let boardsRead = 0;
  for (const boardId of boardIds) {
    if (shouldStop?.()) break;
    try {
      let cursor = null;
      for (let page = 0; page < MAX_AUTOMATION_PAGES_PER_BOARD; page += 1) {
        const data = await query(monday, AUTOMATIONS_QUERY, { boardId, limit: 100, cursor }, AUTOMATIONS_API_VERSION);
        const result = data?.board_automations;
        const found = (result?.items ?? []).map((item) => ({
          id: String(item.id ?? ''),
          title: typeof item.title === 'string' && item.title.trim() !== '' ? item.title : 'Untitled automation',
          description: typeof item.description === 'string' ? item.description : '',
          active: typeof item.active === 'boolean' ? item.active : null,
          boardId: String(boardId),
          userId: item.user_id === null || item.user_id === undefined ? null : String(item.user_id),
          createdAt: typeof item.created_at === 'string' ? item.created_at : null,
          updatedAt: typeof item.updated_at === 'string' ? item.updated_at : null,
          notice: typeof item.notice_message === 'string' ? item.notice_message : '',
          legacy: false,
        }));
        if (page === 0) found.push(...parseLegacyAutomations(result?.legacy_automations, boardId));
        for (const automation of found) {
          const key = `${automation.legacy ? 'legacy' : 'new'}:${automation.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          automations.push(automation);
        }
        cursor = result?.cursor ?? null;
        if (!cursor) break;
      }
    } catch {
      failedBoards += 1;
    }
    boardsRead += 1;
    onProgress?.(automations.length, boardsRead);
  }
  return { automations, failedBoards, boardsRead };
}
