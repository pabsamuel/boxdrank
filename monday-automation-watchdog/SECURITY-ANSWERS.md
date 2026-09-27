# Automation Watchdog — answers for monday's privacy and security review

One answer per item on monday's checklist (`apps/docs/privacy-and-security`,
read 27 Sep 2026), in its order, each with the code that proves it — named by
file and function, so the references survive edits. Items still waiting on the
owner are marked **OPEN**.

## Burp scan of all domains

monday runs it during review. The only domain the app serves from is its monday
code URL, `live1-service-36993937-ca48573e.eu.monday.app`. Every `mapps
code:push -s` security scan so far has reported 0 findings (`PLATFORM-FACTS.md`).

## How secrets are stored, and whether any are in the repository

None are in the repository. The four secrets (`MONDAY_CLIENT_ID`,
`MONDAY_CLIENT_SECRET`, `SMTP_URL`, `WATCHDOG_FROM`) are entered in the Developer
Center as monday code secrets and read at startup with the SDK's
`SecretsManager` — `scripts/serve-monday.js`, `secret()`. They are never
printed; a missing one is reported by name only. Every
error that could carry one is scrubbed before it is logged or returned
(`src/server/redact.js`, used throughout `src/server/app-server.js`).

## How the monday access token is stored, and the controls around it

- Stored in monday code **secure storage** (`SecureStorage` from
  `@mondaycom/apps-sdk`), keyed by the numeric account id —
  `src/server/app-server.js`, `finishInstall`. The algorithm monday uses is not published in
  the SDK; the checklist names monday secure storage as the place for this data.
- The account id comes from monday's answer to `me { account { id } }` asked
  with the new token (`identify`), never from the request, so a token cannot be
  attached to another account.
- A reinstall can replace a stored token only for the same installer or an
  admin — `src/server/app-server.js`, `finishInstall` (`sameInstaller`).
- The token is only ever sent to `https://*.monday.com`; any other endpoint is
  refused before the request is made, and redirects are refused —
  `src/server/http-client.js`, `assertSafeEndpoint` and `redirect: 'error'`.
- Every response is scrubbed of the token before it is parsed, so it cannot
  leak back through an error message — `src/server/http-client.js`.

## User data stored, what, and why

| Data | Where | Why |
|---|---|---|
| Access token, installer's email address, installer's user id, install time | monday code secure storage | To run the daily check and email its result |
| Per automation: board id, performer id, event type, timestamps | monday storage, per account | To remember what was already reported |
| Recent check log: counts, times, a short error summary | monday storage, per account | To show in the board view whether checks run |

The email address is the only PII and is in secure storage. Item names, column
values, updates and files are never requested: the activity query omits the
`data` field — `src/app/monday-source.js` (`ACTIVITY_QUERY`, pinned by a test in
`test/monday-source.test.js`).

## Scopes

`boards:read`, `users:read`, `me:read`, `account:read` —
`src/server/app-server.js`, `SCOPES`. All read-only.

| Scope | Why it is needed |
|---|---|
| `boards:read` | Board names and each board's activity log, which is what the app analyses |
| `users:read` | The account's users, to tell actions by people from actions by automations |
| `me:read` | Who installed the app, so alerts go to them |
| `account:read` | Which account the token belongs to; the OAuth token response carries no account id |

## Logging and retention

The monday logger is used — `new Logger('automation-watchdog')` in
`scripts/serve-monday.js`. Logged: install and uninstall with the account id,
the mail provider's startup check as one word, and check failures with their
error text scrubbed of tokens and secrets. Retention is monday code's; the docs
do not state a period.

## Encryption at rest

Not applicable: the app uses monday storage and monday secure storage only,
which the checklist says may skip this item.

## Injection

There is no database query language. monday storage is key-value; every key is
built from a numeric account id that has been validated as `^\d+$`
(`src/server/app-server.js`, `status` and `identify`). GraphQL queries to monday
are constant strings with values passed as variables
(`src/app/monday-source.js`, `query(monday, graphql, variables)`).

## Input validation

- JWTs (session tokens and lifecycle webhooks) are verified against the client
  secret, HS256/384/512 only, with the expiry enforced —
  `src/server/app-server.js`, `verifyJwt`; session tokens must carry an expiry
  (`status`, `requireExp: true`).
