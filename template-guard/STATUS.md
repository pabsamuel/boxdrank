# Status — how much of this is done

**Updated:** 20 Sep 2026 · 198 tests passing · typecheck clean · production build clean

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
| Unit tests over fixtures — the four required cases | Done, 198 tests | `test/` |
| Repair layer (auto where safe, manual checklist where not) | Done | `src/repair/` |
| README | Done | `README.md` |
| Project docs, decision log, prompts | Done | `docs/` |
| **Durable storage** (was: swap `InMemoryStorage` for a real database) | **Done** | `src/server/sqlite-storage.ts`, ADR-013 |
| **Drift scheduler** (was: no scheduler wired up) | **Done** | `src/drift/scheduler.ts`, ADR-014 |
| Architecture defence for gate #2 | Done | `docs/05-architecture-walkthrough.md` |
| **Live verification script** — the five `✱` claims, one command | **Done** | `scripts/verify-live.ts`, ADR-017 |
| **Security middleware** — the standard Burp findings, pre-empted | **Done** | `src/server/security.ts`, ADR-015 |
| **Marketplace billing** — signed subscription webhook → plan state | **Done** | `src/billing/subscription.ts`, ADR-016 |
| **Notification delivery** — end to end: recipient captured at OAuth, per-account settings, fallback chain, settings UI | **Done** | `src/drift/sinks.ts`, ADR-021 |
| **Sweep paces against its own storage** — the 7 req/s limit | **Done** | ADR-022 |
| **Deployment** — Dockerfile, non-root, data on a volume | **Done** | `Dockerfile`, `docs/06-deployment-and-submission.md` |
| **Submission checklist** | Done | `docs/06-deployment-and-submission.md` |
| **Delete everything on uninstall** | **Done** | `Storage.deleteAccount()`, ADR-019 |
| **monday code port** — third `Storage`, `Config`, cron route | **Done, never run on the platform** | `src/server/monday-code-storage.ts`, `config.ts`, ADR-020 |

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
| 3 | **Gate #3 — run the Burp scan and remediate what it finds.** The standard findings are pre-empted (headers, CORS, rate limiting, body cap, non-root container) and tested. It does **not** go away on monday code — monday requires all domains to pass and documents no exemption — but the scanned surface becomes monday's infrastructure and `mapps code:push -s` scans at deploy time. | You, after deploying | Unknown until scanned |
| 4 | **ADR-010 — pick the product shape.** Read-only auditor, or auditor + repair + monitoring. Recommendation: read-only first. | You | A decision, not a task |
| 5 | **10 admin conversations about column drift.** Load-bearing since the marketplace scan: the category tops out at 951 installs while reporting apps hit 17.8K. | You | A week of asking |
| 6 | ~~Open the Workspace Doctor listing~~ **Done 20 Sep.** It does account-wide hygiene, not template fidelity. The clear holds; "nothing adjacent exists" no longer does. `docs/07-workspace-doctor.md` | — | — |
| 9 | ~~Investigate `monday code`~~ **Done 20 Sep — `docs/08-monday-code.md`.** It is real and it is the right target: native scheduler, Secure Storage segregated per account, SOC 2 / ISO 27001 / HIPAA / GDPR inherited, data residency automatic, free today. **Five `✱` questions remain**, answerable in an hour with the CLI installed. Question 1 — whether an app-scoped storage key exists — decides the drift sweep's design. | You, 1 hour with the CLI | 1 hour |
| 10 | ~~Port to monday code~~ **Done 20 Sep — ADR-020.** Built against the SDK's own type definitions (`@mondaycom/apps-sdk@3.3.2`, read from the installed package, not from documentation). `SecureStorage` takes no token so it is app-scoped; `Storage` takes the account's token so it is account-scoped — which settled the sweep design. **Never run on the platform:** four `✱` behaviours need a deployment, listed in `docs/06-deployment-and-submission.md` Part 5. | — | — |
| 11 | **Deploy to a private app on monday code and watch the first sweep.** The only way to close the four remaining `✱` behaviours: per-key size limit, `search` behaviour, the 7 req/s Secure Storage limit, and the container request timeout. | You | An afternoon |
| 7 | ~~Deploy to your own host~~ **superseded by 11** — still fully supported as the fallback (`TEMPLATE_GUARD_PLATFORM=self-hosted`, Dockerfile, SQLite), but monday code is the better target. | — | — |
| 8 | Configure the developer console: features, OAuth redirect, billing webhook URL, plan ids | You | An hour |

Items 1–3 and 7–8 are hard prerequisites for submission. Items 4, 5 and 9
decide **what** to submit and whether it is worth submitting at all.

**Items 9 and 10 are done.** The five `✱` questions that blocked the port were
answered by reading the SDK's type definitions out of the installed package,
which is ground truth for signatures. Four questions about *behaviour* remain
and none of them can be answered from a terminal.

Next, in order:

1. **`npm run verify:live`** with a dev token — ten minutes, closes the
   GraphQL `✱` claims.
2. **Deploy to a private monday code app** and watch the first sweep in
   `mapps code:logs` — closes the platform `✱` behaviours.
3. **ADR-010**, now with information behind it. monday code makes the
   monitoring shape much cheaper to defend than it was when the dilemma was
   written.

---

## Where the risk actually sits

It moved. It is no longer "does this work" or "has someone built it".

- **Duplication risk: dead.** The marketplace scan cleared it on 20 Sep. Nobody
  does board-structure diffing. (`docs/04-marketplace-scan.md`)
- **Technical risk: contained.** The engine is pure, tested, and has no network
  dependency. The riskiest unknowns are five named functions, each isolated
  behind a `✱` comment — and now checkable in ten minutes rather than a
  morning (`npm run verify:live`).
- **Demand risk: open, and the main one — with a second data point now.** The
  admin/audit/governance category's best performer has 951 installs, and the
  nearest neighbour to this product did **23 in three months** with AI
  features, scheduled checks and good artwork, tagged into the category where
  the 17.8K apps live. Either nobody thought of this, or people build these and
  they do not sell. Ten conversations distinguish those two, and nothing else
  does.
- **Duplication risk, revisited:** still clear — Workspace Doctor has no
  template concept, so missing columns, changed types and mis-wired connect
  columns are questions its model cannot ask. But the positioning must lead
  with mis-wiring and template fidelity, never with the word "drift".

Nothing in this repository has touched a real monday account.
