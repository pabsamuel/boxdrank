# Template Guard — answers for monday's privacy and security review

One answer per item on monday's checklist (`apps/docs/privacy-and-security`),
in the same order as Automation Watchdog's answers, each pointing at the code
that proves it. Copy the relevant section when the review board asks.

## Burp scan of all domains

The app serves from one domain, its monday code URL:
`bf61d-service-36993937-e27ad91f.eu.monday.app`. monday's own
`mapps code:push -s` scan reported **0 findings** on every push (28–30 Sep 2026).

## Secrets: storage, and whether any are in the repository

None are in the repository (`.gitignore` covers `.env`, `.mappsrc`). The five
secrets — `MONDAY_CLIENT_ID`, `MONDAY_CLIENT_SECRET`, `MONDAY_SIGNING_SECRET`,
`TOKEN_ENCRYPTION_KEY`, `DRIFT_CRON_SECRET` — are monday code secrets, read at
startup through the SDK (`src/server/config.ts`, `MondayCodeConfig`). A missing
one is reported by name only, never by value.

## The monday access token

- Obtained by OAuth (`src/server/oauth.ts`), then **encrypted with
  AES-256-GCM** (`TokenCipher`, `src/server/storage.ts`) before it is written
  to monday code **Secure Storage** (`src/server/monday-code-storage.ts`).
  Tampering fails authentication instead of decrypting to garbage.
- Sent only to monday's API endpoint (`src/api/client.ts`).

## User data stored, what, and why

| Data | Where | Why |
|---|---|---|
| Encrypted access token, account id and slug, installer's monday user id, install time | Secure Storage | Scheduled drift checks, and a recipient for alerts |
| Template board configuration: board/column/group/view ids, titles, types, settings; owners and subscribers as user ids | monday Storage, per account (JSON text) | To compare copies against the template |
| Plan and alert settings | Secure Storage | Feature gating and alert delivery |

**No item data**: no item names, column values, updates or files are requested
or stored. Enforced at the storage boundary by `assertNoItemData()` in every
storage implementation, before serialisation. The only personal data is the
installer's monday user id.

## Scopes

`boards:read`, `account:read`, `me:read` — `READ_ONLY_SCOPES` in
`src/server/oauth.ts`. All read-only; no write scope is requested
(`FEATURE_ONE_CLICK_REPAIR` off, ADR-025).

| Scope | Why |
|---|---|
| `boards:read` | Configuration of the template and the boards compared with it |
| `account:read` | Account id and slug, to key storage and link back to boards |
| `me:read` | Who installed the app, so drift alerts reach them |

## Logging and retention

`console` on monday code (captured by the platform). Logged: startup, install
and uninstall with the account id, counts of findings, and failures. Board and
item names are not logged. Retention is monday code's.

## Encryption at rest

Tokens: AES-256-GCM on top of Secure Storage. Everything else lives in monday
Storage / Secure Storage.

## Injection

No query language of our own: monday Storage is key-value, with keys built from
account and board ids. GraphQL queries to monday are constant strings with
values passed as variables (`src/api/queries.ts`).

## Input validation and authentication

- **Board view** (seamless auth): `sessionToken` verified with the Client
  Secret, HS256 pinned, `timingSafeEqual`, expiry enforced —
  `verifySessionToken`, `src/server/oauth.ts`.
- **OAuth**: state signed, bound to the browser by an `HttpOnly; Secure`
  cookie, expiring after ten minutes, cleared on use (ADR-024).
- **Sidekick tool / action block**: JWT verified with the Signing Secret, `exp`
  and `aud` checked, reads with the request's `shortLivedToken` —
  `src/server/sidekick.ts`.
- **Lifecycle and billing webhook**: verified with the Client Secret; the body
  must match the signed account; uninstall deletes only once monday confirms
  the token is dead; the plan is read from `app_subscription`, never from the
  body — `src/billing/webhook.ts` (ADR-037).
- **Scheduled job**: `/mndy-cronjob/*` is closed to the public by monday code
  (403 before the app); self-hosted it requires a shared secret.
- **Customer webhook targets** (alerts): https only; loopback, private ranges
  and the cloud metadata address refused — `assertSafeWebhookUrl`.
- HTTP hardening: CSP with `frame-ancestors` limited to monday, CORS limited to
  monday origins, rate limit on `/api`, 1 MB body cap, HSTS, `nosniff` —
  `src/server/security.ts`.

## Domain ownership

The app is served only from monday code's domain. The developer's domain is
`atesensoftware.com`; `https://atesensoftware.com/monday-app-association.json`
lists Template Guard's client id `76e86d0a8d1894a85116585c83403625` (live
since 30 Sep 2026; the site is Cloudflare Pages, built from
`pabsamuel/atesensoftware-site`, PR #7).

## Deleting data on uninstall

`uninstall` → `handleLifecycleWebhook` → `deleteAccount`: removes the account
from the sweep index, deletes its templates from Storage (while the token
still allows it), and its plan, alert settings and install from Secure
Storage (`src/server/monday-code-storage.ts`).

## Cookies

One cookie, during installation only: the OAuth state, `HttpOnly; Secure`, ten
minutes, single use. No tracking cookies.
