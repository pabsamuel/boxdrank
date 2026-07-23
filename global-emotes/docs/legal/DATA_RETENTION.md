# Data Retention Policy — DRAFT

> **DRAFT — requires qualified legal review.** Values are configuration defaults; see PRIVACY_MODEL.md for the enforced inventory.

| Data                      | Retention                                         | Mechanism                  |
| ------------------------- | ------------------------------------------------- | -------------------------- |
| Auth tokens (magic links) | 15 min TTL; purged after 24h                      | cleanup job                |
| Sessions                  | 30 days or revocation                             | expiry column              |
| Upload quarantine objects | 7 days                                            | bucket lifecycle           |
| Usage events              | 13 months                                         | scheduled cleanup (config) |
| Deleted accounts          | 30-day grace, then purge + evidence anonymization | deletion worker            |
| Entitlement evidence      | retained (audit), anonymized on deletion          | tombstoning                |
| Backups                   | 30 days                                           | provider setting           |
| Audit/admin logs          | 24 months                                         | scheduled cleanup          |

Other drafts: `COOKIE_NOTICE.md` (strictly-necessary session cookie + no third-party trackers), `COMMUNITY_GUIDELINES.md` (mirror of AUP in friendly language), `MARKETPLACE_TERMS.md` (placeholder — must be completed before the `marketplace` flag ships), `SUBPROCESSORS.md` (template: hosting, storage/CDN, email, payments, monitoring — fill with chosen vendors).
