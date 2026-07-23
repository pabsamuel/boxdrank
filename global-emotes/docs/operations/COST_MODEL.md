# COST MODEL

Monthly estimates, mid-2026 list prices, pragmatic vendor mix (Fly/Neon/Upstash/R2/Resend/Sentry-free-tier at the low end). Assumptions: avg 40 emotes/user synced, keyboard variant ~15KB, share ~60KB, 30 sends/user/mo, CDN cache hit ≥ 90% (content-addressed assets cache forever).

| Line                                 | 1k users | 10k users | 100k users | 1M users    |
| ------------------------------------ | -------- | --------- | ---------- | ----------- |
| Compute (api+worker+web)             | $15      | $40       | $250       | $1,800      |
| PostgreSQL (managed)                 | $0–19    | $50       | $300       | $1,500      |
| Redis                                | $0–10    | $20       | $100       | $400        |
| Object storage (R2, ~2GB→2TB)        | $1       | $5        | $40        | $350        |
| CDN egress (R2 zero-egress + CF)     | $0       | $0        | $20        | $200        |
| Image processing (in worker compute) | —        | —         | —          | —           |
| Email (Resend/SES)                   | $0       | $20       | $90        | $600        |
| Monitoring (Sentry/uptime)           | $0       | $26       | $80        | $400        |
| Support tooling                      | $0       | $0        | $100       | $500        |
| **Infra total**                      | **~$35** | **~$160** | **~$980**  | **~$5,750** |

Payment fees: ~2.9%+30¢ of revenue (Stripe), not infra. App-store fees apply only if consumer IAP ships (Fan Plus mobile — flagged off at v1; creator SaaS sold on web).

Revenue sanity check: at 10k users ≈ 300 creators, 5% Pro ⇒ 15 × $12 = $180 MRR ≈ infra breakeven; the model expects creator conversion to carry costs until Fan Plus validates.

## Safeguards (implemented / configured)

Upload caps (2MB, dimensions, frames) · plan-based pack/emote limits · content-hash dedupe (identical uploads = one object) · quarantine lifecycle purge (7d) · rate limits on all write paths · analytics allowlist keeps event volume bounded; add sampling at Stage 2 · budget alerts + egress monitoring = provider-console setup step in DEPLOYMENT.md · queue backpressure via BullMQ concurrency caps.
