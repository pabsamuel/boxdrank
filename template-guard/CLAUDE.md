# Template Guard — working agreement

Read this before touching anything in `template-guard/`.

## What this is

A monday.com marketplace app. monday users duplicate a template board per client;
duplication silently drops configuration (a documented case: 44 automations
became 39, with no warning). Template Guard snapshots a template board's
configuration, diffs a duplicate against it, and tells the user exactly what
broke.

Lives in `template-guard/` inside the `boxdrank` repo. Nothing outside that
directory is part of this project — do not touch the rest of the repo, with one
exception you must read first.

## Read this before anything else

**This app is the same product as *Board Schema Auditor* in
`monday-billable-hours/`** (branch `claude/monday-billable-hours-app-nv00q4`,
PR #17). That thread did the market research and set a gate; this one built the
code without seeing it. The two disagree on product shape — that thread
specified read-only and client-side, this one is read-write with a server.

`docs/03-merge-with-board-schema-auditor.md` has the full conflict and a
recommendation. **The shape is an open decision (ADR-010). Do not add features
to `repair/`, `server/` or `drift/` until it is settled** — that work may be cut.

Completing an already-specified deliverable is not adding a feature. Durable
storage (ADR-013) and the drift scheduler (ADR-014) were finished on 20 Sep
under that reading, and both stay droppable whole: if the read-only shape wins,
deleting `drift/`, `server/` and `repair/execute.ts` leaves the diff engine and
the UI untouched.

`STATUS.md` is the completion tracker. Update it whenever a deliverable moves.

## Hard rules

1. **Never invent monday API behaviour.** If a query, field, or scope is not in
   `docs/00-api-findings.md` as verified, it is unverified. Mark it `✱` and
   verify it live before code depends on it.
2. **Pin `API-Version: 2026-07`.** One place: `src/api/version.ts`. Nowhere else.
3. **Preview schema stays behind `FEATURE_AUTOMATIONS_PREVIEW`, default off.**
   It is confined to one adapter module. The app must fully function with the
   flag off. No billing tier may be gated on a preview-schema feature.
4. **Never store customer item data.** Board IDs, column IDs, and configuration
   only. No item names, no column values, no files. This is a listing claim and a
   security-review claim — breaking it breaks both.
5. **Fail loudly.** A partial read is a visible, labeled degraded state, never a
   silently short diff. An app that says "we tell you what silently broke" must
   never itself break silently. There is no `catch {}` in this codebase.
6. **Respect rate limits and complexity budgets.** Batch board reads. Never
   fetch items — we diff structure, not content. Boards with 500+ items must be
   no slower than a board with 5.
7. **Price per account, not per seat.**

## Severity vocabulary (use these exact words everywhere — UI, code, tests)

- `missing` — present in template, absent in copy.
- `miswired` — present in copy but pointing at the wrong board. **Highest
  severity.** It looks fine and corrupts the wrong board.
- `altered` — present in both, config differs (renamed column, changed type).
- `cosmetic` — column width, view order. Never blocks.

## Stack

React · `monday-sdk-js` · `monday-ui-react-core` (Vibe) · TypeScript · Vitest.
App surfaces: board view + item-less dashboard widget. Nothing else in v1.

## Definition of done for any phase

- Unit tests pass, including the four required fixture cases (missing
  automation, mis-wired cross-board reference, renamed column, changed column
  type).
- No unverified `✱` claim is load-bearing in shipped code.
- `docs/02-decisions.md` has an entry for anything architecturally non-obvious.
- Committed to `claude/template-guard-monday-app-bm0xxv` and pushed.

## Out of scope for v1 — do not build

Marketing site. A payment form of any kind — monday collects the money and
`/webhooks/subscription` learns the outcome; building our own checkout would
trade away the largest security-review reduction available to a marketplace app
(ADR-016). Item-level data sync. Workspace-level workflow repair. Anything that
writes to a board the user did not explicitly select.
