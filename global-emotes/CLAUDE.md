# CLAUDE.md — project rules

Concise operating rules for AI-assisted development in this repo.

1. Read `STATUS.md` first; resume from "Next exact action". Keep it updated and compact.
2. Master specs: `docs/product/SPEC_REVIEW.md` reconciles the two owner-supplied specs. Decisions → `DECISIONS.md`/ADRs, assumptions → `ASSUMPTIONS.md`, risks → `RISKS.md`, owner-only items → `OWNER_ACTIONS.md`.
3. Verify before claiming: `pnpm verify` (format + typecheck + tests). Never mark a phase done without command evidence recorded in `STATUS.md`.
4. Hard rules (never break):
   - No keystroke logging / typed-text capture / surrounding-text reads in any keyboard code path.
   - No scraping, no undocumented endpoints, no invented provider capabilities. Providers only via `packages/provider-sdk` with honest capability status.
   - No secrets in the repo. Every env var documented in `.env.example`.
   - Provider tokens encrypted at rest; never returned to clients or logged.
   - Entitlements computed server-side only; append-only history (revoke, don't delete).
   - Public API contracts come from `packages/contracts`, never raw DB rows.
5. Brand name comes from config (`BRAND_NAME`) — do not hardcode "Global Emotes" in product UI strings.
6. Migrations are additive; never edit an applied migration. `pnpm db:generate` after schema changes.
7. Prefer boring, stable tech. New deps need a reason. Feature-flag anything approval-gated or unfinished.
8. Tests: colocated Vitest (`*.test.ts`); DB tests use the PGlite harness in `packages/database/src/testing.ts`.
