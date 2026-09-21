> ## ✓ Live verification — 21 September 2026
>
> Run by Samet against a real developer account on API version **2026-07**,
> with `npm run verify:live`. **5 verified, 2 failed, 0 skipped.** Both
> failures were real bugs in our code, not in the documentation — and one of
> them had never been reachable at all. Details and fixes: **ADR-028**.
>
> | Claim | Result |
> |---|---|
> | `BOARD_CONFIG_QUERY` valid on 2026-07 | ✓ |
> | Columns expose a typed `settings` object | ✓ — 8/8 columns |
> | **Which settings key holds linked board IDs** | ✓ — `{"boardIds":[5104569193]}`, **numbers not strings** |
> | The column points where we say it does | ✓ |
> | `isBoardReferencing` recognises `board_relation` | ✓ |
> | `owners`/`subscribers` paginate with `limit`/`page` | ✗ → **✓ on re-run.** Those arguments do not exist. Fixed by folding both fields into the config query, which also removed a whole request per board. |
> | `board_automations` readable | ✗ twice, then **solved by introspection.** The field exists on `dev` and **nowhere on `2026-07`**. Its real signature showed every part of our query was wrong, including a `configuration` field that does not exist. Rewritten from the schema. ADR-030, ADR-031. |
> | **Is the recipe body structured?** (`✱5`) | ✓ — three JSON fields. **Automation diffing is real, not presence-counting.** |
> | Where board/column ids actually live (`✱6`) | **`workflow_variables`, not `workflow_blocks`** — blocks only carry variable *keys*, which are identical between a template and its copy. Corrected the diff's priorities and added `automation.miswired`. ADR-032. |
>
> **Final run, 21 Sep: 8 verified, 0 failed.** Every `✱` claim in this document
> is now observed. What remains unverified is the monday code platform, which
> needs a deployment rather than a token.
>
> **Re-run, same day: 6 verified, 1 failed.** The only open claim is the
> preview automations read, which is behind a default-off flag that no paid
> tier depends on.
>
> **And one long-standing assumption became a measurement:** the pinned schema
> exposes *no* automation read at all. ADR-002's whole premise — that
> automations cannot be version-pinned and therefore must sit behind a flag —
> is now observed rather than argued. (ADR-030.)
>
> The third row is the one that mattered. It was the single worst failure this
> app could have — guess the key wrong and every board reports as correctly
> wired, with no error anywhere — and it is now observed rather than believed.

# Step 1 — monday.com API Findings Report

**Date:** 2026-09-16
**Status:** Awaiting path decision from product owner.
**Do not write feature code until a path is confirmed.**

## Method & confidence caveat

`developer.monday.com` is blocked by this environment's network egress proxy, so
the pages below were read through indexed search summaries of the official docs
rather than by direct fetch. Every claim is attributed. Before a single line of
API client code is written, **each ✱-marked claim must be re-verified by running
the query against a real monday account** using the API playground. The ✱ claims
are the ones the product decision actually hinges on.

---

## Q1 — Can the GraphQL API READ a board's existing automations?

**Yes, but only on the dev (preview) schema. Not on stable.**

| | |
|---|---|
| Query | `board_automations` ✱ |
| Schema | monday.com **dev (preview)** schema ✱ |
| Returns | per automation: `id`, `title`, `is_active`, `configuration`; plus a pagination object `{ nextCursor, hasMore }` ✱ |
| Stability | Explicitly "subject to change" |

monday's own Platform MCP surfaces this as the `list_automations` tool, which
"lists all automations on a specific monday.com board, including their IDs,
titles, active state, and configuration" and "queries `board_automations` on the
monday.com API." The Platform MCP tools page states plainly that "some newer
tools (workflows, automations, agents, and asset uploads) run against the
monday.com **dev (preview) API schema and are subject to change**."

The community history matches this being recent and not part of the stable
contract: the long-standing feature requests *"How to query the active
integrations/automations on a board using GraphQL?"* (2024) and *"Automation Data
accessible via API"* were, for years, answered with "you can't."

**Unknowns that must be resolved by live testing before relying on this:**
- What is inside `configuration`? Is it a structured recipe graph (trigger,
  condition, action, and the board/column IDs each references), or an opaque
  display string? **A diff engine is only possible if it is structured.** This is
  the single highest-risk unknown in the whole product.
- Does it include *integration* recipes (Gmail, Outlook, Slack) or only native
  automations? Email recipes are one of the documented duplication failures.
- Is it readable with a normal app OAuth token, or does it need admin scope?

## Q2 — Legacy per-board "automations" vs. workspace-level "workflows"

**Yes, they are two distinct products, and the distinction matters for us.**

