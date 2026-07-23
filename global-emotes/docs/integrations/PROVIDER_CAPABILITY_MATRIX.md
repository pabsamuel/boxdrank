# PROVIDER CAPABILITY MATRIX

Honest, per-provider capability record (master spec §4.1). Statuses: `production_ready` · `credentials_required` · `approval_required` · `creator_authorized_only` · `manual_fallback` · `research_required` · `blocked`. This file is the source of truth mirrored by `packages/provider-sdk` capability declarations and the admin integrations page. **Re-verify against official docs when credentials are configured** — platform terms change.

## Twitch — `credentials_required` (production-ready design)

| Capability | Status | Mechanism |
|---|---|---|
| OAuth | ✅ | OIDC/OAuth2 authorization code + PKCE |
| Creator identity | ✅ | Helix `GET /users` (self) |
| Fan identity | ✅ | Helix `GET /users` (self) |
| Fan membership verification | ✅ **fan-side self-serve** | Helix `GET /subscriptions/user?broadcaster_id&user_id`, fan scope `user:read:subscriptions` |
| Creator-side member list | ✅ | Helix `GET /subscriptions`, broadcaster scope `channel:read:subscriptions` |
| Tier access | ✅ | tiers 1000/2000/3000 in sub response |
| Emote import | ✅ creator-authorized | Helix `GET /chat/emotes` (channel emotes; images via CDN template) — import only with creator's connected account |
| Webhooks | ✅ | EventSub `channel.subscribe`, `channel.subscription.end`, `channel.subscription.gift` (webhook transport, HMAC-SHA256 signed, 10-min replay window) |
| Polling need | Low | reconcile daily + on-login |
| Token lifetime | ~4h access, refresh token | refresh worker |
| Approval | None beyond app registration | rate limit: token-bucket per client |
| Fallback | access codes | — |

## Discord — `credentials_required` (production-ready design)

Role-based access: creator links their guild; fans authorize `identify guilds guilds.members.read`; adapter reads the fan's member object in that guild (`GET /users/@me/guilds/{guild.id}/member`) and maps roles → tiers. Bot with Server Members intent enables creator-side sync + webhookless reconciliation via gateway (deferred; polling at v1). No sub verification — roles are the entitlement primitive. Fallback: codes.

## Patreon — `credentials_required`

API v2: creator OAuth exposes campaign + members with tiers (`include=currently_entitled_tiers`); fan-side `identity` with `identity.memberships` shows the fan's own memberships. Webhooks: `members:pledge` create/update/delete, signed (MD5 HMAC — verify per current docs). Both creator-authorized and fan-side paths implemented; fan-side needs the fan to authorize Patreon.

## YouTube — `approval_required` + `creator_authorized_only`

Channel Memberships API (`members.list`, scope `youtube.channel-memberships.creator`) requires Google approval AND creator OAuth. Fan OAuth alone **cannot** enumerate the fan's memberships — do not pretend otherwise. Adapter ships flag-off with creator-side design; until approval: access codes.

## Kick — `research_required` (flag-off)

Official public API launched 2025 with OAuth; subscription-verification capability/scopes unconfirmed at build time. No scraping. Placeholder adapter declares `research_required`; enable only after verifying official docs.

## Access codes (internal) — `production_ready`

Batch generation, expiry, max redemptions, tier mapping, revocation, rate-limited redemption. Universal fallback for every platform above.

## Generic webhook partner (internal) — `production_ready` (flag-off by default)

HMAC-signed partner endpoint: partners POST normalized entitlement events (grant/revoke) with shared-secret signature + timestamp replay window. For future direct platform partnerships.

## Telegram (export, not entitlement) — `credentials_required`

Bot API sticker methods: `createNewStickerSet`/`addStickerToSet`/`deleteStickerFromSet`. Static: PNG/WEBP 512px. Animated: WEBM (VP9) or TGS. Attribution in set title/link. Limitation (documented to creators): removing a sticker stops new distribution, but users who added the set may retain cached copies — full remote wipe is not possible.
