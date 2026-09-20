# Status — how much of this is done

**Updated:** 20 Sep 2026 · 109 tests passing · typecheck clean

Two numbers, because they are genuinely different and mixing them would be the
kind of comfortable lie this project is supposed to be allergic to.

| | Done |
|---|---|
| **The build** — everything specified that can be built without a live monday account | **100%** |
| **Shipping** — live on the marketplace, taking money | **~65%** |

The gap between them is not code. It is a monday developer account, three
human-only gate items, and a demand question. None of those can be closed from
a terminal.

---

## The build — 100%

Every deliverable the spec named, plus the two the README listed as still to do.

| Deliverable | State | Where |
|---|---|---|
| API findings report + Path A/B recommendation | Done | `docs/00-api-findings.md` |
| App skeleton, OAuth, board view, dashboard widget | Done | `src/server/`, `src/ui/` |
| Snapshot + diff engine | Done | `src/snapshot/`, `src/diff/` |
| Unit tests over fixtures — the four required cases | Done, 109 tests | `test/` |
| Repair layer (auto where safe, manual checklist where not) | Done | `src/repair/` |
| README | Done | `README.md` |
| Project docs, decision log, prompts | Done | `docs/` |
| **Durable storage** (was: swap `InMemoryStorage` for a real database) | **Done** | `src/server/sqlite-storage.ts`, ADR-013 |
| **Drift scheduler** (was: no scheduler wired up) | **Done** | `src/drift/scheduler.ts`, ADR-014 |
| Architecture defence for gate #2 | Done | `docs/05-architecture-walkthrough.md` |

Deliberately **not** built, because the spec said not to: the marketing site
and the billing UI. Plan gating logic exists (`src/billing/tiers.ts`); the
screens that sell the upgrade do not.

One real gap inside the build, named rather than hidden: `NotificationSink` has
a console implementation only. Email or monday-notification delivery is a
plug-in behind that interface, and it is not worth writing before the first
paying account exists.

---

## Shipping — ~65%

What is left, and who can do it.

| # | Blocker | Who | Effort |
|---|---|---|---|
| 1 | **Verify the five `✱` claims against a live monday account.** Two matter: the `configuration` shape from `board_automations`, and which `settings` key holds linked board IDs. The second is the dangerous one — guessing wrong there reports *every* board as correctly wired. | You, with a dev account | A morning |
| 2 | **Gate #2 — defend the architecture.** monday rejects AI-vibe-coded apps. The answer key is written; you have to be able to give the answers cold. | You | An evening's reading |
| 3 | **Gate #3 — remediate a Burp finding personally.** Larger under the current read-write shape than it would be read-only. | You | Unknown until scanned |
| 4 | **ADR-010 — pick the product shape.** Read-only auditor, or auditor + repair + monitoring. Recommendation: read-only first. | You | A decision, not a task |
| 5 | **10 admin conversations about column drift.** Load-bearing since the marketplace scan: the category tops out at 951 installs while reporting apps hit 17.8K. | You | A week of asking |
| 6 | **Open the Workspace Doctor listing** (23 installs, *"scan, score & fix"*). The one thing that could narrow the duplicate-check clear. | You | 5 minutes |
| 7 | Billing UI, against monday's marketplace billing API | Either | Deferred by scope |
| 8 | Real notification delivery | Either | Small, after first customer |

Items 1–3 are hard prerequisites for submission. Items 4–6 decide whether
submission is worth doing at all. **Item 6 is five minutes and should be next.**

---

## Where the risk actually sits

It moved. It is no longer "does this work" or "has someone built it".

- **Duplication risk: dead.** The marketplace scan cleared it on 20 Sep. Nobody
  does board-structure diffing. (`docs/04-marketplace-scan.md`)
- **Technical risk: contained.** The engine is pure, tested, and has no network
  dependency. The riskiest unknowns are five named functions, each isolated
  behind a `✱` comment.
- **Demand risk: open, and now the main one.** The admin/audit/governance
  category's best performer has 951 installs. Either nobody thought of this, or
  people build these and they do not sell. Ten conversations distinguish those
  two, and nothing else does.

Nothing in this repository has touched a real monday account.
