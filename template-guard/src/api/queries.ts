/**
 * Board configuration reads, stable schema only.
 *
 * Two rules govern everything here:
 *
 *  1. **Never fetch items.** We diff structure, not content. This is
 *     simultaneously the privacy claim, the security-review shortcut, and the
 *     reason a 5,000-item board costs the same as a 5-item one. Adding an
 *     `items_page` to any query in this file breaks all three at once.
 *
 *  2. **One round trip per batch of boards.** monday charges query complexity,
 *     not requests, but each request has fixed latency and the drift monitor
 *     runs these in bulk.
 */

/**
 * ✱ UNVERIFIED — the typed `settings` object on columns.
 *
 * `settings_str` was deprecated in API version 2025-10 in favour of a typed
 * `settings` object returning structured JSON. The exact field name and the
 * per-column-type shape of that object have NOT been verified against a live
 * account (developer.monday.com is unreachable from the build environment).
 *
 * Until it is verified, `BOARD_CONFIG_QUERY` requests BOTH and the snapshot
 * layer prefers `settings` and falls back to `settings_str`. That fallback is
 * deliberate belt-and-braces, not indecision: if `settings` does not exist on
 * 2026-07 the query errors on that field alone and we still get a usable
 * snapshot from the deprecated one, with a loud `schema_mismatch` failure
 * attached telling the operator to fix this file.
 *
 * First task once a token exists: run `npm run verify:schema` (see README),
 * delete the losing branch, and delete this comment.
 */
export const COLUMN_FIELDS = `
  id
  title
  type
  description
  archived
  width
  settings
  settings_str
`;

export const BOARD_CONFIG_QUERY = `
  query TemplateGuardBoardConfig($ids: [ID!]!) {
    boards(ids: $ids) {
      id
      name
      description
      state
      board_kind
      board_folder_id
      workspace_id
      permissions
      columns {
        ${COLUMN_FIELDS}
      }
      groups {
        id
        title
        color
        position
        archived
      }
      views {
        id
        name
        type
        settings_str
        view_specific_data_str
      }
      tags {
        id
        name
      }
      owners {
        id
      }
      subscribers {
        id
      }
    }
  }
`;

/**
 * Board owners and subscribers, paginated.
 *
 * The 2026-07 User entity migration made `users` return at most 200 per page
 * and — the dangerous part — it **fails silently** for callers that assumed it
 * returned the whole account. So this is a separate, explicitly paginated
 * query rather than a nested field, and the snapshot records how many pages it
 * walked so a truncated read is visible rather than assumed.
 *
 * Legacy photo fields (`photo_original`, `photo_thumb`, `photo_thumb_small`,
 * `photo_tiny`, `photo_small`) are removed in 2026-10. We request none of them.
 */
/**
 * ✓ VERIFIED 21 Sep 2026, against a live account on API 2026-07.
 *
 * `Board.owners` and `Board.subscribers` take **no arguments**. An earlier
 * version of this file paginated them with `limit` and `page`, which monday
 * rejects outright — *"Unknown argument limit on field Board.owners"* — so
 * every snapshot carried a failure for a read that could never have worked.
 *
 * Two things changed as a result. They are now selected inside
 * `BOARD_CONFIG_QUERY`, removing an entire round trip per board: the sweep
 * issues these across every board of every paying account, so a request that
 * bought nothing was the most expensive kind of bug this codebase can have.
 * And the 2026-07 user-pagination trap documented above turns out to apply to
 * the top-level `users` query, not to these fields.
 *
 * **Residual risk, stated rather than assumed away:** with no pagination
 * available, a board with a very large number of subscribers may be truncated
 * by monday without saying so, and we have no way to detect it. Nothing in the
 * diff currently reads these lists, so nothing is wrong today — but if a
 * permissions comparison is ever built on them, that limitation is the first
 * thing to re-check.
 */
export const USERS_PAGE_LIMIT = 200;

/** Boards the installing user can reach, for the board picker. */
export const BOARD_LIST_QUERY = `
  query TemplateGuardBoardList($limit: Int!, $page: Int!) {
    boards(limit: $limit, page: $page, order_by: used_at, state: active) {
      id
      name
      workspace_id
      board_kind
    }
  }
`;

export const BOARD_LIST_PAGE_LIMIT = 100;

/**
 * How many boards to request per `BOARD_CONFIG_QUERY` call.
 *
 * Conservative on purpose. Board config is a wide read (columns + groups +
 * views + tags each multiply the cost), and the drift monitor issues these in
 * bulk across many accounts. Raising this trades latency for a higher chance
 * of tripping the complexity budget mid-sweep — and a sweep that dies halfway
 * is worse than a slow one, because half a drift report is a wrong one.
 */
export const BOARD_BATCH_SIZE = 10;
