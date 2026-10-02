# monday platform facts for Updates Inbox

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
  (the current default) and 2026-10.
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

UNKNOWN until the playground run (`GATE0.md` 1):
- whether the root query is limited to boards the token's user can see;
- whether `item { board }` resolves at the root;
- how many pages a real account has;
- how long a page takes.

## Reading monday's docs

- FACT (2 Oct 2026): every `developer.monday.com` reference page has a
  Markdown copy at the same address plus `.md`, for example
  `…/api-reference/reference/updates.md`. It returns `text/markdown`, with
  the page's `updatedAt` in its header. Much easier to read than the HTML.
- The site lists them all at
  `https://developer.monday.com/api-reference/llms.txt`.
