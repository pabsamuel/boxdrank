# Decision log

Append-only. One entry per architecturally non-obvious choice.

## ADR-001 — Pin API version 2026-07
**Date:** 2026-09-16 · **Status:** accepted
2026-07 is the current stable default (2026-04 maintenance, 2026-10 release
candidate). monday guarantees ≥6 months stability and ships quarterly. Pinned in
one module so the quarterly migration is a one-line change plus a test run.

## ADR-002 — Preview schema behind a feature flag, never billed
**Date:** 2026-09-16 · **Status:** proposed — awaits path decision
`board_automations`, `create_workflow`, `update_workflow`, `publish_workflow` and
the `*_live_workflow` mutations are all on monday's dev (preview) schema, which
is explicitly "subject to change" and **cannot be version-pinned**. A paid app
cannot rest its headline claim on that. Automation reading goes behind
`FEATURE_AUTOMATIONS_PREVIEW`, default off, in one adapter module, read-only,
and no paid tier depends on it. See `00-api-findings.md` for the full argument.

## ADR-003 — Mis-wiring detection is the product's core, and it is stable-API-only
**Date:** 2026-09-16 · **Status:** accepted
The connect-boards column's typed `settings` exposes the board IDs it points at,
on the stable schema. So the highest-severity failure — a duplicated board whose
connect column still points at the template, which looks fine and corrupts the
wrong board — is fully detectable with zero preview dependency. This is the
defensible centre of the listing.

## ADR-004 — Never read items
**Date:** 2026-09-16 · **Status:** accepted
We diff structure, not content. This is simultaneously the privacy claim, the
security-review shortcut, and the reason the app stays fast on 500+ item boards.
Three wins from one constraint.
