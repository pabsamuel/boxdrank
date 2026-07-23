# SYSTEM OVERVIEW

Modular monolith (ADR-0001): three runtime processes over shared packages.

```
 fans/creators ──▶ web (Next.js SSR)         admin ──▶ web /admin
        │                │  cookies (SameSite=Lax)
        ▼                ▼
      api (Fastify, /v1) ──────────────┐
        │        │                     │ enqueue (BullMQ/Redis)
        │        │ Drizzle             ▼
        │        ▼                  worker ── sharp variants ──▶ S3 buckets
        │   PostgreSQL 16              │                          (quarantine/
        │        ▲                     │ sweep/refresh/cleanup     originals/
        │        └─────────────────────┘                           processed)
        ▼
 provider adapters (Twitch/Discord/mock/codes…) ──▶ official platform APIs only
        ▲
 webhooks (EventSub, Stripe) — signature-verified, inbox-idempotent

 Android IME / iOS keyboard ◀── /v1/sync/manifest (signed asset URLs)
   └─ offline cache; keyboards perform no network I/O of their own
```

## Request/data flow invariants

- Public API contracts come from `packages/contracts` (Zod), never raw DB rows.
- Entitlement writes go through `entitlement-engine` decisions only; evidence rows form the audit trail; history is never deleted.
- Webhook processing = verify signature → inbox insert (unique event id; duplicate ⇒ ack+skip) → normalize → engine → mark processed.
- Member-only assets are served via short-lived signed URLs; originals never get public URLs.
- Provider tokens: AES-256-GCM at rest, never serialized to clients or logs.

## Scaling triggers (do not build early)

| Trigger                   | Action                                                        |
| ------------------------- | ------------------------------------------------------------- |
| API p95 > 300ms sustained | horizontal API replicas (stateless; rate-limit store → Redis) |
| queue lag > 5 min         | worker replicas + per-queue concurrency tuning                |
| search latency on `ILIKE` | pg_trgm index, then OpenSearch at Stage 2 (ADR-0003 note)     |
| usage_events > ~50M rows  | monthly partitioning + aggregate rollups                      |
| read pressure             | Postgres read replica for manifest/public reads               |
| multi-region demand       | CDN-first assets already global; API regionalization last     |

## Extraction seams

`entitlement-engine`, `provider-sdk`, `asset-pipeline`, `billing` are pure packages with no HTTP/queue imports — each can become a service by wrapping its public interface. The entitlement engine is the long-term platform play (verification-as-a-service).
