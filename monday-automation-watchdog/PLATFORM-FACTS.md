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

### Scopes this app needs

There are 21 scopes. The ones that matter here:

| Scope | What the docs say | Why |
|---|---|---|
| `boards:read` | Read a user's board data | `activity_logs` is nested under `boards`, so this is the one |
| `users:read` | Read profile information of the account's users | to tell people apart from automations |

**Nothing else.** No `boards:write`, no `account:read`. The app only reads.

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

## There is no manifest file

`developer.monday.com/apps/docs/manifest` returns **404**, and no manifest page
appears anywhere in the apps documentation navigation.

Apps are configured in the **Developer Center UI** — you add app features
(`apps/docs/app-features`) there, and deploy with the `mapps` CLI. "Write the
app manifest" was listed as blocked work for two days; the work does not exist.
The premise was wrong, which is the sort of thing only reading finds.

A **board view** is one of the listed feature types under the Boards scope,
alongside board column extension, board menu features, column view and item view.

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

## Still open

1. **Does a cron invocation carry account context?** If not, the app stores each
   installing account's access token in `SecureStorage` at install time and the
   job iterates them. That is the obvious design and it is an **INFERENCE**, not
   something the page says.
2. **Does `activity_logs` need more than `boards:read`?** One page away.
3. **What does the app do at install time** to capture and store the token —
   the lifecycle hook, if there is one.

None of these block the code that exists. All three are reading, not guessing,
and reading is now possible.
