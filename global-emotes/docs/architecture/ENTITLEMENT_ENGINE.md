# ENTITLEMENT ENGINE

The defensible core (master spec §10). Pure library: `packages/entitlement-engine` — no HTTP, queue, or DB imports; drivers live in `apps/api/src/services/entitlement-service.ts` and `apps/worker/src/handlers.ts`.

## State machine

```
            +──────────── admin restore ─────────────+
            ▼                                        │
pending ─▶ active ─▶ grace ─▶ expired            revoked
   │          ▲  ▲      │        │                   ▲
   │          │  └──────┘        └── new evidence ──▶ active
   │          │  (membership resumes)
   └──────────┘                       disputed ⇄ any (admin only)
```

Rules proven by `engine.test.ts` (23 tests):

- **Out-of-order safety**: evidence older than `lastVerifiedAt` is ignored (watermark).
- **Duplicate safety**: dedupe key = kind+provider+externalRef+observedAt+active; replays are no-ops.
- **Grace over punishment**: negative evidence or lapsed expiry moves active → grace (provider-configurable hours: Twitch 72, Discord 24, Patreon 120, codes 0); grace anchors at the expiry, not sweep time, so late sweeps never extend access.
- **Admin supremacy**: automated evidence never overrides revoked/disputed; admin actions revoke immediately (no grace) and can restore.
- **No deletion**: endings are transitions; every decision writes an `entitlement_evidence` row.

## Evidence sources

`api_poll` (adapter sync), `webhook` (EventSub/mock), `access_code`, `billing`, `admin_action`, `manual_import` — all normalized to `ExternalEntitlement` (contracts) before matching `ruleMatchesEvidence` (tier lists, Discord guild+role, Patreon tiers, campaigns).

## Reconciliation jobs (worker)

- `entitlement-sweep` (15 min): expiry → grace, grace → expired, email on grace entry. Idempotent.
- provider polling on login + on-demand `/v1/entitlements/refresh` (rate-limited).
- webhook inbox replay: failed `provider_events` rows can be reprocessed (admin).
- token refresh keeps sync possible; failed refresh marks the connection `expired` (evidence stops, grace protects the user until reconnect).
