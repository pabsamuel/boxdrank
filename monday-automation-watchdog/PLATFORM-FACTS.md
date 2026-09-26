# monday platform — what was read, not remembered

Read from `developer.monday.com` on **23 Sep 2026**, the day the environment's
network policy was changed to allow it. Everything here is quoted or paraphrased
from a page that was fetched, with the page named. Nothing is from memory.

That distinction is the point of this file. This project's one wrong guess about
a monday format — treating `created_at` as milliseconds when it is
100-nanosecond ticks — produced code that looked finished, passed its tests, and
returned `null` for every real row. Four of the items below were blocked for two
days rather than guessed at.

---

## The question that decided the architecture

**Can monday run a scheduled server-side job with no user present?**

**FACT: yes.** `apps/docs/schedule-cron-jobs-in-monday-code`

> The monday code scheduler lets you schedule cron jobs that automatically
> execute on a defined schedule (e.g., every week at 10 AM).

| | |
|---|---|
| Endpoint shape | a **POST** route prefixed `/mndy-cronjob/`, e.g. `/mndy-cronjob/my-endpoint` |
| Created with | `mapps scheduler:create -a APP_ID -s "0 * * * *" -e "my-endpoint" -n "My-scheduled-job" -d "…" -z us` |
| In the CLI you pass | just `my-endpoint`, not the prefix |
| Managed with | `scheduler:create` · `list` · `update` · `delete` · `run` |
| Limit | **5 jobs per region** per app (15 across US/EU/AU for multi-region) |
| Requires | monday apps CLI **4.7.0** |
| Not available in | the IL region |
| Only invoked on | a **live** version — a job on a draft version returns 404s |

This closes the question the GitHub Actions workflow existed to route around.
That workflow stays as the fallback, since `runCheck` takes storage and mail as
injected dependencies and does not care which host calls it.

**UNKNOWN:** whether a cron invocation carries any account context — a token, an
account id, a payload. The page does not say. It calls the route "a public
monday code endpoint", which suggests the app must identify the account itself.
See the open question at the bottom.

---

## Storage — two of them, for two different things

`apps/docs/monday-code-javascript-sdk` · `npm i @mondaycom/apps-sdk`

The SDK has six parts: storage, secure storage, environment variables manager,
secrets manager, logger, queue.

### Storage — for watchdog state

```js
import { Storage } from '@mondaycom/apps-sdk';
const storage = new Storage('<ACCESS_TOKEN>');
const { version, success, error } = await storage.set(key, value, { previousVersion, shared });
```

- Methods: `set`, `get`, `search`, `delete`
- **Key length 256 · 6MB per key · 12 requests/second per JWT**
- `ttl` in seconds, **maximum 30 days**
- `shared: false` (default) is backend-only; `true` is reachable from the frontend too
- The token must be an account access token from the OAuth flow — *"The
  sessionToken passed from the frontend will not work."*
- **"This method can be used in every backend app, not only those hosted on
  monday code"** — which is why the file-backed adapter stays a real
  alternative rather than a stopgap

Implemented in `src/server/monday-storage.js`, behind the same `get`/`set`
interface `runCheck` already took.

### Secure storage — for the credential

```js
import { SecureStorage } from '@mondaycom/apps-sdk';
const secureStorage = new SecureStorage();
```

- Methods: `set`, `get`, `delete`. **No token argument** — it is scoped to the app
- **7 requests/second · 1 write per second to the same key**
- Real secure storage when deployed to monday code; a local mock otherwise

This is the answer to "where does the account's access token live", which was
listed as an open problem and is now a named API.

### Secrets manager — for the mail credential

```js
import { SecretsManager } from '@mondaycom/apps-sdk';
```

- Methods: `get`, `getKeys`
- Values are set in **the monday code section of the Developer Center UI**, not
  in code — so `SMTP_URL` never enters the repository or a workflow file

---

## OAuth

`apps/docs/oauth`

| | |
|---|---|
| Authorize | `https://auth.monday.com/oauth2/authorize` |
| Token | `POST https://auth.monday.com/oauth2/token` |
| Authorization code valid for | **10 minutes** |
| Access token valid | **until the user uninstalls the app** |

Authorize parameters: `client_id` (required), `redirect_uri`, `scope`
(space-separated), `state`, `app_version_id`, `force_install_if_needed`.

### Scopes this app needs — four, all read-only

There are 21 scopes. This section said two until 26 Sep, when the `me` and
`account` reference pages were read:

