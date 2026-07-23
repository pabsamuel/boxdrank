# Security Policy

## Reporting a vulnerability

Email security@globalemotes.example (placeholder — replace with the real security contact before launch, see `OWNER_ACTIONS.md`). Please include reproduction steps and impact. We aim to acknowledge within 48 hours. Do not open public issues for vulnerabilities.

## Scope and principles

- **Keyboard privacy is absolute.** The Android IME and iOS keyboard extension contain no keystroke logging, no surrounding-text capture, and make no network calls in the text-input path. CI greps keyboard source for prohibited APIs (see `.github/workflows/ci.yml`).
- **Provider tokens** are encrypted at rest (AES-256-GCM envelope encryption, key from `TOKEN_ENCRYPTION_KEY`) and are never returned by any API or shown in the admin dashboard.
- **Webhooks** (Stripe, providers) are signature-verified with replay protection (timestamp tolerance + processed-event idempotency table).
- **Uploads** are validated by magic bytes (not extension), size/dimension/frame limits, metadata stripped, content-hashed, and quarantined until processing succeeds.
- **Sessions** use httpOnly, Secure, SameSite=Lax cookies with server-side session records that can be revoked.
- **Admin actions** require a recorded reason and are written to an append-only audit log.
- **Entitlements** are always computed server-side. No client claim unlocks premium or member-only content.

## Security engineering checklist (tracked)

CSRF protection, CSP + secure headers, SQL injection prevention (parameterized via Drizzle), SSRF protections on outbound fetches, rate limiting on auth/redeem/report endpoints, dependency and secret scanning in CI, least-privilege IAM in production.

Detailed docs: `docs/security/THREAT_MODEL.md`, `docs/security/PRIVACY_MODEL.md`, `docs/security/INCIDENT_RESPONSE.md`.

No formal compliance certification (SOC 2, ISO 27001) has been obtained; we do not claim any.
