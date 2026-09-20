# Deploying it, and submitting it

Everything here is runnable today. Nothing in it needs code that does not
exist. What it needs is a monday developer account and a host.

---

## Part 1 — Verify the `✱` claims first

Do this before deploying anything. It is the difference between shipping a
product and shipping a guess.

```bash
MONDAY_API_TOKEN=... npx tsx scripts/verify-live.ts \
  --board <a board you own> \
  --connect-board <the board a connect column should point at> \
  --automations
```

The script is read-only — no mutations, no item reads. It prints
VERIFIED / FAILED / SKIPPED per claim **with the observed shape next to it**,
so a failure tells you what to change rather than only that something is
wrong. It exits non-zero if anything failed, so it can gate a release.

**The one that matters:** `✱2`, which settings key holds linked board IDs.
Guessing it wrong does not throw — it reports every board as correctly wired,
which is the single worst failure this app can have. If it fails, the raw
settings printed underneath name the real key; add it to `BOARD_ID_KEYS` in
`src/diff/connect.ts`.

**A SKIPPED check is not a pass.** Point the script at a board that actually
has a connect column and some automations, or you have verified nothing.

---

## Part 2 — Deploy

```bash
docker build -t template-guard .
docker run -d --name template-guard \
  -p 8302:8302 \
  -v template-guard-data:/data \
  --env-file .env \
  template-guard
```

The image runs as `node`, not root, and the SQLite file lives on a mounted
volume — an image layer carrying customer install tokens is an image nobody
can safely push anywhere.

### Environment for production

| Variable | Value |
|---|---|
| `MONDAY_CLIENT_ID` / `MONDAY_CLIENT_SECRET` | From the developer console |
| `MONDAY_SIGNING_SECRET` | Signs OAuth state, verifies session tokens **and** subscription webhooks |
| `MONDAY_REDIRECT_URI` | Must match the console exactly |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32`. Rotating it without re-encrypting locks every account out — the scheduler reports exactly that, per account. |
| `DATABASE_FILE` | `/data/template-guard.db` |
| `ENFORCE_HTTPS` | `true` |
| `DRIFT_SCHEDULER_ENABLED` | `true` once you have a paying account |
| `MONDAY_PAID_PLAN_IDS` | Comma-separated plan ids from the console. **Leave empty and any subscription event grants Pro.** |
| `FEATURE_AUTOMATIONS_PREVIEW` | `false` |

### What the host must provide

- **TLS 1.2+ with HSTS.** The app sets the HSTS header; terminating TLS is the
  host's job. monday requires this.
- **`X-Forwarded-Proto`.** The app sets `trust proxy`, so without this header
  the HTTPS redirect silently does nothing and the rate limiter buckets every
  caller together as the proxy.
- **Edge rate limiting.** The in-process limiter (120 req/min/caller) protects
  the shared monday API quota. It is per-process and does not survive a
  restart; it is not a DDoS defence, and pretending otherwise would be the
  kind of quiet overstatement this codebase avoids.
- **Backups of `/data`.** It holds encrypted install tokens and template
  snapshots. Losing it means every customer reinstalls.

### Scaling, honestly

One process. `SqliteStorage` is single-writer, and the drift scheduler assumes
it is the only sweeper. Running two instances would have them sweep the same
accounts twice and double the API load — exactly what the scheduler is built
to avoid. Going multi-instance means Postgres behind the same `Storage`
interface plus a lock on the sweep. Neither is hard; neither is needed before
there are customers. (ADR-013.)

---

## Part 3 — Developer console

monday does not accept a manifest upload, so `monday-app-manifest.json` is the
reference the console is kept in sync with — and what a reviewer can diff
against.

**Features**

| Feature | URL |
|---|---|
| Board View | `https://YOUR-DOMAIN/` |
| Dashboard Widget (item-less) | `https://YOUR-DOMAIN/?surface=widget` |

**OAuth** — redirect URI `https://YOUR-DOMAIN/auth/callback`, scopes
`boards:read`, `boards:write`, `account:read`, `me:read`. No item, update or
file scopes. Not holding the permission is a stronger claim at review than
promising not to use it.

**Billing webhook** — `https://YOUR-DOMAIN/webhooks/subscription`. monday
verifies the URL with a challenge the endpoint echoes back. Every later event
must carry a signature that verifies against `MONDAY_SIGNING_SECRET`; an
unverifiable payload is rejected with 401 before anything is parsed out of it.
Once pricing exists, put the plan ids in `MONDAY_PAID_PLAN_IDS`.

---

## Part 4 — The submission checklist

Tick these honestly. An untested item is not a tick.

### Security review

- [x] TLS 1.2+ / HSTS — header set by the app, termination by the host
- [x] CSP with `frame-ancestors` limited to monday, `script-src 'self'`, no
      `unsafe-inline` for scripts
- [x] `nosniff`, `Referrer-Policy`, `Permissions-Policy`, no `X-Powered-By`
- [x] CORS restricted to monday origins, never a wildcard, lookalike hosts
      rejected (there is a test for `evil-monday.com`)
- [x] Rate limiting on `/api`, with `Retry-After`
- [x] Request body capped at 1mb, before authentication runs
- [x] Tokens encrypted at rest (AES-256-GCM; tampering fails authentication
      rather than decrypting to garbage)
- [x] Webhook signature verified with a pinned algorithm and `timingSafeEqual`
- [x] OAuth state signed, **bound to the browser by cookie**, expiring after
      ten minutes, cleared on use (ADR-024)
- [x] Container runs as non-root, secrets by environment, data on a volume
- [ ] **Burp scan run and findings remediated** — needs a deployed instance.
      This is gate item #3, and it is the last technical unknown.

