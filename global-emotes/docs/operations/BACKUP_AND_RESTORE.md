# BACKUP AND RESTORE

## Backups

- **PostgreSQL**: managed-provider automated daily snapshots + PITR/WAL where offered; retain 30 days. Weekly logical dump (`pg_dump -Fc`) to a private, versioned bucket as provider-independent insurance.
- **Object storage**: originals + processed are content-addressed and immutable → bucket versioning + cross-region replication (R2/S3 setting). Quarantine bucket is disposable (7-day lifecycle).
- **Redis**: not backed up — queues are re-derivable; scheduled jobs re-register on worker boot. Accept loss of in-flight jobs; idempotency makes replays safe.
- **Secrets**: in the platform secret manager + owner's vault; never in backups of the repo.

## Restore drill (run quarterly; record date/result here)

1. Spin a scratch Postgres; `pg_restore` the latest logical dump.
2. Point a local API at it (`DATABASE_URL=...`), run `pnpm db:migrate` (should no-op or fast-forward), then `pnpm --filter @global-emotes/api test` smoke subset against real data volumes.
3. Verify counts vs production (`users`, `entitlements`, `emotes`) and a signed-URL fetch for a random processed asset.
4. Time the drill; RTO target ≤ 2h, RPO ≤ 24h (tighten with PITR once on a provider that supports it).

| Drill date | Operator | RTO | Result                   |
| ---------- | -------- | --- | ------------------------ |
| —          | —        | —   | not yet run (pre-launch) |
