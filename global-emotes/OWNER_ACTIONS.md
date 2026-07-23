# OWNER ACTIONS

Everything only the owner can supply. Nothing here blocks development — mocks and test modes cover all flows until these arrive.

## Accounts & credentials (needed before staging/production)

- [ ] Final product name + domain (update `BRAND_NAME`, `PUBLIC_WEB_URL` in env; one config change)
- [ ] Twitch dev application → `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, EventSub callback URL registered
- [ ] Discord application + bot → `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN` (enable Server Members intent)
- [ ] Patreon client → `PATREON_CLIENT_ID`, `PATREON_CLIENT_SECRET`
- [ ] YouTube: apply for Channel Memberships API access (approval-gated; adapter ships disabled)
- [ ] Telegram bot (via @BotFather) → `TELEGRAM_BOT_TOKEN` for sticker export
- [ ] Stripe account (test + live keys) → `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`; create products/prices per `docs/product/MONETIZATION.md`
- [ ] Transactional email provider (Resend/Postmark/SES) → `EMAIL_PROVIDER`, API key; local dev uses Mailpit
- [ ] S3-compatible bucket (R2/S3) + CDN; local dev uses MinIO
- [ ] Managed PostgreSQL + Redis (staging, production)
- [ ] Sentry (or compatible) DSNs for web/api/worker/mobile
- [ ] Apple Developer account (bundle IDs, app group `group.<bundleid>.shared`, signing certs, TestFlight)
- [ ] Google Play Console account (application ID, signing, internal testing track)

## Business / legal (before public launch)

- [ ] Legal entity + privacy contact details (fills placeholders in `docs/legal/*`)
- [ ] Qualified legal review of ToS, Privacy Policy, Creator Content License, DMCA process (all currently drafts)
- [ ] Final pricing, currencies, tax registration (Stripe Tax config)
- [ ] Logo/app icons/brand assets (temporary wordmark shipped; drop-in replacement documented in `packages/ui`)
- [ ] Physical-device test pass (iPhone + 2–3 Android devices) against `docs/COMPATIBILITY_MATRIX.md`
- [ ] Decide repository license (LICENSE is a restrictive placeholder)
