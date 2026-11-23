/**
 * The only file that talks to monday.com. Used by the board view (through
 * monday-sdk-js, seamless authentication) and by the Sidekick tool (through
 * src/server/http-client.js, with the request's short-lived token). Both
 * expose the same `api(query, { variables, apiVersion })` shape.
 *
 * The error handling and the iframe check are Automation Inventory's, checked
 * live on 28 Sep 2026.
 */

import { normaliseUpdate, readWindow, LOOKBACK_DAYS } from '../core/unanswered.js';

/**
 * FACT (the public schema, `api.monday.com/v2/get_schema?format=sdl`, 2026-07
 * and 2026-10, read 8 Oct 2026; `api-reference/reference/updates.md`, updated
 * 6 Sep 2026):
 * - the root query is `updates(limit: Int = 25, page: Int = 1, ids: [ID!],
 *   from_date: String, to_date: String): [Update!]`, the same in both
 *   versions; it "returns all updates across an account", newest first;
 * - `limit`: "the maximum is 100";
 * - `from_date` and `to_date` are inclusive ISO 8601 dates, "must be used
 *   together", and work only at the root;
 * - `Update { id body: String! (HTML) text_body creator_id: String creator:
 *   User created_at: Date item: Item replies: [Reply!] }`,
 *   `Reply { id creator_id created_at }`, `Item { id name url: String! board:
 *   Board }`, `Board { id name }`;
 * - scopes (`apps/docs/oauth.md`, updated 7 Jul 2026): `updates:read`, "Read
 *   updates and replies the user can see"; items and boards need
 *   `boards:read` (`api-reference/reference/items.md`), users `users:read`
 *   (`…/users.md`). Whether nested `item` and `creator` need those two scopes
 *   on top of `updates:read` is UNKNOWN; the app asks for all three.
 *
 * The version is pinned, as monday advises (`api-reference/docs/
 * api-versioning`): 2026-10 is the current version from 1 Oct 2026, and the
 * query is identical in 2026-07.
 */
export const UPDATES_API_VERSION = '2026-10';

const UPDATES_QUERY = `
  query ($limit: Int!, $page: Int!, $from: String!, $to: String!) {
    updates(limit: $limit, page: $page, from_date: $from, to_date: $to) {
      id
      body
      text_body
      created_at
      creator_id
      creator {
        id
        name
      }
      item {
        id
        name
        url
        board {
          id
          name
        }
      }
      replies {
        id
        creator_id
        created_at
      }
    }
  }
`;

export const PAGE_SIZE = 100;

/** 3,000 updates: a month of a busy account. Past that the view says it stopped. */
export const MAX_UPDATE_PAGES = 30;

function explainApiError(rawMessage) {
  const message = String(rawMessage ?? 'Unknown error');
  const lower = message.toLowerCase();

  if (/unauthor|not authenticated|invalid token|forbidden|permission|scope/.test(lower)) {
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
  // failed query looks like an account with no updates.
  if (response?.errors?.length) {
    throw new Error(explainApiError(response.errors.map((e) => e.message).join('; ')));
  }
  return response?.data;
}

/**
 * The updates of the last `lookbackDays` on the boards the user can see,
 * newest first, normalised (src/core/unanswered.js).
 *
 * `shouldStop`, checked before each page, lets a caller with a deadline (the
 * Sidekick tool, which must answer in seconds) stop early. `complete` says
 * whether every update in the window was read; `oldest` is the oldest
 * `created_at` read, so a partial answer can say how far back it reaches.
 *
 * @returns {Promise<{updates: object[], pagesRead: number, complete: boolean, oldest: string|null, from: string}>}
 */
export async function fetchUpdates(monday, {
  now = Date.now(),
  lookbackDays = LOOKBACK_DAYS,
  maxPages = MAX_UPDATE_PAGES,
  onProgress,
  shouldStop,
} = {}) {
  const { from, to } = readWindow(now, lookbackDays);
  const updates = [];
  const seen = new Set();
  let pagesRead = 0;
  let complete = false;
  for (let page = 1; page <= maxPages; page += 1) {
    if (shouldStop?.()) break;
    const data = await query(monday, UPDATES_QUERY, { limit: PAGE_SIZE, page, from, to }, UPDATES_API_VERSION);
    const batch = Array.isArray(data?.updates) ? data.updates : [];
    pagesRead += 1;
    for (const raw of batch) {
      const update = normaliseUpdate(raw);
      if (update.id === '' || seen.has(update.id)) continue;
      seen.add(update.id);
      updates.push(update);
    }
    onProgress?.(updates.length, oldestOf(updates));
    if (batch.length < PAGE_SIZE) {
      complete = true;
      break;
    }
  }
  return { updates, pagesRead, complete, oldest: oldestOf(updates), from };
}

function oldestOf(updates) {
  let oldest = null;
  for (const update of updates) {
    if (update.createdAt && (oldest === null || Date.parse(update.createdAt) < Date.parse(oldest))) oldest = update.createdAt;
  }
  return oldest;
}

/** Inside monday the view runs in an iframe; opened on its own it is the demo. */
export function looksLikeMondayContext() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}
