# IMPROVEMENT PROPOSALS

Structured review per master spec §2. Format: assumption → problem → recommendation → impact → cost → risk → decision.

## IP-01 · Creator SaaS before Fan Plus — **ADOPTED**

- Assumption (Spec A): Fan Plus and creator tiers launch together as co-equal revenue.
- Problem: fan willingness-to-pay for emote tooling is unproven; split focus dilutes the launch.
- Recommendation: creator SaaS (Free/Pro/Business) is the primary monetization at launch; Fan Plus ships wired but feature-flagged for pricing experiments.
- Impact: faster revenue validation with the audience already paying for creator tools; simpler App Store review (no consumer IAP at v1 — creator plans sold on web where policy allows).
- Cost: low — same billing package serves both. Risk: low.

## IP-02 · Twitch-first wedge with fan-side verification — **ADOPTED**

- Assumption: providers are roughly interchangeable in priority.
- Problem: YouTube is approval-gated, Kick unconfirmed, Patreon needs creator auth; only Twitch lets a fan self-verify a sub with their own OAuth token.
- Recommendation: market launch as "your Twitch sub, everywhere"; Discord roles second (also self-serve via `guilds.members.read`); codes cover the rest.
- Impact: fully self-serve activation loop → lower CAC. Cost: none (ordering choice). Risk: Twitch policy dependence (mitigated by adapter isolation + codes).

## IP-03 · Access codes as universal launch fallback, upgraded — **ADOPTED**

- Assumption (Spec A §6.2): manual codes are a stopgap.
- Problem: undersells them — codes are also the creator's tool for Discord-less communities, IRL events, and platforms that never get APIs.
- Recommendation: first-class code system: batch generation, expiry, max-redemptions, tier mapping, CSV export, QR codes.
- Impact: every creator can launch day one regardless of platform approvals. Cost: low. Risk: code resale/leak → rate limits + per-code caps + revocation.

## IP-04 · Entitlement engine as pure library — **ADOPTED**

- Assumption: engine implemented inside the API service.
- Problem: hardest logic (out-of-order events, grace, reconciliation) becomes untestable spaghetti when welded to HTTP + queue code.
- Recommendation: `packages/entitlement-engine` is a pure, deterministic library (evidence in → decisions out) with exhaustive unit tests; API/worker are thin drivers.
- Impact: the defensible core is provably correct and future-extractable as a service ("entitlement infrastructure" is the long-term moat — could itself become a B2B product). Cost: none. Risk: none.

## IP-05 · PGlite for tests — **ADOPTED**

- Assumption: DB tests need Docker Postgres.
- Problem: Docker unavailable in several CI/dev contexts; container startup slows the loop.
- Recommendation: embedded PGlite (WASM Postgres) for migration + integration tests; identical Drizzle schema; real Postgres in dev/prod.
- Impact: `pnpm test` runs anywhere in seconds. Cost: one dev-dep. Risk: extension mismatch — mitigated by keeping schema to core Postgres features (ADR-0003).

## IP-06 · Compatibility registry as server data, not app constants — **ADOPTED** (from Spec B)

- Problem: hardcoded per-app MIME support goes stale with every target-app update and requires store releases to fix.
- Recommendation: server-served, versioned compatibility registry (`packages/contracts` schema + API endpoint + seeded data); keyboards cache it and fall back to runtime `EditorInfo` detection first, registry hints second.
- Impact: fix compatibility claims without shipping app updates. Cost: low. Risk: stale cache → TTL + runtime detection primacy.

## IP-07 · Sticker-file export channel (Telegram now, WhatsApp later) — **PARTIAL / FLAGGED**

- Problem: keyboard-only delivery underuses platforms with native sticker ecosystems where insertion UX is better than paste.
- Recommendation: keep Telegram export (spec'd); add WhatsApp sticker-pack export as a flagged follow-up (official `.wastickers`-style third-party flow requires a mobile companion component).
- Decision: Telegram in v1; WhatsApp behind `whatsapp_export` flag, research ticket in ROADMAP. Risk: format churn — isolated in export adapters.

## IP-08 · Double-entry ledger tables ship in v1 schema — **ADOPTED**

- Problem: retrofitting a ledger after marketplace launch is a migration nightmare; Spec A demands never trusting one balance number.
- Recommendation: create `ledger_accounts/transactions/entries` now with invariant checks (balanced entries), used only by subscription bookkeeping until marketplace unlocks.
- Cost: low (tables + one service). Risk: none.

## IP-09 · No Supabase — **REJECTED alternative** (Spec B suggestion)

- See ADR-0001/0002: custom evidence-driven auth + jobs + admin flows fight RLS-centric managed backends; local/CI testability without external accounts is a hard requirement here. Storage abstraction keeps R2/S3 portability which was Supabase's main draw.

## IP-10 · Defer React Native shell — **ADOPTED (revisit trigger defined)**

- Spec B suggests RN bare for app shells. V1 shells are thin; native Kotlin/Swift avoids a third toolchain. Revisit if app-surface scope exceeds ~15 screens or a web-parity feed emerges (trigger recorded in ROADMAP).

## IP-11 · "Creator page = landing funnel" — **ADOPTED**

- Problem: spec treats creator pages as profile pages; they're actually the top of the growth funnel.
- Recommendation: public pack/creator pages are SSR, SEO'd, with OG images, install deep links, membership CTA ("Subscribe on Twitch to unlock"), QR, and attribution parameters — measured end to end (`creator page → install → activation` funnel events).
- Impact: the product's only organic acquisition surface gets treated like one. Cost: modest. Risk: none.
