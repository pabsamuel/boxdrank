# OBSERVABILITY

## Implemented

- Structured pino logs (`packages/observability`) with hard redaction (tokens/cookies/secrets); request ids on every response (`x-request-id`) and in error envelopes.
- Health endpoint `/v1/health`; per-provider health in `/v1/admin/integrations`.
- Job observability: BullMQ states + `provider_sync_runs` / `asset_processing_jobs` / `payment_events` status columns are queryable dashboards in themselves.
- Sentry-compatible DSN env hooks (web/api/worker) — enable by setting `SENTRY_DSN`.
- OpenTelemetry: pino logs carry request ids as the correlation spine; full OTel traces are a Stage-2 wire-up (hook points: Fastify onRequest/onResponse, BullMQ processors).

## SLOs (initial, tighten with data)

| SLO                                       | Target                            |
| ----------------------------------------- | --------------------------------- |
| API availability                          | 99.9% monthly                     |
| API p95 latency (reads)                   | < 300ms                           |
| Entitlement sync freshness (webhook path) | < 60s event→unlock                |
| Entitlement sweep cadence                 | ≤ 15 min                          |
| Upload → active emote                     | p95 < 60s                         |
| Stripe webhook processing                 | < 30s, 0 lost (inbox)             |
| Checkout success rate                     | > 98% of attempts reaching Stripe |

## KPI queries (privacy-safe, run on `privacy_safe_usage_events`)

```sql
-- DAU / WAU / MAU
SELECT count(DISTINCT coalesce(user_id::text, install_id)) FROM privacy_safe_usage_events
WHERE occurred_at > now() - interval '1 day';
-- Fan activation funnel (FUNNELS.fan_activation in packages/analytics)
SELECT name, count(DISTINCT coalesce(user_id::text, install_id)) FROM privacy_safe_usage_events
WHERE name IN ('pack_page_viewed','account_created','provider_connected','pack_unlocked','keyboard_enabled','insertion_succeeded')
GROUP BY name;
-- Send success by method
SELECT props->>'method' AS method, count(*) FILTER (WHERE name='insertion_succeeded') AS ok,
       count(*) FILTER (WHERE name='fallback_copied') AS fallback
FROM privacy_safe_usage_events GROUP BY 1;
-- MRR proxy (active subscriptions × price)
SELECT product_key, count(*) FROM subscriptions WHERE status IN ('active','trialing') GROUP BY 1;
```

Alert policies (set in the monitoring vendor): health check fail > 2 min · Sentry error-rate spike · queue failed > 50 · webhook failures > 5/hour · DB connections > 80% · egress budget 80%.
