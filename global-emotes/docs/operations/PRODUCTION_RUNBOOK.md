# PRODUCTION RUNBOOK

## Daily signals

`/v1/health` uptime · Sentry error rate · BullMQ queue depth/failed counts · `provider_sync_runs` failure ratio · Stripe webhook `payment_events.status='failed'` count · disk/egress budgets.

## Common operations

- **Replay failed provider webhooks**: `provider_events` rows with `status='failed'` → re-POST payload through the adapter path or reset status and let the admin replay tool process (safe: inbox dedupe by external id).
- **Replay failed Stripe events**: Stripe dashboard → resend event; inbox dedupe makes this safe.
- **Force-resync a user**: admin → user lookup → `POST /v1/entitlements/refresh` on their behalf, or run the sweep job ad hoc.
- **Provider outage**: nothing to do immediately — grace periods protect users. If outage > grace window, temporarily raise `graceHoursOverride` on affected rules (SQL) and note in the incident log.
- **Suspend abusive content**: admin pack-suspend / emote-takedown endpoints (reason mandatory, audited). Clients tombstone on next manifest sync.
- **Stuck queue**: check Redis memory; `failed` jobs retry with backoff ×5 then park — inspect payloads, fix cause, retry from BullMQ.

## Scheduled jobs (worker)

entitlement-sweep 15m · token-refresh 10m · cleanup 1h. If the worker is down: entitlements over-stay (safe direction), uploads stall (user-visible) — restart worker first.

## Deploy/rollback

See DEPLOYMENT.md. Never run destructive SQL by hand in production; write a migration or an audited admin action.
