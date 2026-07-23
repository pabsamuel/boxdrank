# DATA MODEL

55 tables in `packages/database/src/schema/` (Drizzle, PostgreSQL 16). UUIDs app-generated (`crypto.randomUUID`) for PGlite parity; timestamps are `timestamptz`; soft-delete (`deleted_at`) on creator-facing content.

## Domains

- **identity.ts** — users (with `admin_role`, `fan_plan`), user_emails, sessions (token _hashes_), auth_tokens (single-use magic links), passkeys (schema-ready), oauth_identities, organizations(+members), creator_profiles (unique handle, plan), creator_managers, creator_verifications.
- **providers.ts** — providers registry, provider_connections, provider_tokens (encrypted, 1:1 connection), provider_webhook_subscriptions, provider_sync_runs, **provider_events** (webhook inbox: unique `(provider_id, external_event_id)` = replay protection), external_creator_accounts, external_fan_accounts.
- **emotes.ts** — emote_packs (unique `(creator_id, slug)`), emotes (unique `(creator_id, shortcode)`, `content_hash` for dedupe, provenance `source`), emote_asset_versions (variants jsonb), emote_pack_items, tags(+links), pack_versions (immutable snapshots), pack_publications, upload_grants (quarantine lifecycle), asset_processing_jobs.
- **entitlements.ts** — entitlement_rules (kind + provider + jsonb config + grace override), **entitlements** (state machine column; partial unique index: one live row per `(user, rule)` where status in pending/active/grace — history rows keep other statuses), entitlement_evidence (append-only audit), access_codes(+redemptions, unique per user).
- **usage.ts** — favorites, recent_emotes (upsert + use_count), user_collections(+items), device_installations (random install id, not a fingerprint), device_sync_cursors, asset_cache_grants, privacy_safe_usage_events (allowlist-validated upstream).
- **billing.ts** — products, prices, billing_customers, subscriptions (unique stripe id), invoices, **payment_events** (Stripe inbox idempotency), ledger_accounts/transactions/entries (double-entry; balance invariant enforced in `packages/billing` + tests), refunds, payouts (flag-off).
- **compliance.ts** — terms_versions, user_consents, reports, copyright_reports (DMCA-style), moderation_cases, admin_actions (reason mandatory), audit_logs (append-only), feature_flags, notification_preferences, data_export_requests, account_deletion_requests.

## Deviations from the spec's table list (documented per spec §2)

- `entitlement_sources` + `entitlement_sync_snapshots` merged into `entitlement_evidence` (+`provider_sync_runs`): same information, one audit trail.
- `provider_sync_errors` folded into `provider_sync_runs.error` and `provider_events.error`.
- `pack_localizations` deferred post-v1 (i18n-ready UI copy structure instead).

## Index strategy

Indexes exist for the actual access paths: session token hash, entitlements by (user,status) and (pack,status), pack items by (pack,position), events by name+time, provider events by external id, codes by code. Partial unique on live entitlements is the core correctness constraint (tested in `schema.test.ts`).
