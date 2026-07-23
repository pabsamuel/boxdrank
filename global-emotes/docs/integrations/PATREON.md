# Patreon integration

Status: **credentials_required** — designed, shipped as an honest placeholder adapter (flag-off) until credentials + implementation slot.

Design (API v2, verify at implementation time): creator OAuth exposes campaign + members with `currently_entitled_tiers`; fan-side `identity?include=memberships` shows the fan's own memberships. Webhooks `members:pledge:*` are HMAC-signed (verify current digest algorithm in official docs — historically MD5). Grace default 120h (Patreon billing lags monthly). Rule kind `patreon_tier` with `{ tierIds: [] }` is already implemented in the engine + rule matcher, so enabling Patreon is adapter-only work.

Fallback until then: access codes.
