# Global Emotes

**Global Emotes turns creator memberships into portable, official emote access that fans can use beyond the original streaming platform.**

Creators upload official emote packs, attach access rules (public, subscriber, Discord role, Patreon tier, access code…), and share one link. Fans connect their platform accounts, packs unlock automatically from verified entitlements, and emotes are usable from a mobile keyboard (Android IME, iOS keyboard + share extension) and on the web.

> Brand note: the product name is provisional and isolated in `packages/config` (`BRAND_NAME`), so it can be changed globally without a code sweep.

## Monorepo layout

```
apps/
  web/       Next.js — marketing site, creator studio, fan library, admin
  api/       Fastify — versioned REST API (/v1), OpenAPI, auth, webhooks
  worker/    BullMQ — asset processing, entitlement sync, reconciliation, email
  android/   Kotlin — host app + IME keyboard (commitContent + fallbacks)
  ios/       Swift — host app + keyboard extension + share extension
packages/
  config/               env validation + typed app config + plan limits + brand
  contracts/            shared Zod schemas & TypeScript types (API contracts)
  database/             Drizzle ORM schema, migrations, seeds, test harness
  provider-sdk/         provider adapter interface + Twitch/Discord/mock/access-code adapters
  entitlement-engine/   evidence → entitlement state machine (the defensible core)
  asset-pipeline/       upload validation, variants, hashing, dedupe
  billing/              Stripe abstraction, plan enforcement, webhook verification
  analytics/            privacy-safe event schema + ingestion helpers
  notifications/        transactional email templates + sender abstraction
infrastructure/         docker, scripts, terraform skeleton
docs/                   architecture, product, integrations, security, operations, legal
```

## Quick start (local)

Prerequisites: Node ≥ 22.12, pnpm 10 (`corepack enable`), Docker.

```bash
pnpm install
cp .env.example .env                # defaults work for local dev
docker compose up -d                # postgres, redis, minio, mailpit
pnpm db:migrate                     # apply migrations
pnpm db:seed                        # demo creator, fan, packs, mock provider
pnpm dev                            # web :3000, api :3001, worker
```

Then:

- Web: http://localhost:3000 (creator studio at `/studio`, fan library at `/library`)
- API: http://localhost:3001/v1/health — OpenAPI JSON at `/v1/openapi.json`
- Mailpit (magic-link emails): http://localhost:8025
- MinIO console (assets): http://localhost:9001

Demo accounts are printed by `pnpm db:seed`.

## Verification

```bash
pnpm verify        # format check + typecheck + all tests
pnpm test          # unit + integration tests (DB tests run on embedded PGlite)
```

## Key documents

- Product: `docs/product/SPEC_REVIEW.md`, `docs/product/IMPROVEMENT_PROPOSALS.md`, `docs/product/ROADMAP.md`
- Architecture: `docs/architecture/ADR-0001-foundational-architecture.md`, `docs/architecture/SYSTEM_OVERVIEW.md`, `docs/architecture/ENTITLEMENT_ENGINE.md`
- Integrations: `docs/integrations/PROVIDER_CAPABILITY_MATRIX.md`
- Security: `SECURITY.md`, `docs/security/THREAT_MODEL.md`
- Operations: `docs/operations/LOCAL_DEVELOPMENT.md`, `docs/operations/DEPLOYMENT.md`
- Status & decisions: `STATUS.md`, `DECISIONS.md`, `ASSUMPTIONS.md`, `RISKS.md`, `OWNER_ACTIONS.md`

## Honest platform reality

Creator emotes are images, not Unicode emoji. Android inserts them as rich content where the target editor supports it (`commitContent`), otherwise copy/share. iOS uses a keyboard for browsing + copy-to-pasteboard and a share extension; iOS cannot insert arbitrary images into every app like native emoji, and we never claim otherwise. The keyboard never logs, stores, or transmits typed text.