- **Automations** — per-board trigger/action rules ("when X happens, do Y" on a
  single board). These are the legacy, per-board objects.
- **Workflows** — standalone, **workspace-level** objects with their own
  lifecycle (draft → published), addressed by `workflowObjectId` (stable across
  publishes) and `workflowDraftId` (the editable draft).

**Which object breaks on board duplication: the per-board automations.** This is
the correct target for the product. monday's support docs say automation and
integration recipes that are toggled *on* are duplicated with the board, but the
documented and community-reported exceptions are exactly the ones that hurt:

- Automations built with **integration blocks** (Gmail/email, Slack, etc.) do not
  carry over and must be recreated by hand.
- **Cross-board recipes** — automations that create or update items on *another*
  board — do not duplicate.
- **Custom recipes** — anything with custom conditions or multi-step logic.
- **Automations with item mapping** — recipes that map column values between items.
- Plus unexplained silent losses: the community report of a board with **44
  automations duplicating into 39**, with no warning shown to the user.

Workspace-level workflows are *not* board-scoped, so they do not get "dropped by
duplication" in the same way — but a workflow that references the template board
by ID will keep pointing at the template after the user duplicates. That is the
same mis-wiring failure class, at workspace scope. Worth noting in the diff, out
of scope for v1.

## Q3 — `create_workflow` / `update_workflow` / `publish_workflow`

**All three are on the dev (preview) schema. Not stable.** ✱

monday's own docs for these tools state they map to the `create_workflow`,
`update_workflow` and `publish_workflow` mutations "on the monday.com **dev
(preview)** API schema." The same is true of `activate_live_workflow`,
`deactivate_live_workflow` and `delete_live_workflow` (the `manage_automations`
tool).

**Risks of shipping a paid app against them:**

1. **No stability guarantee, no deprecation window.** Stable versions are
   guaranteed for at least six months with a quarterly release train; preview has
   no such contract and can change without a version bump to pin against.
2. **Nothing to pin.** The whole mitigation strategy for monday's API — pin an
   explicit version header — does not apply. A preview-schema change lands on
   your production tenant with no action on your part.
3. **A broken repair is worse than no repair.** These are *write* mutations
   against customers' live automation config. A silently changed field shape
   could deactivate or mis-wire a working automation on a client board. For an
   app whose entire pitch is "we tell you what silently broke," that is fatal.
4. **Marketplace review.** A paid listing whose headline feature depends on an
   endpoint monday itself labels "subject to change" is a reasonable thing for a
   reviewer to push back on.
5. **Refund exposure.** At $30–60/mo/account, a feature that stops working with
   no warning is a chargeback and a 1-star review, not a support ticket.

## Q4 — What board configuration IS reliably readable on stable?

Readable on the stable schema (current stable version **2026-07**):

| Object | Fields | Notes |
|---|---|---|
| Board | `id`, `name`, `description`, `state`, `board_kind`, `board_folder_id`, `workspace_id` | solid |
| Columns | `id`, `title`, `type`, `description`, `archived`, `settings` | **`settings_str` is deprecated as of 2025-10**; use the typed `settings` object, which returns structured JSON instead of a JSON-encoded string ✱ |
| Groups | `id`, `title`, `color`, `position`, `archived` | solid |
| Views | `id`, `name`, `type`, `settings_str`, `view_specific_data_str` | still string-encoded |
| Permissions | board `permissions` field; `owners`, `subscribers` | note the 2026-07 User entity overhaul + stricter `users` pagination — see Q5 |
| Connect-board mappings | the connect-boards column's typed `settings`, which carries the linked board IDs | **this is the mis-wiring detector** — read, filter, create, update and clear are all supported on the column |
| Tags, integrations-as-columns, item terminology | via board fields | verify per-field |

**The critical one:** the connect-boards column's `settings` exposes the board
IDs it points at. That means the "present but mis-wired" failure — the copy's
connect column still pointing at the *template's* board — **is detectable on the
stable API with no preview dependency at all.** That is the nastiest, most
valuable finding in the product spec, and it is fully in reach.

Caveat on writes: "to connect items using the API, the board(s) these items
reside in must be connected to the current board **manually**" first. So repair
of connect-board wiring may be partly manual-checklist, not one-click. Verify.

## Q5 — Unprompted, but it will bite us

The **2026-07 User entity migration** rewrote the GraphQL `User` type and
`Query.users`: new fields, types, enums and arguments, plus **stricter pagination
on users** — `users` now returns 200 at a time instead of the whole account, and
it **fails silently** for callers that assumed otherwise. Legacy fields
(`photo_original`, `photo_thumb`, `photo_thumb_small`, `photo_tiny`,
`photo_small`, and others) are **removed in 2026-10**. Anywhere we read board
owners or subscribers, paginate explicitly and touch no legacy photo field.

