# INCIDENT RESPONSE

## Severity

- **SEV1** — active data exposure, auth bypass, payment compromise, keyboard privacy violation. Drop everything.
- **SEV2** — entitlement corruption at scale, provider outage > 24h (grace expiring), asset pipeline down.
- **SEV3** — degraded performance, single-provider sync failures.

## SEV1 playbook

1. Declare in the incident channel; assign an incident lead (single decision-maker).
2. Contain: kill switches — feature flags per provider (`/v1/admin/providers/:id/toggle`), billing route disable (unset `STRIPE_WEBHOOK_SECRET` refuses events safely — inbox will replay), API scale-to-zero as last resort.
3. Rotate exposed secrets per the key-rotation runbook (THREAT_MODEL.md); revoke sessions (`sessions.revoked_at` bulk update) if session compromise is possible.
4. Preserve evidence: snapshot DB, export relevant `audit_logs`/`admin_actions` before any cleanup.
5. Eradicate + recover; verify with the QA smoke plan.
6. Notify: affected users within 72h where personal data is involved (legal counsel review — OWNER_ACTIONS contact); store-policy notification if keyboard privacy was implicated.
7. Blameless post-mortem within 5 days → new tests/controls, update THREAT_MODEL.

## On-call basics

Health: `/v1/health`, queue depth (BullMQ UI or redis-cli), Sentry alerts, uptime checks. Escalation contacts live outside the repo (ops vault). Never paste secrets or user content into the incident channel.
