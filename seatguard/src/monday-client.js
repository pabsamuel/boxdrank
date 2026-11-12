/**
 * monday.com API client — SCAFFOLD, NOT YET VERIFIED.
 *
 * Nothing in this file has been run against a live monday account. The GraphQL
 * documents below are written from monday's published schema shape and are the
 * single most likely thing in this repo to be wrong. Field names, pagination
 * arguments and the very existence of some fields must be checked before this
 * is wired into anything a customer sees — docs/API-VERIFICATION.md is the
 * checklist, and it is the first task in the roadmap for exactly this reason.
 *
 * The rest of the codebase does not import this file. The audit engine consumes
 * a plain snapshot object, so it is already finished and tested while this part
 * is still a question mark.
 */

export const API_URL = 'https://api.monday.com/v2';

/** Pin the version explicitly; monday rolls versions quarterly. VERIFY current. */
export const API_VERSION = '2024-10';

const PAGE_SIZE = 100;

/** VERIFY: field names, and whether `last_activity` exists on `users`. */
export const USERS_QUERY = `
  query Users($limit: Int!, $page: Int!) {
    users(limit: $limit, page: $page) {
      id name email enabled is_guest is_admin is_view_only is_pending
      created_at last_activity
    }
  }`;

/** VERIFY: `workspaces` pagination args and the `kind` enum values. */
export const WORKSPACES_QUERY = `
  query Workspaces($limit: Int!, $page: Int!) {
    workspaces(limit: $limit, page: $page) {
      id name kind
      users_subscribers { id }
    }
  }`;

/** VERIFY: `board_kind` values, and that `owners` is distinct from `subscribers`. */
export const BOARDS_QUERY = `
  query Boards($limit: Int!, $page: Int!) {
    boards(limit: $limit, page: $page, state: all) {
      id name state board_kind items_count updated_at
      workspace { id }
      owners { id }
      subscribers { id }
    }
  }`;

export class MondayClient {
  constructor(token, { fetchImpl = globalThis.fetch, apiVersion = API_VERSION } = {}) {
    if (!token) throw new Error('A monday API token is required.');
    this.token = token;
    this.fetch = fetchImpl;
    this.apiVersion = apiVersion;
  }

  async query(document, variables = {}) {
    const res = await this.fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.token,
        'API-Version': this.apiVersion,
      },
      body: JSON.stringify({ query: document, variables }),
    });

    if (res.status === 429) {
      // monday rate-limits on complexity as well as request count; a client that
      // ignores this gets an account-wide block, not a slow response.
      const retryAfter = Number(res.headers.get('Retry-After') ?? 30);
      throw Object.assign(new Error('Rate limited by monday API'), { retryAfter });
    }
    if (!res.ok) {
      throw new Error(`monday API returned ${res.status}: ${await res.text()}`);
    }

    const body = await res.json();
    if (body.errors?.length) {
      throw new Error(`monday API errors: ${body.errors.map((e) => e.message).join('; ')}`);
    }
    return body.data;
  }

  /** Walk monday's page-numbered pagination until a short page comes back. */
  async *paginate(document, key, variables = {}) {
    for (let page = 1; ; page++) {
      const data = await this.query(document, { ...variables, limit: PAGE_SIZE, page });
      const rows = data[key] ?? [];
      yield* rows;
      if (rows.length < PAGE_SIZE) return;
    }
  }

  async collect(document, key) {
    const out = [];
    for await (const row of this.paginate(document, key)) out.push(row);
    return out;
  }
}

/** Map monday's shapes onto the snapshot the audit engine expects. */
export function toSnapshot({ account, users, workspaces, boards }) {
  return {
    fetchedAt: new Date().toISOString(),
    account,
    users: users.map((u) => ({
      id: String(u.id),
      name: u.name,
      email: u.email,
      enabled: Boolean(u.enabled),
      isGuest: Boolean(u.is_guest),
      isAdmin: Boolean(u.is_admin),
      isViewOnly: Boolean(u.is_view_only),
      isPending: Boolean(u.is_pending),
      createdAt: u.created_at ?? null,
      lastActivity: u.last_activity ?? null,
    })),
    workspaces: workspaces.map((w) => ({
      id: String(w.id),
      name: w.name,
      kind: w.kind === 'open' ? 'open' : 'closed',
      memberIds: (w.users_subscribers ?? []).map((u) => String(u.id)),
    })),
    boards: boards.map((b) => ({
      id: String(b.id),
      name: b.name,
      workspaceId: String(b.workspace?.id ?? 'none'),
      state: b.state,
      boardKind: b.board_kind,
      itemCount: b.items_count ?? 0,
      updatedAt: b.updated_at ?? null,
      owners: (b.owners ?? []).map((u) => String(u.id)),
      subscribers: (b.subscribers ?? []).map((u) => String(u.id)),
    })),
  };
}

/** One call: token in, snapshot out. Unverified until the checklist is done. */
export async function fetchSnapshot(token, account) {
  const client = new MondayClient(token);
  const [users, workspaces, boards] = await Promise.all([
    client.collect(USERS_QUERY, 'users'),
    client.collect(WORKSPACES_QUERY, 'workspaces'),
    client.collect(BOARDS_QUERY, 'boards'),
  ]);
  return toSnapshot({ account, users, workspaces, boards });
}
