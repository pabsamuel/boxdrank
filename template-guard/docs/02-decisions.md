# Decision log

Append-only. One entry per architecturally non-obvious choice.

## ADR-001 — Pin API version 2026-07
**Date:** 2026-09-16 · **Status:** accepted
2026-07 is the current stable default (2026-04 maintenance, 2026-10 release
candidate). monday guarantees ≥6 months stability and ships quarterly. Pinned in
one module so the quarterly migration is a one-line change plus a test run.

## ADR-002 — Preview schema behind a feature flag, never billed
**Date:** 2026-09-16 · **Status:** ACCEPTED — path confirmed by product owner
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

## ADR-005 — `null` and `[]` are never interchangeable
**Date:** 2026-09-16 · **Status:** accepted
Throughout the snapshot and diff layers, `null` means "we did not or could not
look" and `[]` means "we looked, there is nothing." Conflating them lets the app
report an unread board as clean, which is the exact failure it is sold against.
`BoardSnapshot.automations` and `linkedBoardIds()` both depend on this, and the
UI renders the two states differently.

## ADR-006 — Mis-wired connect columns are manual repair, not one-click
**Date:** 2026-09-16 · **Status:** accepted
Two independent reasons. monday requires connected boards to be linked by hand
before the API accepts a change, so the one-click path does not reliably exist.
And a mis-wired column already has items linked to the wrong board — re-pointing
it is a decision about that data, not a settings edit. A button that silently
made that choice would be the most marketable thing in the app and the most
dangerous. It gets a deep-linked checklist item that names the board to change
it from.

## ADR-007 — The sole-of-type match excludes generic column types
**Date:** 2026-09-16 · **Status:** accepted
The last-resort matching pass pairs a lone unmatched column of type X on each
side, ignoring titles. Sound for a distinctive type (nobody deletes their only
formula column and adds a different one in the same edit); wrong for `text`,
where it pairs unrelated columns and reports a confident rename that never
happened. False positives are worse than misses here: a user who stops trusting
the diff stops reading it. Caught by a test, not by review.

## ADR-008 — "Automations not checked" is a footnote, not an alarm
**Date:** 2026-09-16 · **Status:** accepted
`DiffResult` separates `basedOnIncompleteData` (a read we expected to succeed
failed — loud) from `automationCoverage` (automations are outside the stable
API, so by default they are not read — quiet). The preview flag is off by
default, so folding the second into the first would put a warning banner on
every comparison the product ever shows, and a permanent warning is wallpaper.
Discovered by a test failing for the right reason.

## ADR-009 — The no-item-data promise is a runtime check
**Date:** 2026-09-16 · **Status:** accepted
`assertNoItemData()` runs on every snapshot save and throws if the object graph
contains `items`, `items_page`, `column_values`, `updates` or `assets`. This is
a listing claim and a security-review claim, so it gets an enforcement mechanism
rather than a code-review convention. Cheap next to a network round trip.
