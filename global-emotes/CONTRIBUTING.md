# Contributing

## Workflow

1. Branch from `main`.
2. Keep changes scoped; one vertical slice per PR.
3. `pnpm verify` must pass (format, typecheck, tests) before review.
4. Update docs in the same PR when behavior changes — docs must match implementation.
5. Migrations: generate with `pnpm db:generate`, never edit applied migrations, always additive where possible.

## Rules that are enforced, not aspirational

- No secrets in the repo. `.env` is gitignored; `.env.example` documents every variable.
- No keystroke logging or typed-text capture anywhere in keyboard code paths (CI-checked).
- No scraping, no undocumented endpoints, no fake provider capabilities. New providers go through `packages/provider-sdk` with an honest capability declaration.
- Public API contracts live in `packages/contracts`, not raw DB models.
- Destructive admin operations require a reason string and produce audit log entries.

## Code style

Prettier + strict TypeScript. Match surrounding idiom. Tests colocated in `src/**/*.test.ts` (Vitest).
