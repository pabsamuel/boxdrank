# monday platform facts for Unanswered Updates (copied from monday-updates-inbox, 2 Oct 2026)

Everything learned on Watchdog and Automation Inventory still applies:
`../monday-automation-inventory/PLATFORM-FACTS.md` (hosting, versions,
features, Sidekick tool, submission form) and
`../monday-automation-watchdog/PLATFORM-FACTS.md`. Read those before relying
on anything here that looks thin.

## Updates API: FACT, 2 Oct 2026

Sources:
- the live schemas, `get_schema?format=sdl&version=2026-07` and `2026-10`;
- `https://developer.monday.com/api-reference/reference/updates.md` (page
  updated 6 Sep 2026).

- **Root query:** `updates(limit: Int = 25, page: Int = 1, ids: [ID!],
  from_date: String, to_date: String): [Update!]`. It is the same in 2026-07
  and 2026-10.
- The docs: "Can be queried directly at the root (returns all updates across
  an account)". Results come "in reverse chronological order".
- `limit`: "The default is 25, and the maximum is 100."
- `from_date` / `to_date`:
  - ISO 8601, `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`;
  - "Must be used together", and "only when querying `updates` directly at
    the root".
- **Scope:** `updates:read`.
- **No text-search argument.** Search has to happen in the app, over the
  pages it has read.
- **`Update` fields:** `id, body (HTML), text_body, creator_id, creator,
  created_at, updated_at, edited_at, item_id, item, replies, likes, viewers,
  pinned_to_top, assets, original_creation_date`.
- **`Reply` fields:** `id, body, kind, creator_id, edited_at, creator, likes,
  pinned_to_top, viewers, created_at, updated_at, assets, text_body`.
- **`Watcher` fields** (for `viewers`): `user_id, medium, user`.
- **`Item`** has `url` and `board`, so a row can open its item.
- **Nested queries:** `Board.updates` takes `board_updates_only` and dates.
  `Item.updates` takes only `limit`, `page` and `ids`.

UNKNOWN until the live check (`PLAYGROUND.md`):
- whether `item { board }` and `creator` resolve at the root;
- how a user mention appears in `body`;
- how an update written by an automation appears;
- how many pages a real account has, and how long a page takes.

## Added 8 Oct 2026, while building: FACT

- **Versions** (`api-reference/docs/api-versioning.md`, read 8 Oct): the
  table gives 2026-10 as "Current (default)" from 1 Oct 2026 and 2026-07 as
  maintenance from the same day. The page's own header still lists 2026-07 as
  current. The app pins 2026-10; `Update`, `Reply` and the root query are
  identical in both (schema diff, 8 Oct).
- **Scopes** (`apps/docs/oauth.md`, updated 7 Jul 2026): `updates:read` is
  "Read updates and replies the user can see"; so the root query follows the
  user's own access. `boards:read` is "Read a user's board data";
  `users:read` "Read profile information of the account's users".
  `items.md` requires `boards:read`, `users.md` `users:read`.
- **Root `replies` query** (schema 2026-07 and 2026-10): `replies(limit,
  page, board_ids: [ID!]!, created_at_from, created_at_to): [Reply!]`. Not
  used: replies come nested in each update.
- **`Item.board` is nullable**, `Item.url` is `String!`; `Update.creator_id`
  and `Reply.creator_id` are `String`, nullable (schema 2026-10).
- **`openItemCard`** (`apps/docs/mondayexecute.md`, updated 23 Oct 2025):
  "opens a modal with information from the selected item. Users can also
  create an update or delete the item from the modal." Parameters `itemId`
  (Integer, required) and `kind` ("updates" or "columns", default
  "columns"). The view's Reply button uses `kind: "updates"`. UNKNOWN whether
  it works from an Object, outside a board; the live test checks it.
- **`complexity { query before after reset_in_x_seconds }`** is a root field
  (schema 2026-10); the live check asks for it.
- **User context**: `context.user.id` in the view (`apps/docs/mondayget`);
  `userId` in the action block's JWT (`apps/docs/authorization-header`).
  The app needs no `me:read`.

## Reading monday's docs

- FACT (2 Oct 2026): every `developer.monday.com` reference page has a
  Markdown copy at the same address plus `.md`, for example
  `…/api-reference/reference/updates.md`. It returns `text/markdown`, with
  the page's `updatedAt` in its header. Much easier to read than the HTML.
- The site lists them all at
  `https://developer.monday.com/api-reference/llms.txt`.