- The OAuth callback requires a single-use state that matches an `HttpOnly;
  Secure; SameSite=Lax` cookie — `src/server/app-server.js`, `stateCookie`.
- Email addresses and subjects are rejected if they contain a line break
  (header injection) — `src/server/smtp-mailer.js`, `assertAddress`.
- Board and automation names are escaped for HTML in emails
  (`src/core/email.js`, `escapeHtml`) and inserted as text, never HTML, in the
  board view (`src/app/main.js`, `el`).
- Malformed request paths are refused rather than parsed —
  `parseRequestUrl` in `src/server/app-server.js`.

## Domain ownership — **OPEN**

The app itself is served only from monday code's own domain. monday also asks
for a support email on the owner's domain and a
`https://<domain>/monday-app-association.json` file containing the client id.
Both wait on the owner buying a domain.

## Deleting data on uninstall

The uninstall webhook is verified against the client secret, then deletes the
account's token and email address from secure storage and removes the account
from the list the daily check walks — `src/server/app-server.js`,
`lifecycle`. It deletes only after confirming with monday that the stored
token is dead (`tokenState`), so a forged or replayed event cannot delete a live
install. Per-account monday storage (ids and timestamps only) cannot be deleted
after uninstall because monday revokes the token that would be needed.

## Cookies

One cookie, set during installation only: `HttpOnly; Secure; SameSite=Lax;
Path=/oauth`, 10 minutes, single use — `src/server/app-server.js`,
`stateCookie`. No
tracking cookies.

## Authentication flow

**OAuth**, for the scheduled check; **seamless authentication through the SDK**
for the board view.

- *Why OAuth rather than seamless authentication?* The daily check runs with no
  user present. Seamless authentication only exists while someone has the view
  open, so the check needs a stored token.
- *Malicious redirects?* No. The app redirects only to the fixed
  `https://auth.monday.com/oauth2/authorize`. After a completed install it
  shows a confirmation and returns the user to `https://<slug>.monday.com/`,
  where the slug comes from monday's API and must be a single DNS label, or
  else to `https://monday.com/` — `accountUrl`. Nothing in the request can
  choose the destination.
- *Users with several accounts?* Each install is keyed by the account id monday
  reports for that token, so the same email in two accounts is two separate
  installs.
- *Backend:* hosted on monday code, at the Live URL above. *Frontend:* the board
  view is served by the same monday code server under `/view/`, built with
  esbuild from plain JavaScript; no framework.

## HTTPS, HSTS and TLS — **OPEN: SSL Labs link**

The certificate is monday code's. The server sends `Strict-Transport-Security:
max-age=31536000; includeSubDomains` (`src/server/app-server.js`,
`BASE_HEADERS`); monday's
edge replaces it with a 180-day value (`PLATFORM-FACTS.md`), which still
enables HSTS. Outgoing SMTP requires TLS 1.2 or later —
`src/server/smtp-mailer.js`, the `tls.minVersion` settings. The SSL Labs report link is still to be run
and pasted here.

## Malware check — **OPEN**

Palo Alto URL filtering result for the Live URL is still to be run.

## Third-party domains

| Domain | Side | Why |
|---|---|---|
| `api.monday.com` | backend and board view | monday's API |
| `auth.monday.com` | backend | OAuth |
| `smtp.gmail.com` | backend | Sending alert emails |

The board view loads nothing from any other host. All three are named in the
privacy policy.

## Authenticate and authorise every request

| Route | Protection |
|---|---|
| `GET /health` | Public by design; returns `ok` and two single words, no data |
| `GET /oauth/start` | Public; starts OAuth with a fresh single-use state |
| `GET /oauth/callback` | State must match the `HttpOnly` cookie; code exchanged with the client secret |
| `POST /mndy-cronjob/check` | Reached only by monday code's scheduler — requests from outside get 403 at monday's edge (verified 26 Sep) — and a second run inside 12 hours does nothing |
| `POST /monday/lifecycle` | JWT signed with the client secret |
| `GET /api/status` | Session token JWT signed with the client secret, with an expiry; returns only that account's data |
| `GET /view/*` | Static files, exact paths only |

Routing: `src/server/app-server.js`, the returned `handle` function. The
screenshot monday asks for is `listing/auth-code.png`: `verifyJwt`, and the
first lines of `status` and `lifecycle`, cut from the source by
`scripts/make-assets.js` so it cannot drift from the code.
