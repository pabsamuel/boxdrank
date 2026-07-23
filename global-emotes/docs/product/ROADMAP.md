# ROADMAP

Merged phase plan (Spec A §32 × Spec B §14). Gate = verified commands recorded in `STATUS.md`.

| Phase | Scope | Gate |
|---|---|---|
| 0 | Spec review, ADRs, governance, monorepo foundation | install + format/typecheck pass |
| 1 | `config`, `contracts`, `database` (schema, migrations, seeds, PGlite harness) | migration + schema tests pass |
| 2 | `entitlement-engine` + `provider-sdk` (mock, Twitch, codes, Discord) | state-machine + adapter contract tests pass |
| 3 | `asset-pipeline`, `billing`, `analytics` packages | pipeline + billing transition tests pass |
| 4 | `apps/api` — auth, packs, uploads, entitlements, billing, admin, webhooks, OpenAPI | API integration tests pass |
| 5 | `apps/worker` — queues, reconciliation, email | handler unit tests pass |
| 6 | `apps/web` — marketing, public pack pages, studio, library, admin | web build passes |
| 7 | `apps/android` (IME) + `apps/ios` (keyboard/share ext) | CI mobile builds; human device pass per docs |
| 8 | CI/CD, security/ops/legal docs, cost model, final verify, staging deploy docs | full `pnpm verify` green |

## Post-v1 backlog (flagged/deferred)

WhatsApp sticker export (IP-07) · marketplace + payouts (ledger already live) · passkeys · Kick adapter (pending official capability confirmation) · YouTube adapter enable (pending Google approval) · iMessage sticker extension · browser extension · React Native shell revisit trigger: app surface > ~15 screens · pg_trgm/OpenSearch search at Stage 2 · read replicas/partitioning triggers in SYSTEM_OVERVIEW.

## Validation targets (hypotheses, from Spec B §17)

≥30% follow→keyboard onboarding · ≥50% activated→first send · ≥3 sends/wk median · ≥20% D7 (activated) · ≥25% creators share link. Instrumented via `packages/analytics` funnels.
