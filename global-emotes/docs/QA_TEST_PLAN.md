# QA TEST PLAN

## Automated (run: `pnpm verify` — 100 tests green as of Phase 8)

| Suite                   | Where                       | Covers                                                                                                                                                                                                                                                            |
| ----------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema/migrations (4)   | packages/database           | migration apply on real Postgres (PGlite), unique handle, live-entitlement partial index, cascades                                                                                                                                                                |
| Entitlement engine (23) | packages/entitlement-engine | full state machine, ordering, duplicates, grace, sweeps, admin paths, rule matching                                                                                                                                                                               |
| Provider adapters (12)  | packages/provider-sdk       | mock contract, Twitch Helix mapping + EventSub signature/replay/challenge, Discord roles + guild ownership, honest not-configured behavior                                                                                                                        |
| Auth crypto (5)         | packages/auth               | token hashing, AES-GCM round-trip + tamper, cookie signing, code alphabet                                                                                                                                                                                         |
| Asset pipeline (11)     | packages/asset-pipeline     | magic bytes, spoofing, limits, bombs, animated GIF authoring/validation, variant generation, metadata strip                                                                                                                                                       |
| Billing (12)            | packages/billing            | Stripe signatures (valid/tampered/replayed/malformed), event normalization, plan resolution/enforcement, ledger invariants, client encoding                                                                                                                       |
| Analytics (3)           | packages/analytics          | allowlist accept/reject incl. content smuggling                                                                                                                                                                                                                   |
| Notifications (3)       | packages/notifications      | templates + XSS escaping                                                                                                                                                                                                                                          |
| API integration (22)    | apps/api                    | end-to-end creator journey (login→upload→pack→rules→publish→public page), fan journey (codes, mock webhook grant, idempotent replay, manifest, favorites/recents), billing webhook→plan, admin authz + reasons, rate limiting, analytics boundary, error envelope |
| Worker handlers (5)     | apps/worker                 | asset processing e2e + idempotency + rejection, sweep transitions + emails + idempotency, cleanup                                                                                                                                                                 |
| Android JVM (5)         | apps/android                | insertion-method planner (needs Android SDK to run)                                                                                                                                                                                                               |
| iOS (2)                 | apps/ios                    | shared-cache round-trip + forward compat (needs Xcode)                                                                                                                                                                                                            |

## Manual pre-release pass (10 minutes, staging)

1. Magic-link login (real inbox) → `/library`.
2. Creator: create profile → upload PNG + GIF → publish → open public page in incognito → previews render.
3. Redeem a fresh code → pack unlocks; revoke the code → second account fails.
4. Stripe test checkout (4242…) → webhook lands → plan flips → portal opens.
5. Admin: suspend pack (reason) → public page 404s; integration page shows expected statuses.
6. Device pass per `docs/operations/MOBILE_BUILDS.md` → update COMPATIBILITY_MATRIX.

## Known gaps (tracked, honest)

Playwright browser e2e (web flows covered via API-level tests; add before GA) · load tests for manifest + redeem endpoints (k6 scripts = pre-launch ticket) · malware scanning hook (Stage 2) · data-export archive assembly job.
