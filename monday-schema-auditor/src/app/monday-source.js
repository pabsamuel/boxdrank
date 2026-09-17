/**
 * The only file that talks to monday.com.
 *
 * Everything monday-specific is deliberately confined here so the diff engine
 * stays testable without an account, and so the SDK migration described below
 * is a one-file change rather than a rewrite.
 *
 * --- SDK situation, verified 17 Sep 2026 against the installed package ---
 *
 * monday-sdk-js exposes `api(query, options)` which queries the GraphQL API
 * "seamlessly on behalf of the connected user" when no token is supplied. That
 * is what lets this app run client-side with no backend and no stored secret.
 *
 * It is also deprecated. The installed 0.5.9 prints a deprecation warning on
 * every call and says it will be removed in 1.0.0. Version 1.0.0-beta — which
 * is what the `latest` tag currently points at — has already removed `api()`
 * entirely; its client exposes only get/set/listen/execute/storage/oauth.
 * The suggested replacement, @mondaydotcomorg/api, requires an API token, which
 * a seamless client-side app does not have.
 *
 * So the dependency is pinned to 0.5.9 on purpose. Do not run `npm update` on
 * it without reading MIGRATION in the README first.
 */

/** Fields confirmed against monday's published boards query. Nothing speculative. */
const BOARDS_QUERY = `
  query ($limit: Int!, $page: Int!) {
    boards(limit: $limit, page: $page) {
      id
      name
      columns {
        id
        title
        type
      }
    }
  }
`;

/**
 * monday caps a single query at 100 results, so this is both the page size and
 * the signal for "there is another page": a short page means the last page.
 */
const PAGE_SIZE = 100;

/**
 * Stops a misconfigured account from paging forever. 50 pages is 5,000 boards,
 * far beyond any account that would run this, and far short of a hang.
 */
const MAX_PAGES = 50;

/**
 * monday returns ids as GraphQL ID, which serialises as a string in current API
 * versions and as a number in older ones. Everything downstream compares ids
 * with ===, so they are normalised to strings at the boundary.
 */
function toBoard(raw) {
  return {
    id: String(raw.id),
    name: raw.name ?? '(untitled board)',
    columns: (raw.columns ?? []).map((column) => ({
      id: String(column.id),
      title: column.title ?? '',
      type: column.type ?? 'unknown',
    })),
  };
}

/**
 * Fetches every board the signed-in user can see, one page at a time.
 *
 * Read-only: this issues a query and never a mutation. The app has no code path
 * that writes to a board, which is what keeps its permission scope and its
 * security review surface small.
 *
 * @param {{ api: (query: string, options?: object) => Promise<{data: any}> }} monday
 *        The SDK client. Injected rather than imported so tests can pass a fake.
 * @param {(loaded: number) => void} [onProgress] Called after each page.
 * @returns {Promise<{id: string, name: string, columns: {id:string,title:string,type:string}[]}[]>}
 */
export async function fetchBoards(monday, onProgress) {
  const boards = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await monday.api(BOARDS_QUERY, { variables: { limit: PAGE_SIZE, page } });

    // The SDK resolves rather than rejects when GraphQL returns errors, so a
    // failed query would otherwise look like an account with no boards.
    if (response?.errors?.length) {
      throw new Error(response.errors.map((e) => e.message).join('; '));
    }

    const pageBoards = response?.data?.boards ?? [];
    boards.push(...pageBoards.map(toBoard));
    onProgress?.(boards.length);

    if (pageBoards.length < PAGE_SIZE) return boards;
  }

  return boards;
}

/**
 * True when the page is running inside monday rather than being opened directly.
 * A board view is always in an iframe; opening index.html from disk is not.
 */
export function looksLikeMondayContext() {
  try {
    return window.self !== window.top;
  } catch {
    // A cross-origin parent throws on access, which is itself the answer.
    return true;
  }
}
