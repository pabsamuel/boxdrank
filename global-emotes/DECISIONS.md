# DECISIONS

Architecture Decision Records live in `docs/architecture/ADR-*.md`. Index:

| ADR                                                                 | Title                                                                                                                               | Status   |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------- |
| [ADR-0001](docs/architecture/ADR-0001-foundational-architecture.md) | Foundational architecture: modular monolith, Fastify + Drizzle + PostgreSQL + Redis + BullMQ, Next.js web, native mobile extensions | Accepted |
| [ADR-0002](docs/architecture/ADR-0002-spec-merge.md)                | Merge of the two master specifications (Global Emotes + EmoteHub)                                                                   | Accepted |
| [ADR-0003](docs/architecture/ADR-0003-pglite-tests.md)              | Embedded PGlite for database/integration tests; real PostgreSQL for dev/prod                                                        | Accepted |

Decision highlights (details in ADRs):

- **Modular monolith**, one API process + one worker process. Microservices deferred; package boundaries document future extraction seams.
- **Fastify over NestJS** (lower ceremony, faster cold start, first-class JSON schema); **Drizzle over Prisma** (SQL-transparent, light runtime, works on PGlite for tests).
- **Custom auth (magic link + sessions) over Supabase/managed auth** — no external account required to run or test the product; OAuth linking handled by the provider SDK anyway.
- **Stripe** behind `packages/billing` interface so a merchant-of-record can replace it later.
- **Native Kotlin IME / Swift keyboard extension** — no cross-platform framework for extensions (spec-mandated, and technically correct).
- **Brand name isolated** in `packages/config` (`BRAND_NAME`) — rename is a config change.