---

## Versioning posture (recommended, independent of path)

- **Pin `API-Version: 2026-07`** — the current stable default since 2026-07-01.
- Available now: `2026-04` (maintenance), `2026-07` (current), `2026-10`
  (release candidate). Anything before `2025-04` is deprecated and dead.
- New version each quarter; each stable for ≥6 months. Budget one migration
  review per quarter as recurring maintenance, and CI a smoke suite against the
  release candidate so the quarterly flip is never a surprise.

---

## Recommendation

**Neither A nor B as written. Ship B, with A behind a feature flag.**

The binary in the brief assumed automations are either readable or not. Reality
is a third thing: they are readable, **but only from a schema monday labels
"subject to change" and that you cannot pin a version against.** So:

**Ship Path B as the product and the paid claim.** Board-structure integrity:
columns, column settings and types, groups, views, permissions, and — the real
prize — **connect-board mis-wiring**. Zero preview dependency. Every word of the
listing is defensible. This alone catches the "looks fine, corrupts the wrong
board" failure, which is the highest-severity item in the spec and the one no
competitor addresses.

**Build the automation reader behind `FEATURE_AUTOMATIONS_PREVIEW`, default off.**
Isolated behind one adapter module with a stable internal interface. When it is
on and healthy, automations appear as an extra diff section marked *Preview*.
When the preview schema changes or errors, that section degrades to a clearly
labeled "could not read automations" state and **the rest of the app is
unaffected**. No billing tier is gated on it, so no refund exposure.

**The decision gate:** before the flag is ever enabled for customers, run one
live query against a real board and inspect `configuration`. If it is a
structured recipe graph, promote automation diffing to a headline *Preview*
feature. If it is an opaque display string, automations are limited to
presence/absence and title counting — which, note, is *still* enough to catch the
44→39 case, and that case is the story that sells the app.

**Why not Path A outright:** it puts a paid app's headline feature on an
unpinnable endpoint, and its repair layer writes to customers' live automation
config.

**Why not Path B outright:** it leaves the 44→39 detection on the table when a
read path demonstrably exists. Flagged, read-only, never billed — that risk is
close to zero, and it costs one adapter module.

---

## Decision needed from you

1. **B + flagged A** (recommended) / strict B / strict A?
2. Do you have a monday account I can point live verification at (a dev tenant,
   an API token)? The ✱ claims and the `configuration` shape question need it.

Nothing in `template-guard/src/` will be written until you answer (1).

## Sources

- [Platform MCP tools](https://developer.monday.com/api-reference/docs/platform-mcp-tools)
- [List Automations (Platform MCP)](https://developer.monday.com/api-reference/docs/list-automations)
- [Manage Automations (Platform MCP)](https://developer.monday.com/api-reference/docs/manage-automations)
- [Create Workflow (Platform MCP)](https://developer.monday.com/api-reference/docs/create-workflow)
- [Update Workflow (Platform MCP)](https://developer.monday.com/api-reference/docs/update-workflow)
- [Publish Workflow (Platform MCP)](https://developer.monday.com/api-reference/docs/publish-workflow)
- [monday workflows (apps docs)](https://developer.monday.com/apps/docs/monday-workflows)
- [Boards — API reference](https://developer.monday.com/api-reference/reference/boards)
- [Views — API reference](https://developer.monday.com/api-reference/reference/board-views)
- [Connect Boards — API reference](https://developer.monday.com/api-reference/reference/connect)
- [Versioning](https://developer.monday.com/api-reference/docs/api-versioning)
- [Versions](https://developer.monday.com/api-reference/reference/versions)
- [Release notes](https://developer.monday.com/api-reference/docs/release-notes)
- [Major user entity update](https://developer.monday.com/api-reference/changelog/major-user-entity-update)
- [How to duplicate a board — Support](https://support.monday.com/hc/en-us/articles/360000304399-How-to-duplicate-a-board)
- [Board duplication not duplicating automations — Community](https://community.monday.com/t/board-duplication-not-duplicating-automations/49833)
- [How to query the active integrations/automations on a board using GraphQL? — Community](https://community.monday.com/t/how-to-query-the-active-integrations-automations-on-a-board-using-graphql/91305)
- [Automation Data accessible via API — Community](https://community.monday.com/t/automation-data-accessible-via-api/70980)
- [monday.com Template Board Settings Lost on Duplication — TaskRhino](https://www.taskrhino.ca/blog/monday-com-template-settings-lost-duplication/)
