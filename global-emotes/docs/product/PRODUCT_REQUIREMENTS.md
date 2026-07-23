# PRODUCT REQUIREMENTS (v1)

One-liner: **Global Emotes turns creator memberships into portable, official emote access that fans can use beyond the original streaming platform.**

## Users & jobs

- **Creator**: "let my subs use my emotes everywhere, without me doing support." → verify ownership, upload packs, set access rules, share one link, see analytics.
- **Fan**: "use the emotes I already pay for, in the apps I actually chat in." → connect accounts, auto-unlock, fast keyboard, honest fallbacks.
- **Admin**: keep the platform safe/compliant with least-privilege tools.

## v1 scope (implemented)

Creator: magic-link auth · handle claim (reserved-word protected) · pack CRUD with plan limits · upload pipeline (static + animated where Pro) · entitlement rules (public/tier/discord_role/patreon_tier/access_code/campaign) · publish with version snapshots · access-code batches · public SSR pages with install CTA.

Fan: account · provider connect (mock/Twitch/Discord wired; others honest-gated) · auto entitlement sync + on-demand refresh · code redemption · library with grace indicators · favorites/recents · search · device sync manifest.

Platform: entitlement engine with grace/reconciliation · asset pipeline · billing (creator SaaS first, Fan Plus flagged) · admin (integration health, takedowns with reasons, flags, audit) · privacy-safe analytics · abuse reporting.

Mobile: Android IME (commitContent + fallbacks, offline cache) · iOS keyboard (copy/shortcode, no Full Access) + share extension.

## Non-goals at v1 (explicit)

Marketplace payouts · YouTube/Kick live adapters (gated) · iMessage stickers · WhatsApp sticker export (flagged research) · browser extension · passkeys UI · multi-language pack localization.

## Success metrics

See ROADMAP validation targets + OBSERVABILITY KPI queries. North star: **weekly successful emote sends per activated fan** (≥3 median).
