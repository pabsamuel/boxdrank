# Automation Watchdog — answers for monday's privacy and security review

One answer per item on monday's checklist (`apps/docs/privacy-and-security`,
read 27 Sep 2026), in its order, each with the code that proves it — named by
file and function, so the references survive edits. Items still waiting on the
owner are marked **OPEN**.

## Burp scan of all domains

monday runs it during review. The only domain the app serves from is its
monday code URL, `live1-service-36993937-ca48573e.eu.monday.app`.

monday's own `mapps code:push -s` scan (Opengrep OSS):
- The early pushes reported 0 findings.
- From 27 Sep it reported **0 errors and 1 warning**. The warning was in
  `scripts/asset-kit.js`, line 55: "Unencrypted request over HTTP detected"
  (rule `react-insecure-request`). That line fetches the local demo server at
  `http://127.0.0.1` while rendering the listing images on the owner's
  machine.
- The server never loads that script. Since 28 Sep it and the other two
  image scripts are left out of the upload (`.mappsignore`), and
  `check:deploy` checks that they stay out.

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
- The OAuth callback refuses any state that does not match the single-use
  `HttpOnly; Secure; SameSite=Lax` cookie set by `/oauth/start` —
  `src/server/app-server.js`, `stateCookie` and `finishInstall`. A callback
  arriving with no cookie of ours was started by monday's own installation
  link (Share tab, marketplace) and is accepted whatever state monday adds; this is safe because nothing is bound to
  the browser — the token, account and recipient all come from monday's answer
  for the code, so a forged callback can only complete the forger's own
  install. Tested both ways in `test/app-server.test.js`.
- Email addresses and subjects are rejected if they contain a line break
  (header injection) — `src/server/smtp-mailer.js`, `assertAddress`.
- Board and automation names are escaped for HTML in emails
  (`src/core/email.js`, `escapeHtml`) and inserted as text, never HTML, in the
  board view (`src/app/main.js`, `el`).
- Malformed request paths are refused rather than parsed —
  `parseRequestUrl` in `src/server/app-server.js`.

## Domain ownership

The app itself is served only from monday code's own domain. The owner's domain
is `atesensoftware.com` (registered at Namecheap). The support email is
`support@atesensoftware.com`, and
`https://atesensoftware.com/monday-app-association.json` lists the client id —
built by `atesensoftware-site/build.mjs`. Live since 27 Sep 2026, served over
HTTPS with the correct client id.

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
for the board view; **the short-lived token in a signed JWT** for the Sidekick
tool's action block.

- *Is the JWT signed with the app's signing secret?* Yes. The Sidekick tool's
  route verifies it with the signing secret (`MONDAY_SIGNING_SECRET`, a monday
  code secret), requires an expiry, and checks `aud`; a token signed with the
  client secret is refused (tested).

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

## HTTPS, HSTS and TLS

SSL Labs, run 27 Sep 2026 (not published to its boards):

| Domain | Grade | HSTS | Protocols |
|---|---|---|---|
| `live1-service-36993937-ca48573e.eu.monday.app` (all four endpoints) | **A+** | present, 15,552,000 s (180 days) | TLS 1.2, TLS 1.3 |
| `atesensoftware.com` | **A+** | present, 31,536,000 s (1 year) | TLS 1.2, TLS 1.3 |
| `atesensoftware.com` again, 28 Sep 2026, after the move from Netlify to Cloudflare (all four Cloudflare endpoints, IPv4 and IPv6) | **A+** | present, 31,536,000 s, now with `includeSubDomains` | TLS 1.2, TLS 1.3 |

Links to give monday:
`https://www.ssllabs.com/ssltest/analyze.html?d=live1-service-36993937-ca48573e.eu.monday.app&hideResults=on`
and `https://www.ssllabs.com/ssltest/analyze.html?d=atesensoftware.com&hideResults=on`.

The app server sends a one-year HSTS header (`src/server/app-server.js`,
`BASE_HEADERS`); monday code's edge replaces it with 180 days, as
`PLATFORM-FACTS.md` recorded and SSL Labs confirms. Outgoing SMTP requires TLS
1.2 or later — `src/server/smtp-mailer.js`, the `tls.minVersion` settings.

## Malware check

Palo Alto Networks URL filtering (`urlfiltering.paloaltonetworks.com/query/`),
28 Sep 2026:

| Domain | Category | Risk |
|---|---|---|
| `live1-service-36993937-ca48573e.eu.monday.app` | Business-and-Economy | Low-Risk |
| `atesensoftware.com` | Computer-and-Internet-Info; Newly-Registered-Domain | Low-Risk |

## Third-party domains

| Domain | Side | Why |
|---|---|---|
| `api.monday.com` | backend and board view | monday's API |
| `auth.monday.com` | backend | OAuth |
| `smtp.gmail.com` | backend | Sending alert emails |
| `atesensoftware.com` | website only | The owner's site: support address, privacy policy, terms. The app never calls it |

The board view loads nothing from any other host. All three are named in the
privacy policy.

## Authenticate and authorise every request

| Route | Protection |
|---|---|
| `GET /health` | Public by design; returns `ok` and two single words, no data |
| `GET /oauth/start` | Public; starts OAuth with a fresh single-use state and `force_install_if_needed` |
| `GET /oauth/callback` | A state, if present, must match the `HttpOnly` cookie; code exchanged with the client secret; account and recipient taken from monday's answer for that code |
| `POST /mndy-cronjob/check` | Reached only by monday code's scheduler — requests from outside get 403 at monday's edge (verified 26 Sep) — and a second run inside 12 hours does nothing |
| `POST /monday/lifecycle` | JWT signed with the client secret |
| `POST /monday/sidekick/check` | The Sidekick tool's action block. JWT signed with the **signing secret**, expiry required, `aud` must be this path on this app's monday code service; reads with the request's short-lived token only, stores nothing, logs counts only — `sidekickTool`, `sidekickAudience` |
| `GET /api/status` | Session token JWT signed with the client secret, with an expiry; returns only that account's data |
| `GET /view/*` | Static files, exact paths only |

Routing: `src/server/app-server.js`, the returned `handle` function. The
screenshot monday asks for is `listing/auth-code.png`: `verifyJwt`, and the
first lines of `status` and `lifecycle`, cut from the source by
`scripts/make-assets.js` so it cannot drift from the code.
