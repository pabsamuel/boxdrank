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
import { legacyEntries, legacyRecipes, legacyNeedsBoardNames, legacyTitle, boardNames } from '../core/legacy.js';

/** `url` is `String!` on `Board` (public schema, 2026-07, read 28 Sep 2026). */
const BOARDS_QUERY = `
  query ($limit: Int!, $page: Int!) {
    boards(limit: $limit, page: $page) {
      id
      name
      url
    }
  }
`;

/**
 * A board URL the view may open, or null. It comes from monday's API, and it
 * is only ever opened if it is https on monday.com, so a value that is
 * anything else cannot send the user somewhere else.
 */
export function safeBoardUrl(value) {
  let url;
  try {
    url = new URL(String(value ?? ''));
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  if (host !== 'monday.com' && !host.endsWith('.monday.com')) return null;
  return url.toString();
}

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
      ...batch.map((board) => ({
        id: String(board.id),
        name: singleLine(board.name) || '(untitled board)',
        url: safeBoardUrl(board.url),
      })),
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
 * The older automations on one board, normalised like the newer ones. The
 * shape and how their names are built are in src/core/legacy.js. Every entry
 * with an id is kept: monday's own note on the field says to always list
 * them, and a missing name becomes monday's generic sentence, never a gap.
 *
 * @param {unknown} value   `legacy_automations` as monday returned it.
 * @param {string} boardId
 * @param {{columns: Map, groups: Map}|null} [names]  The board's names, if read.
 */
export function parseLegacyAutomations(value, boardId, names = null) {
  const recipes = legacyRecipes(value);
  const flag = (entry) => {
    for (const key of ['active', 'is_active', 'isActive', 'enabled']) {
      if (typeof entry[key] === 'boolean') return entry[key];
    }
    for (const key of ['state', 'status']) {
      if (typeof entry[key] !== 'string') continue;
      const state = entry[key].toLowerCase();
      if (state === 'active' || state === 'on' || state === 'enabled') return true;
      if (state === 'inactive' || state === 'off' || state === 'disabled') return false;
    }
    return null;
  };
  const text = (value) => (typeof value === 'string' ? value : null);
  const rows = [];
  for (const entry of legacyEntries(value)) {
    if (!entry || typeof entry !== 'object') continue;
    const id = entry.id ?? entry.automation_id ?? entry.automationId;
    if (id === undefined || id === null || String(id) === '') continue;
    const userId = entry.userId ?? entry.user_id;
    rows.push({
      id: String(id),
      title: legacyTitle(entry, recipes, names),
      description: '',
      active: flag(entry),
      boardId: String(entry.boardId ?? entry.board_id ?? boardId),
      userId: userId === undefined || userId === null ? null : String(userId),
      createdAt: text(entry.createdAt ?? entry.created_at),
      updatedAt: text(entry.updatedAt ?? entry.updated_at ?? entry.configUpdatedAt),
      notice: text(entry.noticeMessage ?? entry.notice_message) ?? '',
      legacy: true,
    });
  }
  return rows;
}

/**
 * The names a board's older automations refer to: its column titles, status
 * labels and group titles. Asked only for boards that have older automations.
 * FACT (the public schema, 2026-10): `boards(ids: [ID!])`, `columns { id title
 * settings: JSON }`, `groups { id title }`; `settings` replaces the deprecated
 * `settings_str` from 2025-10 (`api-reference/reference/status`).
 */
const BOARD_NAMES_QUERY = `
  query ($boardId: ID!) {
    boards(ids: [$boardId]) {
      columns {
        id
        title
        settings
      }
      groups {
        id
        title
      }
    }
  }
`;

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
        if (page === 0 && legacyEntries(result?.legacy_automations).length > 0) {
          // The older kind has no title; the board's names make one. If they
          // cannot be read, monday's generic sentence is used instead.
          let names = null;
          if (legacyNeedsBoardNames(result.legacy_automations)) {
            try {
              const board = (await query(monday, BOARD_NAMES_QUERY, { boardId }, AUTOMATIONS_API_VERSION))?.boards?.[0];
              names = board ? boardNames(board) : null;
            } catch {
              names = null;
            }
          }
          found.push(...parseLegacyAutomations(result.legacy_automations, boardId, names));
        }
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
