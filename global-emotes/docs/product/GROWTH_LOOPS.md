# GROWTH LOOPS

## Primary loop (implemented surface)

creator publishes → shares `/{handle}/{slug}` (SSR, OG-tagged, access badges, install CTA) → fan lands → installs/signs in → connects platform or redeems code → pack unlocks → fan sends emotes in group chats → **recipients see branded emotes** → some are fans of the same creator → land on the pack page…

Instrumented end-to-end: `pack_page_viewed → install_link_clicked → account_created → provider_connected → pack_unlocked → keyboard_enabled → insertion_succeeded` (funnel in `packages/analytics`).

## Creator-side loop

Membership CTA on locked packs ("Subscribe on Twitch to unlock") → fan subscribes on-platform → returns → `/v1/entitlements/refresh` re-checks → unlock. This makes Global Emotes a **conversion asset for creators** (measured via `membership_cta_clicked` → unlock join), which is the pitch that makes creators promote their link — attacking pre-mortem Failure 3.

## Launch playbook (not code)

- Twitch-first wedge ("your sub works in WhatsApp/Telegram/Discord").
- Done-for-you onboarding for the first 50 creators (we upload their packs from their own assets with permission).
- QR + link kit auto-generated per pack (QR endpoint = post-v1 ticket; share_link_copied tracked now).
- Emote attribution is subtle by design — no watermark spam (Fan trust > virality theater).

## Anti-spam commitments

No unsolicited DMs, no auto-posting to connected platforms, no dark-pattern share prompts (spec §26).
