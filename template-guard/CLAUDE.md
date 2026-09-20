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

`docs/03-merge-with-board-schema-auditor.md` has the full conflict.
**ADR-010 is now settled by ADR-025:** ship the auditor and the monitoring,
cut one-click repair from v1.

So v1 is **read-only in the way that matters**: `FEATURE_ONE_CLICK_REPAIR` is
off, `boards:write` is not requested, and no code path writes to a board. The
manual repair checklist is unaffected. `repair/execute.ts` stays in the tree —
tested, correct, unreachable — because deleting working code to express a
release decision makes the decision expensive to revisit.

The backend stays, because monday code (ADR-018, ADR-020) removes the
third-party-server cost that made it a hard trade.

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
8. **v1 never writes to a board.** `boards:write` is requested only when
   `FEATURE_ONE_CLICK_REPAIR` is on, and it is off. Two permissions not held
   beats two promises kept. Turning it on is a release decision (ADR-025), not
   a code change.

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

Marketing site. One-click repair — the code exists and is switched off
(ADR-025); the manual checklist is what ships. A payment form of any kind — monday collects the money and
`/webhooks/subscription` learns the outcome; building our own checkout would
trade away the largest security-review reduction available to a marketplace app
(ADR-016). Item-level data sync. Workspace-level workflow repair. Anything that
writes to a board the user did not explicitly select.
