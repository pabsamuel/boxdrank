# ADR-0001 — Foundational architecture

Status: **Accepted** · Date: 2026-07-23

## Context

Two master specs (see ADR-0002) demand: portable creator-emote entitlements, multi-provider verification, asset pipeline, mobile keyboards, billing, admin — production-deployable, testable without external accounts, cheap at seed stage, scalable to Stage 2 (10k creators / 1M users).

## Decision

**Modular monolith, TypeScript end-to-end, native mobile.**

| Concern | Choice | Why (vs. alternatives) |
|---|---|---|
| API | **Fastify 5** + Zod validation + OpenAPI | Lower ceremony than NestJS, first-class JSON-schema perf, plugins for rate-limit/cookies; spec A prefers it |
| ORM | **Drizzle** | SQL-transparent, tiny runtime, PGlite driver for tests; Prisma's engine complicates PGlite/CI |
| DB | **PostgreSQL 16** | Spec-mandated; constraints/transactions carry the entitlement invariants |
| Cache/queue | **Redis 7 + BullMQ** | Boring, mature; per-queue concurrency, retries/backoff, DLQ patterns |
| Web | **Next.js 15 (App Router)** | SSR public creator pages (SEO funnel), one framework for marketing+studio+library+admin |
| Auth | **Custom: magic link + server sessions (+ OAuth linking via provider SDK)** | No external account to run/test; sessions revocable server-side; passkeys deferred |
| Storage | **S3-compatible client** (MinIO local, R2/S3 prod) | Portability requirement; signed URLs; no vendor lock |
| Asset processing | **Sharp** (static + animated WebP/GIF), worker-side | Battle-tested, libvips speed; FFmpeg only when video emotes unflag |
| Billing | **Stripe** behind `packages/billing` interface | Checkout+Portal+webhooks fastest path; interface allows MoR swap |
| Mobile | **Native Kotlin (IME) / Swift (keyboard+share ext)**; native shells too | Extensions must be native (spec); shells are thin, third toolchain (RN) not justified at v1 |
| Observability | pino structured logs + OpenTelemetry hooks + Sentry-compatible SDK, behind env | Spec §23; no-op locally |
| Tests | Vitest; **PGlite** embedded Postgres for DB/integration (ADR-0003) | Runs anywhere, no Docker dependency in CI |
| Deploy | Containers (API/worker) + Vercel-or-container (web) + managed PG/Redis + R2 + Cloudflare | Spec §7.2 pragmatic path; compose file mirrors prod topology locally |

## Module boundaries (extraction seams)

`entitlement-engine`, `provider-sdk`, `asset-pipeline`, `billing` are pure packages with no HTTP/queue imports; `apps/api` and `apps/worker` are drivers. Any package can be lifted into a service later by wrapping its public interface — documented per package.

## Consequences

- One repo, one deploy pipeline, three runtime processes (web, api, worker) → cheap ops at seed stage.
- Custom auth means we own magic-link + session security (covered in threat model; rate limits + single-use tokens + short TTL).
- Native mobile shells cost more UI work than RN, accepted for extension quality; revisit trigger in ROADMAP.
