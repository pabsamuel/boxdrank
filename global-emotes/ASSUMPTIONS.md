# ASSUMPTIONS

Assumptions made to keep building without inventing business or platform behavior. Each is reversible unless marked.

## Business

1. **Two master specs are one product.** The owner supplied `global-emotes-claude-master-prompt.md` (master) and `EMOTE_HUB_CLAUDE_MASTER_BUILD.md` (operating discipline). Merged per ADR-0002. Product name: "Global Emotes", provisional, config-isolated.
2. **Pricing placeholders** (config-driven, changeable without code): Fan Plus $3.99/mo · $29.99/yr; Creator Pro $12/mo · $99/yr; Creator Business $49/mo. Regional pricing deferred to Stripe price objects.
3. **Free plan limits** (config-driven): Creator Free = 1 provider connection, 3 packs, 30 emotes total, static only. Creator Pro = 10 providers, 50 packs, 1,000 emotes, animated allowed.
4. Marketplace + creator payouts stay **feature-flagged off** until KYC/tax/store-policy review (spec §5.6).

## Platform (verified against official docs as of Jan 2026 knowledge; re-verify at credential setup)

5. **Twitch**: Helix `GET /subscriptions/user` with fan token scope `user:read:subscriptions` verifies a fan's sub to a broadcaster; broadcaster-side list requires `channel:read:subscriptions`. EventSub `channel.subscribe`/`channel.subscription.end` webhooks exist. Status: production_ready (credentials_required).
6. **Discord**: fan OAuth `identify` + `guilds.members.read` reads the fan's roles in a guild; bot in guild can read members with the Server Members intent. Status: production_ready (credentials_required).
7. **Patreon**: API v2 `identity` + campaign membership endpoints expose patron tiers with creator authorization. Status: credentials_required.
8. **YouTube**: Channel Memberships API (`members.list`) is allowlist/approval-gated and creator-authorized only; fan OAuth alone cannot enumerate memberships. Status: approval_required.
9. **Kick**: official public API surface for subscription verification unconfirmed. Status: research_required, feature-flagged off.
10. **iOS**: keyboard extensions cannot insert images into arbitrary apps; pasteboard + share extension is the honest path. **Not reversible — platform fact.**
11. **Android**: `InputConnectionCompat.commitContent` inserts images/GIF/WebP where the editor declares MIME support via `EditorInfo.contentMimeTypes`; otherwise clipboard/share fallback. Platform fact.
12. **Telegram**: Bot API supports creating/managing sticker packs (512px WEBP/PNG static, WEBM/TGS animated); deleting stickers from a set is supported, full remote uninstall from users' clients is not.

## Technical

13. Node 22 LTS, pnpm 10, TypeScript 5.7 strict; versions pinned in lockfile.
14. DB/integration tests run on embedded PGlite (WASM Postgres); dev/prod run real PostgreSQL 16. Feature parity risks (extensions) tracked in ADR-0003.
15. Local object storage = MinIO; prod = any S3-compatible store (R2/S3) behind one client.
16. Android/iOS projects cannot be compiled in this CI environment; builds are validated by the mobile workflows and a human with the documented commands (`docs/operations/MOBILE_BUILDS.md`).
