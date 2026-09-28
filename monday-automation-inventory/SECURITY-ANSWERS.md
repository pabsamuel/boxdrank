# Automation Inventory — answers for monday's privacy and security review

One answer per item on monday's checklist (`apps/docs/privacy-and-security`,
read 27 Sep 2026 for Watchdog), in its order, each with the code that proves
it, named by file and function. Items that can only be answered after the
first deploy are marked **PENDING**.

## Burp scan of all domains

monday runs it during review. The app serves only from its monday code URL:
**PENDING**, the Live URL after the first promotion.

monday's `mapps code:push -s` scan: **PENDING**. Scripts that run only on the
owner's machine (`scripts/make-assets.js` and the listing scripts) are left out
of the upload (`.mappsignore`, checked by `npm run check:deploy`). That is
because Watchdog's only scan warning was in such a script.

## How secrets are stored, and whether any are in the repository

- None are in the repository.
- The app has one secret, `MONDAY_SIGNING_SECRET`. It is entered in the
  Developer Center as a monday code secret and read at startup with the SDK's
  `SecretsManager` (`scripts/serve-monday.js`, `secret()`).
- It is never printed; a missing one is reported by name only.
- Errors that could carry it, or the per-request token, are scrubbed before
  they are logged (`src/server/redact.js`, used in
  `src/server/app-server.js`).

## How the monday access token is stored

- **No token is stored.** There is no OAuth install flow.
- The page reads monday in the browser with seamless authentication
  (`monday.api`, `src/app/monday-source.js`).
- The Sidekick tool uses the `shortLivedToken` in monday's signed request. It
  lives only for that request (`src/server/app-server.js`, `sidekickTool`).
- That token is only ever sent to `https://*.monday.com`. Any other endpoint is
  refused before the request is made, and redirects are refused
  (`src/server/http-client.js`, `assertSafeEndpoint`, `redirect: 'error'`).
- Every response is scrubbed of the token before it is parsed.

## User data stored, what, and why

**None.**
- No database, no monday storage, no secure storage.
- The browser keeps one `localStorage` key, `inventory:welcomed:v1`, meaning
  "the welcome page was seen" (`src/app/main.js`).
- What is *read*, and why, is in `PRIVACY_POLICY.md`:
  - board ids, names and URLs;
  - automation names, descriptions, states, warnings and dates;
  - for boards with older automations only: column titles, status labels and
    group names.
- No item data is requested. The queries are constant strings in
  `src/app/monday-source.js`, and a test fails if the automations query asks
  for fields the app does not use (`test/inventory.test.js`).

## Scopes

| Scope | Why it is needed |
|---|---|
| `boards:read` | Boards, their automations (`board_automations`), and for older automations the board's column, label and group names |

**PENDING:** confirm on the first live test that `board_automations` works
with this scope alone.

## Logging and retention

- The monday logger is used: `new Logger('automation-inventory')` in
  `scripts/serve-monday.js`.
- Logged:
  - for each Sidekick request, the account id and three counts (matches,
    total, boards read);
  - request failures, scrubbed of the token and the signing secret
    (`src/server/app-server.js`, `sidekickTool` and `handle`).
- Board and automation names are never logged (tested:
  `test/app-server.test.js`, "names stay out of the log").
- Retention is monday code's.

## Encryption at rest

Not applicable: nothing is stored.

## Injection

There is no database. GraphQL queries to monday are constant strings with
values passed as variables (`src/app/monday-source.js`, `query()`).

## Input validation

- **Sidekick requests:**
  - The JWT must be signed with the **signing secret**. HS256/384/512 only;
    `none` and public-key algorithms are refused.
  - An expiry is required.
  - `aud` must be this route on this app's monday code service
    (`src/server/app-server.js`, `verifyJwt`, `sidekickAudience`).
  - A token signed with any other secret is refused (tested).
- **Inputs:** the Sidekick inputs are cut to 200 characters. The body is
  limited to 64 KB, and anything larger gets a 413.
- **Names from monday** are inserted as text, never HTML (`src/app/main.js`,
  `el`). In the Sidekick answer they are flattened to one line, so they cannot
  add lines (`src/core/sanitize.js`, tested).
- **Links:** board links are opened only if they are `https` on `monday.com`
  (`src/app/monday-source.js`, `safeBoardUrl`, tested against `javascript:`,
  other hosts and look-alikes).
- **Paths:** malformed request paths are refused rather than parsed
  (`parseRequestUrl`).

## Domain ownership

- The app serves only from monday code's own domain.
- The owner's domain is `atesensoftware.com`.
- `https://atesensoftware.com/monday-app-association.json` must list this
  app's client id: **PENDING**, once the app exists.

## Deleting data on uninstall

Nothing is stored, so there is nothing to delete. The app has no lifecycle
webhook.

## Cookies

None.

## Authentication flow

**Seamless authentication through the SDK** for the page. **The short-lived
token in a signed JWT** for the Sidekick tool's action block.
- *Is the JWT signed with the app's signing secret?* Yes, see Input
  validation.
- *Why no OAuth?* Nothing runs without a user present, so no stored token is
  needed.
- *Malicious redirects?* The server redirects nowhere. The page opens only
  monday.com board links.
- *Backend:* monday code. *Frontend:* the page is served by the same server
  under `/view/`, built with esbuild from plain JavaScript, with no framework.

## HTTPS, HSTS and TLS

- The server sends a one-year HSTS header (`src/server/app-server.js`,
  `BASE_HEADERS`). On Watchdog, monday code's edge replaced it with 180 days.
- **PENDING:** SSL Labs on the Live URL, expected A+ as Watchdog's was.
- `atesensoftware.com` on Cloudflare, SSL Labs, 28 Sep 2026:
  - **A+** on all four endpoints (two IPv4, two IPv6);
  - HSTS `max-age=31536000; includeSubDomains`;
  - TLS 1.2 and 1.3.

## Malware check

**PENDING:** Palo Alto URL filtering on the Live URL. Watchdog's monday code
URL was "Low-Risk".

## Third-party domains

| Domain | Side | Why |
|---|---|---|
| `api.monday.com` | page and server | monday's API |
| `atesensoftware.com` | website only | Support address, privacy policy, terms. The app never calls it |

## Authenticate and authorise every request

| Route | Protection |
|---|---|
| `GET /health` | Public by design; returns `ok` and two single words, no data |
| `POST /monday/sidekick/find` | JWT signed with the signing secret, expiry required, `aud` checked; reads with the request's short-lived token only; stores nothing; logs counts only |
| `GET /view/`, `/view/main.js`, `/view/how-to.html`, `/view/assets/*.png`, `/fixtures/demo-automations.json` | Static files, by exact path from an allowlist (`scripts/serve-monday.js`, `loadView`). The demo data is invented |

Routing: `src/server/app-server.js`, the returned `handle` function. Every
route has tests in `test/app-server.test.js`.

**PENDING:** the screenshot of the authentication code monday asks for. Cut
`verifyJwt` and the first lines of `sidekickTool` from the source, as
Watchdog's `scripts/make-assets.js` did.