| Scope | Why |
|---|---|
| `boards:read` | `activity_logs` is nested under `boards` |
| `users:read` | to tell people apart from automations |
| `me:read` | **FACT** (`api-reference/reference/me`): "Required scope: me:read". The token response carries no account id, so the app has to ask who installed it |
| `account:read` | **FACT** (`api-reference/reference/account`): "Required scope: account:read", for `me { account { id } }` |

Nothing that writes. The token response, **FACT** from `apps/docs/oauth`, is
`{"access_token", "token_type": "Bearer", "scope"}` — no account, no user, no
refresh token. The account id is therefore asked of monday with the new token,
and never taken from the browser: an id supplied by the request would let
anyone attach their token to someone else's account.

`notifications:write` — *"Send notifications on behalf of the user"* — is worth
noting as a **delivery channel that is not email**. Not adopted: it would widen
the scope request from read-only to something that can write, and an app asking
only to read is easier to install and easier to get through review. Recorded,
not chosen.

**UNKNOWN:** whether `activity_logs` needs a scope beyond `boards:read`. The
OAuth page says each endpoint's required scope is in the API reference; that
specific page has not been checked.

---

## The API endpoint — the guess was right

`api-reference/docs/authentication`

```
curl -X POST https://api.monday.com/v2 \
  -H "Authorization: xxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"query": "query { me { id name } }"}'
```

`Authorization` takes the **raw token, with no `Bearer` prefix**. That is exactly
what `http-client.js` sends. The guess held, and it was labelled a guess for two
days rather than quietly relied on.

---

## ~~There is no manifest file~~ — corrected 26 Sep 2026: there is one

The first reading got this wrong. `developer.monday.com/apps/docs/manifest`
returns 404 and no manifest page is in the docs navigation — both still true —
and from that this file concluded apps have no manifest.

**FACT:** monday's own sample app, `github.com/mondaycom/welcome-apps`,
`apps/quickstart-integrations-ts/app-manifest.yml`, has one:

```yaml
version: '1.0.0'
app:
  name: My first integration app
  features:
    - type: AppFeatureIntegration
      name: Hello Integration
      build:
        source: customUrl
        suffix: "/monday"
```

**UNKNOWN:** the feature `type` for a board view. It is not in that sample and no
reference page for the format was found, so this project does **not** write a
manifest: it would mean guessing a type name. Everything the manifest would say
is set in the Developer Center UI instead, which is documented.

A 404 is evidence that a page is missing, not that the thing it would describe
is missing. That is the lesson, and it is the same one the dead forum links
taught the same day.

---

## Automation status is in the API — probably only in preview

`api-reference/docs/list-automations` and `api-reference/docs/manage-automations`,
both "updated 20 days ago" as of 26 Sep 2026.

**FACT:**

- A Platform MCP tool, `list_automations`, returns each automation on a board
  "with id, title, is_active, and configuration", paginated with a cursor
- Its programmatic equivalent is **`board_automations`** on the monday API
- *"Some legacy automations may not appear in the results."*
- Its sibling, `manage_automations`, maps to `activate_live_workflow`,
  `deactivate_live_workflow` and `delete_live_workflow` **"on the monday.com dev
  (preview) API schema"**

**INFERENCE:** `board_automations` is probably preview-only as well. The page
does not say which schema it is on, but its sibling mutations are preview, and
both pages appeared at the same time.

**UNKNOWN:**

- The GraphQL shape of `board_automations` — no reference page was found at the
  obvious URLs, and it is not written here from its name
- Whether it exposes the *reason* for deactivation, the error shown on the
  board's Automations page, or only `is_active`
- Which scope it requires

This answers, in part, the oldest open question in this project: whether the API
exposes automation status at all. It does, as of this month. It matters because
it closes the one blind spot cadence detection has — automations that fire too
rarely to have a cadence. Whether to use it is a scope decision, recorded in
`BACKLOG.md`. A preview API is also exactly the kind of thing that changes under
you, which is the argument for waiting.

---

## Read on 26 Sep 2026 while building the server

**Hosting — FACT unless marked:**

- Node.js 18, 20 and 22 are supported runtimes (`apps/docs/monday-code-runtimes`)
- The port comes from `process.env.PORT` — from monday's own sample app, which
  does exactly that; the docs pages read did not state it
- The **Live URL exists only once a version has been promoted to live**; before
  that there is a per-version URL that changes with every version
  (`apps/docs/manage-monday-code-in-the-developer-center`). The server
  therefore boots in a setup mode without `WATCHDOG_BASE_URL`: the first deploy
  cannot have it
- Secrets are set in the Developer Center's monday code → Secrets tab, and
  "you can't retrieve secrets after creation"

**CLI — FACT (`apps/docs/command-line-interface-cli`):**

