# PRIVACY MODEL

## Data inventory

| Data                                          | Where                         | Retention                                                                    |
| --------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------- |
| Email, display name                           | users/user_emails             | until account deletion (30-day grace, then purge)                            |
| Provider account ids + encrypted OAuth tokens | provider_connections/tokens   | until disconnect/deletion; tokens deleted immediately on disconnect          |
| Entitlement history + evidence                | entitlements/evidence         | retained (audit); anonymized on account deletion (user id tombstoned)        |
| Usage events                                  | privacy_safe_usage_events     | allowlisted props only; 13-month rolling window (cleanup job — configurable) |
| Uploaded emotes                               | S3 + emote tables             | creator-controlled; takedown removes from distribution                       |
| Typed keyboard input                          | **nowhere — never collected** | n/a (CI-enforced)                                                            |

## Enforcement, not promises

- Analytics ingestion is a **strict allowlist** of event names and property keys (`packages/analytics`, tested: unknown names/props rejected at the API).
- Keyboard source trees are CI-grepped for input-capture APIs.
- pino redaction strips tokens/cookies/secrets from logs.
- Fans' messages/recipients never exist server-side, so creator analytics cannot expose them (spec §12).

## User rights

- Export: `data_export_requests` + worker job produces a JSON archive to a signed URL (route + job wired; archive assembly listed in QA plan).
- Deletion: `account_deletion_requests` with a scheduled grace window; cascading FK deletes + evidence anonymization; provider tokens revoked upstream best-effort.
- Consent: `terms_versions` + `user_consents` record acceptance per version.
