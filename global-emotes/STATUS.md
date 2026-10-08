# STATUS

> Living document. A new session should be able to resume from this file alone.

## Current phase

Phase 8 complete — all 9 phases delivered. Repository is feature-complete for the v1 scope defined in `docs/product/PRODUCT_REQUIREMENTS.md`.

## Phase log

| Phase | Scope                                                                                               | Status  | Verified                                                             |
| ----- | --------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------- |
| 0     | Spec merge, ADRs 1–3, governance, monorepo foundation                                               | ✅      | `pnpm install` clean                                                 |
| 1     | config + contracts + database (55 tables, migrations, PGlite harness, seeds)                        | ✅      | db tests 4/4, typecheck                                              |
| 2     | entitlement engine + provider SDK (mock/Twitch/Discord/codes/placeholders)                          | ✅      | 23/23 + 12/12                                                        |
| 3     | auth crypto, asset pipeline, billing, analytics, notifications, observability                       | ✅      | 5+11+12+3+3 tests                                                    |
| 4     | Fastify API: auth, packs, uploads, entitlements, providers, sync, billing, admin, webhooks, OpenAPI | ✅      | 22/22 integration tests                                              |
| 5     | Worker: asset processing, entitlement sweep, token refresh, cleanup (BullMQ)                        | ✅      | 5/5 handler tests                                                    |
| 6     | Next.js web: marketing, login, studio, pack editor, library, public SSR pages                       | ✅      | `next build` 13 routes                                               |
| 7     | Android IME (commitContent+fallbacks) + iOS keyboard/share extensions                               | ✅ code | builds need SDK/Xcode (MOBILE_BUILDS.md); JVM/XCTest suites included |
| 8     | CI (verify/migration-drift/keyboard-privacy/web-build/security), infra, full docs, legal drafts     | ✅      | `pnpm verify` green — see below                                      |

## Test status

`pnpm verify` → format check + typecheck (11 packages) + 104 Node-side tests + 5 Playwright browser e2e, all green (see `docs/QA_TEST_PLAN.md` for the suite map). Mobile suites (5 JVM + 2 XCTest) require Android SDK / Xcode. Android APK CI green on main and publishing to the `android-latest` release; `setup-android` now pins `packages: ''` because current runner images dropped the obsolete `tools` SDK package.

## Blockers

None for development. Launch requires owner inputs only: credentials (Twitch/Discord/Stripe/Telegram/email/S3), Apple+Google accounts, legal review of `docs/legal/*`, real-device compatibility pass. Full list: `OWNER_ACTIONS.md`; shortest ordered click-path: `DEPLOY_NOW.md`.

## Known gaps (honest, tracked in QA_TEST_PLAN.md)

Malware-scan hook in pipeline (Stage 2) — the only one left. Closed post-Phase-8: Playwright e2e (5 browser tests), k6 load scripts, data-export job, Telegram export job, Gradle wrapper (8.11.1, committed; `android-apk.yml` builds via `./gradlew`), post-deploy smoke script (`infrastructure/scripts/smoke.sh`).

## Pre-deploy audit (before the first real deploy)

Walked the whole `DEPLOY_NOW` path against the code. Two blockers found and
fixed, both of which would have produced a deploy that looked healthy:

- **Containers could not start.** Entrypoints ran `node_modules/.bin/tsx` from
  the repo root, but pnpm links a workspace package's binaries under that
  package. Fixed, plus a `.dockerignore` and full workspace manifests in the
  deps stage.
- **Sign-in email could never send.** The nodemailer transport carried no auth
  and the config had no credential fields, so no hosted provider could be
  reached and no owner-supplied value could have fixed it. Added
  `SMTP_USER`/`SMTP_PASS`/`SMTP_SECURE` with tests.

Checked and sound, no change needed: R2 works with the S3 adapter
(`forcePathStyle` + env region/endpoint); `db:migrate` runs `tsx src/migrate.ts`
(not drizzle-kit) and both `tsx` and the migrations ship in the image; the web's
`BRAND_NAME`/`PUBLIC_API_URL` are mapped in `next.config.mjs`.

## Next exact action

Owner: walk `DEPLOY_NOW.md` (Railway + Vercel + Resend signups, R2 buckets, DNS on the already-owned `atesensoftware.com`). Engineering: only the Stage-2 malware-scan hook remains deferred; nothing blocks deploying.