| | |
|---|---|
| Install | `npm install -g @mondaycom/apps-cli` |
| Authenticate | `mapps init -t <token>` |
| Deploy | `mapps code:push`, with `-s` to run a dependency security scan |
| Promote to live | `mapps app:promote -i <APP_VERSION_ID> -a <APP_ID>` |
| Env / secrets | `mapps code:env` / `mapps code:secret`, `-m set -k KEY -v VALUE` |

**Uninstall — FACT (`apps/docs/webhooks-1`):** lifecycle events go to one URL
set in the Developer Center's Webhooks tab. The `uninstall` body carries
`data.account_id`, and "each request has a JWT in the Authorization header …
signed with the **Client Secret**" — not the Signing Secret, which is what
signs integration requests (`apps/docs/authorization-header`). Two secrets for
two flows; mixing them up would reject every real uninstall. The algorithm is
not stated; HS256/384/512 are accepted and nothing else.

**Dependency audit:** `npm audit` reports 8 moderate findings, all one
advisory in `uuid` < 11.1.1 pulled in by `@mondaycom/apps-sdk` through Google
Cloud libraries. The advisory concerns `v3`/`v5`/`v6` called with a `buf`
argument; every caller in this tree uses `v4` only (checked by grep). Not
overridden, because forcing a major version into monday's own SDK is a larger
risk than an unreachable code path. Re-check at submission; `mapps code:push -s`
will run monday's own scan.

---

## OAuth 2.1 is coming; this app uses the legacy flow on purpose

`apps/docs/migrating-to-the-new-oauth-flow`, read 26 Sep 2026.

**FACT:** a per-version **New OAuth Flow** toggle in the Developer Center's OAuth
& Permissions tab switches an app to OAuth 2.1: access tokens **expire**, a
refresh token is issued, PKCE (`code_challenge`, S256) is **required** on the
authorize request, and the token exchange moves to
`POST https://auth.monday.com/oauth_ms/oauth/token` with a JSON body and
`grant_type`. The same page describes a legacy-token migration endpoint that "is
temporary and will be removed once the OAuth 2.1 migration is complete".

**INFERENCE:** the legacy flow will be retired. No date is given — **UNKNOWN**.

This app implements the **legacy** flow, which is what an app gets with the
toggle off, and the toggle was left off when the app was created (26 Sep, App
ID 12249756). **Do not turn it on** without the migration: the token URL,
request body, PKCE and token expiry all change, and the uninstall check — which
treats a token that still works as proof the app is still installed — depends on
legacy tokens never expiring. Migrating is a recorded future item, not a
blocker.

**Also verified live on 26 Sep:** `POST https://api.monday.com/v2` with an
invalid token answers **HTTP 401** with
`{"errors":[{"message":"Not authenticated","extensions":{"code":"NOT_AUTHENTICATED"}}]}`.
And `me` has `id: ID!` and `is_admin: Boolean` (`api-reference/reference/me`).

---

## First real deploy — 26 Sep 2026

**FACT**, from the CLI output and from requests made to the deployed app:

- `mapps code:push -s -a 12249756` refused: "The latest app version is live.
  Create a new draft version or use --force to override". The version had been
  promoted before any code was pushed to it. `-f` pushed to the live version.
- monday's dependency security scan: **0 findings**, both pushes.
- The deployment URL has the form `https://<id>-service-<account>-<id>.eu.monday.app`.
  The account is in the **EU** region.
- The server booted in setup mode exactly as designed: `/health` answered 503
  naming the five missing settings, `/view/` and `/view/main.js` answered 200.
- monday code sits behind **Cloudflare and Google** (`server: cloudflare`,
  `via: 1.1 google`). The edge **replaces the app's HSTS header** with
  `max-age=15552000; includeSubDomains` (180 days). `nosniff` and
  `no-referrer` pass through unchanged. The domain is monday's, so this is not
  the app's to change; if a reviewer's HSTS check is run against `*.monday.app`,
  the answer is that monday sets it.
- `mapps code:env` takes the app as `-i`; `code:push` and `scheduler:create`
  take it as `-a`. Without it the CLI asks, and on this account it offered a
  different app first — which is how the first push landed on the wrong app.

---

## Still open

1. **Does a cron invocation carry account context?** Still not stated. Built as
   if it does not: each account's token is stored in `SecureStorage` at install
   and the job iterates them. That design works either way.
2. **Does `activity_logs` need more than `boards:read`?** One page away.
3. ~~What does the app do at install time~~ — answered: the OAuth callback
   stores the token; the `uninstall` webhook deletes it.

None of these block the code that exists. All three are reading, not guessing,
and reading is now possible.
