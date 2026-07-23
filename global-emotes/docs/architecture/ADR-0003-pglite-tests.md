# ADR-0003 — Embedded PGlite for database and integration tests

Status: **Accepted** · Date: 2026-07-23

## Context

Spec requires database integration tests with "containers or disposable test databases". CI and several dev environments (including the one this repo was built in) lack Docker. Test speed matters for the inner loop.

## Decision

- Tests use **PGlite** (`@electric-sql/pglite`) — real Postgres compiled to WASM, in-memory per test file — through the same Drizzle schema and the real generated SQL migrations (migrations are applied to PGlite in the harness, so migration drift fails tests).
- Dev and prod use real PostgreSQL 16 via `docker-compose` / managed hosting.
- The schema is constrained to core Postgres features (uuid, jsonb, enums, partial indexes, FKs, checks). No extensions beyond `pgcrypto`-equivalent UUID generation done app-side (`crypto.randomUUID()`), keeping PGlite parity exact.

## Consequences

- `pnpm test` runs the full DB suite anywhere in seconds, no services needed.
- Risk: a future need for extensions (e.g. `pg_trgm` search) breaks parity → at that point, add a Docker-Postgres CI job for the affected suites and note it here. Search currently uses `ILIKE` + app-side indexes, revisit at Stage 2 scale.
