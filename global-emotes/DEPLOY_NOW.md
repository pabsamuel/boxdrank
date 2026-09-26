# DEPLOY NOW — owner click-path

Shortest path from "code is done" to "live on the internet". Everything an
agent could prepare is prepared; what remains needs your accounts.

**Domain already owned:** `atesensoftware.com` (Cloudflare, Free plan).
Target subdomains:

| Piece | URL                             |
| ----- | ------------------------------- |
| web   | `emotes.atesensoftware.com`     |
| api   | `api-emotes.atesensoftware.com` |
| CDN   | `cdn-emotes.atesensoftware.com` |

Secrets for step 2 were generated separately and handed over out-of-band —
never commit them. Regenerate any time with
`openssl rand -base64 36` (session) and `openssl rand -hex 32` (token key).

---

## 0 · Accounts to create (3 signups, all "Continue with GitHub")

| #   | Service                            | Why                                                  | Free tier enough?         |
| --- | ---------------------------------- | ---------------------------------------------------- | ------------------------- |
| 1   | [railway.com](https://railway.com) | api + worker + Postgres + Redis                      | trial credit, then ~$5/mo |
| 2   | [vercel.com](https://vercel.com)   | Next.js web                                          | yes (Hobby)               |
| 3   | [resend.com](https://resend.com)   | magic-link login email — **login breaks without it** | yes (3k/mo)               |

Cloudflare R2 uses the account you already have — no new signup.

---

## 1 · Cloudflare R2 buckets

`dash.cloudflare.com` → **R2** → enable (asks for a card, $0 on free tier) → create 3 buckets:

- `emote-originals` — private
- `emote-processed` — private, then **Settings → Public access → connect domain** `cdn-emotes.atesensoftware.com`
- `uploads-quarantine` — private, **lifecycle rule: delete after 7 days**

Then **Manage R2 API Tokens → Create** (Object Read & Write). Save:
`Access Key ID`, `Secret Access Key`, and the S3 endpoint
`https://<account-id>.r2.cloudflarestorage.com`.

## 2 · Railway — data + api + worker

1. **New Project → Deploy from GitHub repo** → `pabsamuel/boxdrank`.
2. **+ New → Database → Postgres**, then again **→ Redis**. (Railway injects
   `DATABASE_URL` / `REDIS_URL` — reference them, don't retype.)
3. On the repo service: **Settings → Build**
   - Root directory: `global-emotes`
   - Dockerfile path: `infrastructure/docker/Dockerfile.api`
   - Health check path: `/v1/health`
4. **Variables** — paste this block, filling the R2 values from step 1 and the
   two generated secrets:

```
NODE_ENV=production
BRAND_NAME=Global Emotes
PUBLIC_WEB_URL=https://emotes.atesensoftware.com
PUBLIC_API_URL=https://api-emotes.atesensoftware.com
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
SESSION_SECRET=<generated>
TOKEN_ENCRYPTION_KEY=<generated>
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY_ID=<r2 key id>
S3_SECRET_ACCESS_KEY=<r2 secret>
S3_BUCKET_ORIGINALS=emote-originals
S3_BUCKET_PROCESSED=emote-processed
S3_BUCKET_QUARANTINE=uploads-quarantine
ASSET_CDN_URL=https://cdn-emotes.atesensoftware.com
EMAIL_PROVIDER=resend
RESEND_API_KEY=<resend key>
EMAIL_FROM=no-reply@atesensoftware.com
LOG_LEVEL=info
API_PORT=3001
```

5. **Migrations — run once before traffic.** Railway shell on the api service:
   `pnpm db:migrate`
6. **Duplicate the service for the worker**: same repo, same variables,
   Dockerfile `infrastructure/docker/Dockerfile.worker`, no health check, no
   public domain.
7. api service → **Settings → Networking → Custom domain** →
   `api-emotes.atesensoftware.com` → copy the CNAME target.

## 3 · Vercel — web

**Add New → Project** → same repo →

- Root directory: `global-emotes/apps/web`
- Framework: Next.js (auto)
- Environment variables:
  ```
  BRAND_NAME=Global Emotes
  PUBLIC_API_URL=https://api-emotes.atesensoftware.com
  PUBLIC_WEB_URL=https://emotes.atesensoftware.com
  ```
- Deploy → then **Settings → Domains** → add `emotes.atesensoftware.com`.

## 4 · Resend — sending domain

`resend.com` → **Domains → Add** `atesensoftware.com` → it prints DKIM/SPF
records → add them in Cloudflare DNS → **Verify**. Then **API Keys → Create**
and put it in Railway as `RESEND_API_KEY`.

## 5 · Cloudflare DNS (one screen, 3 records)

`dash.cloudflare.com` → `atesensoftware.com` → **DNS**:

| Type  | Name         | Value                          | Proxy    |
| ----- | ------------ | ------------------------------ | -------- |
| CNAME | `emotes`     | `cname.vercel-dns.com`         | DNS only |
| CNAME | `api-emotes` | _(Railway's CNAME target)_     | DNS only |
| CNAME | `cdn-emotes` | _(R2 sets this automatically)_ | Proxied  |

Plus the Resend DKIM/SPF records from step 4.

## 6 · Smoke test (2 minutes)

1. `curl https://api-emotes.atesensoftware.com/v1/health` → `200`
2. Open `https://emotes.atesensoftware.com` → marketing page renders
3. Click login → enter your email → magic link arrives → you're in
4. Creator studio → create a pack → upload a PNG → it processes and the
   thumbnail appears from the CDN domain

If all four pass, it's live. Full regression: `docs/QA_TEST_PLAN.md`.

---

## Deliberately skipped for v1

- **Stripe** — billing not needed to use the product. Wire it when you charge:
  `OWNER_ACTIONS.md` + `docs/product/MONETIZATION.md`.
- **Twitch / Discord / Patreon** — entitlements run on the mock adapter and
  access codes until you register those apps. Real creators need Twitch at
  minimum: `docs/integrations/TWITCH.md`.
- **Apple Developer ($99/yr)** — only for the iPhone keyboard. Nothing above
  needs it; the iPhone web keyboard works today.