### Data handling

- [x] Board IDs, column IDs and configuration only
- [x] Enforced at the storage boundary by `assertNoItemData()`, in both
      storage implementations, before serialisation
- [x] No item, update or file scopes requested
- [x] Stated plainly in the README and the listing
- [x] Everything deleted on uninstall — a real delete, in one transaction
      (ADR-019)
- [x] The one user-identifying value stored (the installing user's monday id)
      is named in the README and the listing, with its reason (ADR-021)
- [x] Customer-supplied webhook targets validated: https only, no loopback,
      private ranges or cloud metadata address (ADR-021)

### Product

- [x] Vibe components throughout
- [x] Board view + item-less dashboard widget
- [x] Empty states, loading states, and a visible degraded state when a read
      partly failed
- [x] Per-account pricing, not per-seat
- [x] No paid feature depends on the preview schema
      (`assertNoPaidPreviewDependency()`)

### The two that are not code

- [ ] **Defend the architecture unprompted.** `docs/05-architecture-walkthrough.md`
      is the answer key. Read it until the answers come without the file.
- [ ] **Demand evidence.** Ten admin conversations about column drift. Since
      the marketplace scan this is the load-bearing gate: the admin/audit
      category tops out at 951 installs while reporting apps reach 17.8K.
      (`docs/04-marketplace-scan.md`, ADR-012.)

---

## What the listing should say about data

Verbatim, because it shortens the security review and it is true:

> Template Guard stores board IDs, column IDs and board configuration. It never
> stores your item data — no item names, no column values, no files, no
> updates. It requests no item, update or file permissions, so it could not
> read them if it wanted to. Access tokens are encrypted at rest with
> AES-256-GCM, and everything we hold for your account is deleted when you
> uninstall. The one thing it keeps about a person is the monday user id of
> whoever installed it, so drift alerts have somewhere to go.

**Before deploying anywhere, read ADR-018.** The nearest app on the marketplace
runs its scheduled backend on `monday code` — monday's own infrastructure —
and says "never on third-party servers" in its listing. If that works for this
app, most of Part 2 above becomes someone else's problem and the Burp scan
shrinks to whatever monday's platform already satisfies.

---

## Part 5 — Deploying to monday code (the preferred target)

Read `docs/08-monday-code.md` and ADR-020 first. The short version: this runs
on monday's own infrastructure, which removes "third-party server" from the
security conversation, inherits SOC 2 / ISO 27001 / HIPAA / GDPR, puts data
residency in the customer's region automatically, and is free today.

The code is written and tested against the SDK's type definitions. **It has
never run on the platform.** Treat the first deploy as the test.

```bash
npm install -g @mondaycom/apps-cli
mapps init                       # authenticate

# Secrets — never in a file, never in the image
mapps code:secret -i <APP_ID> -m set -k MONDAY_CLIENT_SECRET   -v "..."
mapps code:secret -i <APP_ID> -m set -k MONDAY_SIGNING_SECRET  -v "..."
mapps code:secret -i <APP_ID> -m set -k TOKEN_ENCRYPTION_KEY   -v "$(openssl rand -base64 32)"
mapps code:secret -i <APP_ID> -m set -k DRIFT_CRON_SECRET      -v "$(openssl rand -hex 32)"

# Non-secret configuration
mapps code:env -i <APP_ID> -m set -k TEMPLATE_GUARD_PLATFORM     -v "monday-code"
mapps code:env -i <APP_ID> -m set -k MONDAY_CLIENT_ID            -v "..."
mapps code:env -i <APP_ID> -m set -k MONDAY_REDIRECT_URI         -v "https://<app-url>/auth/callback"
mapps code:env -i <APP_ID> -m set -k DRIFT_SCHEDULER_ENABLED     -v "true"
mapps code:env -i <APP_ID> -m set -k FEATURE_AUTOMATIONS_PREVIEW -v "false"

npm run deploy:monday:scan       # mapps code:push -s — deploy and security scan
npm run monday:report            # read the scan report
```

Then register the sweep. One job is enough; the platform allows five per
region, and the `il` region has no cron at all:

```bash
mapps scheduler:create -a <APP_ID> \
  -s "0 */6 * * *" -e "mndy-cronjob/drift" \
  -n "template-guard-drift" -d "Re-check linked boards against their templates."
```

Environment variable changes need a redeploy to take effect. Secrets do not.

### What changes on monday code

| | Self-hosted | monday code |
|---|---|---|
| Config | `.env` | `mapps code:env` / `code:secret`, read through the SDK |
| Install tokens | SQLite, encrypted by us | Secure Storage, **and** encrypted by us — two locks |
| Template snapshots | SQLite | The account's own `Storage` partition |
| Account enumeration | `SELECT DISTINCT` | An app-level index key we maintain (ADR-020) |
| Sweep trigger | In-process timer | The platform scheduler calling `/mndy-cronjob/drift`; the timer stays **off** |
| HTTPS | Your proxy | The platform |

### Watch these on the first sweep

Four things are still `✱` and none of them can be checked without a deployment
(`npm run verify:live` does not cover them — it tests the GraphQL API, not the
platform). Deploy to a **private** app first, run `mapps code:logs`, and watch:

1. A large board snapshot against the per-key size limit.
2. Whether `search('template:')` returns what this code expects.
3. Secure Storage's 7 requests/second limit during a multi-account sweep — the
   scheduler paces against the monday API, not against its own storage.
4. The container's request timeout versus sweep duration. The cron route
   answers 202 and sweeps in the background, which helps; it is not a proof.

If any of these bites, the fallback is unchanged and fully supported: Part 2
above, with `TEMPLATE_GUARD_PLATFORM=self-hosted`.
