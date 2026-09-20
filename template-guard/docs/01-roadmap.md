# Roadmap

Each phase is one session's worth of work and ends in a pushed commit. Phase 0 is
done and is blocking on your answer. Copy-paste prompts for each phase are in
`PROMPTS.md`.

| # | Phase | Deliverable | Status |
|---|---|---|---|
| 0 | API findings | `docs/00-api-findings.md` | done |
| — | Path decision | **B + flagged A**, confirmed 2026-09-16 | done |
| 1 | Skeleton | monday OAuth, manifest, board view renders, version pinned | done |
| 2 | Snapshot | read a board's full stable config into a versioned snapshot | done |
| 3 | Diff engine | snapshot vs snapshot → severity-grouped findings + unit tests | done, 148 tests overall |
| 4 | Repair | one-click fixes where the API allows, deep-linked manual checklist where it doesn't | done |
| 5 | Drift monitoring | scheduled re-check, notifications (paid tier) | **done 2026-09-20** — `drift/scheduler.ts`, ADR-014. Delivery sink is console-only. |
| 6 | Docs | README: local dev, manifest, scopes, submission notes | done |
| 7 | **Live verification** | check every `✱` claim against a real monday account | **script written** — `npm run verify:live`, ADR-017. Running it needs an API token. |
| — | **Marketplace duplicate check** | ~20 min of browser time; can kill the whole project | **CLEARED 2026-09-20** by Samet — no competitor. See ADR-012 and `docs/04-marketplace-scan.md`. One listing left to read: Workspace Doctor. |
| — | **Demand evidence** | 10 admin conversations about column drift | **now load-bearing** — the audit/admin category tops out at 951 installs |
| — | **Product shape decision** | read-only auditor, or auditor + repair + monitoring | **blocked on the owner** — see ADR-010 |
| 8 | Real storage | a real database behind the `Storage` interface | **done 2026-09-20** — SQLite, ADR-013. One suite runs against both implementations. |
| — | **Gate #2 answer key** | architecture defence for a marketplace reviewer | **done 2026-09-20** — `docs/05-architecture-walkthrough.md`. Reading it is on the owner. |
| 9 | Billing | signed subscription webhook → plan state; plan surface, no payment form | **done 2026-09-20** — ADR-016 |
| 10 | Security hardening | CSP, CORS, rate limiting, HTTPS, non-root container | **done 2026-09-20** — ADR-015 |
| 11 | Deployment + submission | Dockerfile, console setup, review checklist | **done 2026-09-20** — `docs/06-deployment-and-submission.md`. Running it is on the owner. |

## Phase 1 — Skeleton
monday app manifest, OAuth flow, `API-Version: 2026-07` pinned in exactly one
module, a board view that renders in monday and lists boards the user can reach.
Vibe components only. Exit: it loads inside a real monday board.

## Phase 2 — Snapshot
Read board + columns (typed `settings`, **not** deprecated `settings_str`) +
groups + views + permissions + owners (paginate — 2026-07 caps users at 200 and
fails silently otherwise). One batched query. Never fetch items. Output: a
versioned `BoardSnapshot` with a schema version field, stored with board/column
IDs and config only. Exit: snapshot two real boards, byte-compare the JSON.

## Phase 3 — Diff engine
Pure function, zero network, zero SDK: `diff(template, copy) -> Finding[]`. Every
finding carries `severity`, `what`, `why it matters`, and `how to fix`. Matching
across boards is by position + title + type heuristics, since duplicated boards
get new column IDs — **this heuristic is the hard part of the whole product, and
it is where the tests earn their keep.** Required fixture cases: missing
automation, mis-wired cross-board reference, renamed column, changed column type.
Exit: tests green, engine importable with no monday dependency.

## Phase 4 — Repair
Split findings into `auto` and `manual`. `auto` → a mutation, always previewed
before it runs, always undoable or at minimum logged. `manual` → a checklist item
with a deep link to the exact monday settings panel. Note from findings: connect
-board repair may require a manual board connection first, so it may be `manual`
even though a mutation exists. Exit: a mis-wired connect column gets a working
deep link.

## Phase 5 — Drift monitoring
Scheduled re-snapshot of linked boards, compare to stored template snapshot,
notify on divergence. Paid tier. Respect rate limits hard — this is the feature
most likely to get the app throttled.

## Phase 6 — README
Local dev, manifest, required scopes, submission notes, and the plain-language
data statement: *we store board and column IDs and configuration; we never store
your item data.* That sentence shortens security review.

## Monetization (build for it from phase 1, no UI yet)
- Free: 1 template, manual diffs.
- Paid $30–60/mo **per account**: unlimited templates, scheduled drift
  monitoring, notifications, one-click repair.
- No preview-schema feature is ever gated behind payment.
