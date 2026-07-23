# Twitch integration

Status: **credentials_required** (design production-ready; adapter implemented + tested).

- OAuth2 authorization-code at `id.twitch.tv/oauth2`; fan scope `user:read:subscriptions`, creator scope `channel:read:subscriptions`. Access tokens ~4h + refresh tokens (refresh worker every 10 min sweep).
- **Fan-side self-serve verification** (the launch wedge): Helix `GET /subscriptions/user?broadcaster_id&user_id` with the fan's token → tier `1000|2000|3000`; 404 = no sub = negative evidence.
- Creator verification: OAuth self-identity (`GET /users`) — the connected account _is_ the channel.
- Emote import: `GET /chat/emotes?broadcaster_id=` with the creator's connected account only (spec §4.2 permission rule).
- EventSub webhooks: `channel.subscribe`, `channel.subscription.end`, `channel.subscription.gift`; HMAC-SHA256 over `id+timestamp+body`, 10-minute replay window, challenge handshake — all implemented + tested in `packages/provider-sdk/src/adapters/twitch.ts`.
- Setup: create app at dev.twitch.tv → set `TWITCH_CLIENT_ID/SECRET/EVENTSUB_SECRET` → add callback `https://api.<domain>/v1/providers/twitch/callback` → enable via admin flag. Re-verify current scope names against official docs at setup time.

Fallback: access codes. Rate limits: Helix token-bucket per client id — adapter uses backoff+jitter and negative-evidence caching via engine watermarks.
