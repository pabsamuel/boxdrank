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

## ADR-010 — Template Guard and Board Schema Auditor are the same product
**Date:** 2026-09-17 · **Status:** OPEN — needs the product owner's decision
Two sessions built the same idea the same day without knowing. The other thread
(`monday-billable-hours/`, PR #17) screened it as *Candidate 1 — Board Schema
Auditor*, recommended it, and specified it **read-only and client-side with no
backend**, because that minimises the marketplace security review for a solo
builder. This thread built it **read-write with an Express server**, because
scheduled drift monitoring cannot run in a browser tab.

That is a real conflict, not an oversight on either side: the other thread had
explicitly logged the retention-vs-shape tension as *unresolved and the most
likely way this idea fails*, and this thread resolved it by default without
knowing a debate existed.

Neither shape is obviously wrong. The diff engine is pure and ships in either.
Full analysis and a recommendation: `docs/03-merge-with-board-schema-auditor.md`.

**What would settle it:** the product owner picking a shape, after running the
one gate item that can kill both — a ~20-minute marketplace check that no
equivalent app already exists. No Claude session on this setup can run that
check; `monday.com` is blocked by the network egress policy for both threads.

## ADR-011 — The read-only claim is currently forfeited, and that was not deliberate
**Date:** 2026-09-17 · **Status:** accepted as a finding; the fix is ADR-010's decision
`boards:write` plus three mutations (`create_column`, `create_group`,
`change_column_title`) buy three conveniences. The highest-severity finding this
app produces — a mis-wired connect column — is already manual by ADR-006's
separate reasoning, so the writes do not buy the thing that matters most. They
cost the "never writes to your boards" claim in full, and enlarge every security
question at review. Worth stating plainly so the trade is visible when the shape
is chosen, rather than discovered at submission.

## ADR-012 — Gate item #1 cleared; the risk moved rather than vanished
**Date:** 2026-09-20 · **Status:** accepted
Samet ran the marketplace duplicate check in a browser (no session here can —
`monday.com` is blocked by the egress policy). **No app does board-structure
diffing or template-drift detection.** Searches for "schema" and "template
drift" return one irrelevant hit each. The duplicate-rejection risk that killed
the previous monday idea does not apply to this one.

The same screenshots carry a worse signal. In Template Guard's own category —
admin, audit, governance — the best listing has **951 installs** and most are
under 100, while a board-reports app has 17.8K. The gap is real; whether it is
an opening or a graveyard is now the open question, and it is the one the other
thread flagged when it wrote that demand here is INFERRED, not measured.

**Consequence:** the 10 admin conversations are no longer optional diligence.
They are load-bearing before any marketing spend. Full scan and numbers:
`docs/04-marketplace-scan.md`.

**What would reverse the clear:** opening the **Workspace Doctor** listing
(23 installs, *"scan, score & fix your monday workspace in one click"*) and
finding it does schema scoring. Not yet read. 5 minutes.

## ADR-013 — SQLite for durable storage, behind the same `Storage` interface
**Date:** 2026-09-20 · **Status:** accepted
`InMemoryStorage` loses every install token on restart, which means every
customer reinstalls after every deploy. That is an outage, not a rough edge, so
it had to go before anything ships.

SQLite, via Node's built-in `node:sqlite`. The workload is one ops person per
account and a handful of snapshots each — a file, not a Postgres cluster. A
single file also shortens the security conversation: no database server on a
port, no second connection string, backups are `cp`.

**What it costs, stated now rather than discovered later:** `node:sqlite` is
marked experimental by Node, one process owns the file, and there is no
horizontal scale. All three stop mattering the moment this becomes Postgres —
which is one new file implementing `Storage` and nothing else. The interface
existing *before* the second implementation is what makes that true, and
`test/storage.test.ts` runs the same suite against both to keep it true.

Two behaviours worth naming, both chosen so a failure cannot read as success:

- A snapshot whose `schemaVersion` is not current is **refused** on read
  (`StaleSnapshotError`), not coerced. Diffing a snapshot written by an older
  build would produce findings that are artefacts of our own schema change —
  false alarms, which for this product are worse than missed findings.
- An unrecognised `plan_id` degrades to `free`. Trusting whatever string is in
  the row would hand out paid features on a typo.

`assertNoItemData` runs before serialisation. Once a snapshot is a JSON string
the forbidden keys are invisible to every later check.

## ADR-014 — The drift scheduler, and why it is separate from `runDriftCheck`
**Date:** 2026-09-20 · **Status:** accepted
`runDriftCheck` checks one template for one account and is pure enough to test
without a clock. `DriftScheduler` walks every paying account on a timer. They
are separate files because merging them would make the interesting logic
untestable without a fake clock and a fake network at once.

The scheduler's rules, in the order of how badly breaking them would hurt:

1. **Never get the app rate-limited.** A sweep hits monday on behalf of every
   customer simultaneously. Throttling the app's token takes the product away
   from everyone at once, including the person sitting in front of it clicking
   Compare. Accounts are processed one at a time with a pause; a rate-limit
   response ends that account's sweep rather than retrying into the wall.
2. **Never overlap with itself.** A tick arriving while a sweep runs is skipped
   and counted, never queued. The counter is exposed on `/health`, because the
   interval being shorter than a sweep is a real operational condition and not
   something to learn from a doubled API bill.
3. **Never fail quietly.** A free account is reported as *skipped, because free*
   — not as checked. A missing install, an undecryptable token, a failed
   notification delivery: each is recorded on the sweep result. Silence in a
   monitoring product reads as "everything is fine", which is the exact failure
   this app exists to catch.

The `running` flag clears in a `finally`. A stuck flag is a monitor that has
silently stopped monitoring, which would be this product failing in its own
signature way.

Notification delivery is an interface (`NotificationSink`) with a console
implementation. Delivery has its own failure modes — mail outages, webhook
timeouts — and none of them may break a sweep. A failed delivery is recorded
and the sweep continues; it is not retried inside the sweep, because retrying
there turns a mail outage into a stalled monitor.

**On ADR-010:** this is `server/` and `drift/` work while the product shape is
still open, which CLAUDE.md restricts. It was taken deliberately: both were
already-specified deliverables rather than new features, and both are *droppable
whole* if the read-only shape wins — deleting `drift/`, `server/` and
`repair/execute.ts` leaves the diff engine and UI untouched. Nothing here makes
the narrow shape harder to choose. No new feature was added.
