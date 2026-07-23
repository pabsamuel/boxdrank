# SPEC REVIEW

Reconciliation and critical review of the two owner-supplied master specifications:

- **Spec A** — `global-emotes-claude-master-prompt.md` ("Global Emotes"): expansive product master — entitlement portability from existing memberships (Twitch/Discord/Patreon/YouTube/Kick), full monetization matrix, marketplace ledger, 12 phases.
- **Spec B** — `EMOTE_HUB_CLAUDE_MASTER_BUILD.md` ("EmoteHub"): leaner execution directive — creator-SaaS-first monetization, Supabase suggestion, strict phase gates, governance files, credit efficiency.

Both describe the same product: portable creator emote packs + mobile keyboard delivery. Per owner instruction, **Spec A is the product master; Spec B's operating discipline is adopted** (STATUS/DECISIONS/ASSUMPTIONS/RISKS/OWNER_ACTIONS, phase gates, honest platform language, pre-mortem). Conflicts resolved in ADR-0002.

## 1. Product understanding (condensed)

Creators verify platform ownership, upload official emotes into packs, and attach access rules (public, follower, sub/member tier, Discord role, Patreon tier, access code, purchase, campaign). Fans connect accounts; the entitlement engine converts verified provider evidence into pack unlocks with grace periods and an audit trail. Delivery: Android IME rich-content insertion with fallbacks; iOS keyboard + pasteboard + share extension (honest, no fake emoji claims); Telegram sticker export; web library. Revenue: creator SaaS first, Fan Plus second, marketplace flagged for later.

## 2. Conflict resolution (A vs B)

| Topic                       | Spec A                                     | Spec B                                | Decision                                                                                                                                                                                                                                                                                            |
| --------------------------- | ------------------------------------------ | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend                     | Fastify/NestJS + Postgres + Redis + BullMQ | Supabase                              | **Fastify + Drizzle + Postgres + Redis** (ADR-0001): zero external accounts to run/test; entitlement engine needs first-class background jobs and custom auth flows; RLS-centric Supabase model fits CRUD apps better than an evidence-driven engine. Storage stays S3-compatible (R2-ready) per B. |
| First revenue               | Fan Plus + Creator tiers together          | Creator SaaS first                    | **Creator SaaS first** (B). Creators already pay for tools; fans are unproven. Fan Plus ships behind a flag with Stripe wiring in place.                                                                                                                                                            |
| Mobile app shell            | native-first, hybrid allowed for screens   | React Native bare + native extensions | **Native Kotlin/Swift for v1 shells too.** The app shells are thin (library, onboarding, settings); RN adds toolchain weight for little gain at this scope. Documented as ADR-0002 §3; revisit if app-surface scope grows.                                                                          |
| Entitlement scope at launch | many providers                             | invite codes + native SaaS first      | **Both**: mock + access codes + Twitch as reference adapter; Discord next; Patreon/YouTube/Kick scaffolded behind flags with honest statuses.                                                                                                                                                       |
| Governance                  | docs/ tree                                 | root STATUS/DECISIONS/etc.            | Both: root governance files + full docs tree.                                                                                                                                                                                                                                                       |

## 3. Strongest launch wedge (review conclusion)

Twitch-first: Twitch is the only major platform where a **fan's own OAuth token** can verify their sub to a specific broadcaster (`user:read:subscriptions`) without creator-side approval gates. That makes the fan activation loop self-serve. Launch story: "Your Twitch sub now works in WhatsApp/Discord/Telegram." Access codes cover every other platform on day one.

## 4. What was cut or deferred from Spec A's v1 (with reasons)

- **Marketplace + payouts**: flagged off; double-entry ledger tables ship (cheap now, expensive to retrofit) but no payout flows (KYC/tax/store review pending).
- **Passkeys**: deferred; magic-link + OAuth linking covers launch. Table exists.
- **Kick**: research_required; feature-flagged placeholder adapter only.
- **APNG/video emotes**: off by default; pipeline supports GIF/animated WebP.
- **Read replicas, partitioning, multi-region**: documented triggers only (docs/architecture/SYSTEM_OVERVIEW.md).
- **iMessage sticker extension**: deferred to post-v1 (extension budget spent on keyboard + share).

## 5. Definition-of-done deltas

This environment cannot compile Android/iOS or run Docker; those gates are encoded as CI workflows + documented human commands rather than locally-executed builds. Everything Node-side (packages, API, worker, web) is built and tested here. Recorded per-phase in `STATUS.md`.

## 6. Pre-mortem

Adopted verbatim from Spec B §16 into `RISKS.md` (7 failure modes with warnings/mitigations), plus entitlement-correctness and cost-blowout risks from Spec A.
