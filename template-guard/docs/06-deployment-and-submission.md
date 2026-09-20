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
> uninstall.

**Before deploying anywhere, read ADR-018.** The nearest app on the marketplace
runs its scheduled backend on `monday code` — monday's own infrastructure —
and says "never on third-party servers" in its listing. If that works for this
app, most of Part 2 above becomes someone else's problem and the Burp scan
shrinks to whatever monday's platform already satisfies.
