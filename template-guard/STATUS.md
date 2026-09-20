# Status — how much of this is done

**Updated:** 20 Sep 2026 · 148 tests passing · typecheck clean · production build clean

Two numbers, because they are genuinely different and mixing them would be the
kind of comfortable lie this project is supposed to be allergic to.

| | Done |
|---|---|
| **The build** — everything specified that can be built without a live monday account | **100%** |
| **Shipping** — live on the marketplace, taking money | **~85%** |

The gap between them is no longer code at all. Every remaining item needs a
monday account, a deployed instance, or a conversation with a human being.

---

## The build — 100%

Every deliverable the spec named, plus the two the README listed as still to do.

| Deliverable | State | Where |
|---|---|---|
| API findings report + Path A/B recommendation | Done | `docs/00-api-findings.md` |
| App skeleton, OAuth, board view, dashboard widget | Done | `src/server/`, `src/ui/` |
| Snapshot + diff engine | Done | `src/snapshot/`, `src/diff/` |
| Unit tests over fixtures — the four required cases | Done, 148 tests | `test/` |
| Repair layer (auto where safe, manual checklist where not) | Done | `src/repair/` |
| README | Done | `README.md` |
| Project docs, decision log, prompts | Done | `docs/` |
| **Durable storage** (was: swap `InMemoryStorage` for a real database) | **Done** | `src/server/sqlite-storage.ts`, ADR-013 |
| **Drift scheduler** (was: no scheduler wired up) | **Done** | `src/drift/scheduler.ts`, ADR-014 |
| Architecture defence for gate #2 | Done | `docs/05-architecture-walkthrough.md` |
| **Live verification script** — the five `✱` claims, one command | **Done** | `scripts/verify-live.ts`, ADR-017 |
| **Security middleware** — the standard Burp findings, pre-empted | **Done** | `src/server/security.ts`, ADR-015 |
| **Marketplace billing** — signed subscription webhook → plan state | **Done** | `src/billing/subscription.ts`, ADR-016 |
| **Notification delivery** — monday notification, webhook, fallback chain | **Done** | `src/drift/sinks.ts` |
| **Deployment** — Dockerfile, non-root, data on a volume | **Done** | `Dockerfile`, `docs/06-deployment-and-submission.md` |
| **Submission checklist** | Done | `docs/06-deployment-and-submission.md` |

Deliberately **not** built, because the spec said not to: the marketing site.

The billing surface is `src/ui/components/PlanBanner.tsx` — plan state and a
link to monday's own upgrade page, nothing more. There is no payment form and
there will not be one: monday collects the money, which removes card data,
billing addresses and PCI from the security review entirely. (ADR-016.)

---

## Shipping — ~85%

What is left, and who can do it.

| # | Blocker | Who | Effort |
|---|---|---|---|
| 1 | **Verify the five `✱` claims.** Now one command: `MONDAY_API_TOKEN=… npm run verify:live -- --board <id> --connect-board <id> --automations`. Read-only, prints the observed shape next to each claim, exits non-zero on failure. | You, with a dev account | **~10 minutes** |
| 2 | **Gate #2 — defend the architecture.** monday rejects AI-vibe-coded apps. The answer key is written; you have to be able to give the answers cold. | You | An evening's reading |
| 3 | **Gate #3 — run the Burp scan and remediate what it finds.** The standard findings are pre-empted (headers, CORS, rate limiting, body cap, non-root container) and tested. What is left is whatever the scan turns up on a deployed instance. | You, after deploying | Unknown until scanned |
| 4 | **ADR-010 — pick the product shape.** Read-only auditor, or auditor + repair + monitoring. Recommendation: read-only first. | You | A decision, not a task |
| 5 | **10 admin conversations about column drift.** Load-bearing since the marketplace scan: the category tops out at 951 installs while reporting apps hit 17.8K. | You | A week of asking |
| 6 | **Open the Workspace Doctor listing** (23 installs, *"scan, score & fix"*). The one thing that could narrow the duplicate-check clear. | You | 5 minutes |
| 7 | **Deploy it.** `docker build` / `docker run`, per `docs/06-deployment-and-submission.md`. Needs a host with TLS. | You | An afternoon |
| 8 | Configure the developer console: features, OAuth redirect, billing webhook URL, plan ids | You | An hour |

Items 1–3 and 7–8 are hard prerequisites for submission. Items 4–6 decide
whether submission is worth doing at all. **Item 6 is five minutes and should
be next.**

---

## Where the risk actually sits

It moved. It is no longer "does this work" or "has someone built it".

- **Duplication risk: dead.** The marketplace scan cleared it on 20 Sep. Nobody
  does board-structure diffing. (`docs/04-marketplace-scan.md`)
- **Technical risk: contained.** The engine is pure, tested, and has no network
  dependency. The riskiest unknowns are five named functions, each isolated
  behind a `✱` comment — and now checkable in ten minutes rather than a
  morning (`npm run verify:live`).
- **Demand risk: open, and now the main one.** The admin/audit/governance
  category's best performer has 951 installs. Either nobody thought of this, or
  people build these and they do not sell. Ten conversations distinguish those
  two, and nothing else does.

Nothing in this repository has touched a real monday account.
