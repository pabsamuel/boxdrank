# Deploying AirSync to production

Step-by-step from a working local app to a live, reviewable App Store app.
Follow in order. Anything in `UPPER_SNAKE` is a value you supply.

---

## 0. Prerequisites

- The app runs locally (`npm run dev`, installed on your dev store).
- Accounts: [Shopify Partners](https://partners.shopify.com),
  [Railway](https://railway.app), GitHub (this repo pushed to it).
- Shopify CLI installed locally: `npm install -g @shopify/cli@latest`.

> **Heads up:** this app lives in the `airsync/` subdirectory of the repo.
> Wherever Railway asks for a root directory, use `airsync`.

---

## 1. Create the Railway project

1. Railway dashboard → **New Project → Deploy from GitHub repo** → pick this
   repo.
2. In the new service: **Settings → Source → Root Directory** = `airsync`.
   Railway will detect the `Dockerfile` (via `railway.json`) automatically.
3. **Don't deploy yet** — add the database and env vars first (next steps).
   If it already tried and failed, that's fine.

## 2. Add PostgreSQL

1. In the project: **Create → Database → Add PostgreSQL**.
2. On your app service: **Variables → New Variable → Add Reference** →
   select the Postgres `DATABASE_URL`. (This wires the connection string in
   without copy-pasting secrets.)

## 3. Generate a public domain

1. App service → **Settings → Networking → Generate Domain**.
2. Note it down, e.g. `https://airsync-production.up.railway.app`.
   This is your `SHOPIFY_APP_URL`.

## 4. Set the environment variables

App service → **Variables**. Add:

| Variable | Value |
| --- | --- |
| `SHOPIFY_API_KEY` | Partner Dashboard → Apps → AirSync → Overview → Client ID |
| `SHOPIFY_API_SECRET` | Same page → Client secret |
| `SHOPIFY_APP_URL` | The Railway domain from step 3 (with `https://`) |
| `SCOPES` | `read_orders,read_all_orders,read_products` |
| `DATABASE_URL` | (reference added in step 2) |
| `ENCRYPTION_KEY` | Run `openssl rand -hex 32` locally and paste the result |
| `BILLING_TEST` | `false` (real charges; test stores still aren't charged) |

Tip: `npm run env -- show` prints the key/secret the CLI knows about.

**Never change `ENCRYPTION_KEY` later** — every merchant's saved Airtable
token would become undecryptable.

## 5. Deploy

1. Push your latest code to GitHub — Railway builds and deploys the
   Dockerfile automatically.
2. The container start runs `prisma db push`, which creates all tables in
   PostgreSQL on first boot.
3. Check **Deployments → View Logs**: you want `remix-serve` listening and
   no Prisma errors. Then open `https://YOUR_DOMAIN/` — you should see the
   AirSync landing page.

## 6. Point the Shopify app at production

1. Edit `shopify.app.toml` and add/update these lines (top level, under
   `client_id`):

   ```toml
   application_url = "https://YOUR_RAILWAY_DOMAIN"

   [auth]
   redirect_urls = ["https://YOUR_RAILWAY_DOMAIN/auth/callback"]
   ```

2. Run `shopify app deploy` from `airsync/`. This pushes the app config to
   Shopify: the URLs, the scopes, **and all webhook subscriptions** from
   `shopify.app.toml` (order/product sync, uninstall, and the GDPR
   compliance topics) — they're app-level, so they now point at your
   production URL automatically. This is also what "switches webhooks to
   prod": webhooks follow the deployed `application_url`.
3. Sanity check in Partner Dashboard → your app → **Configuration**: App URL
   and redirect URL show the Railway domain; **API access** lists the three
   scopes; **Compliance webhooks** show `/webhooks/compliance`.

> Dev tip: when you later run `shopify app dev` again, the CLI will offer to
> update URLs to the tunnel — say **no** to keep production URLs, or keep a
> separate dev app config (`shopify app config link` → new app called
> "AirSync Dev", saved as `shopify.app.dev.toml`, switch with
> `npm run config:use -- dev`). A separate dev app is the sane setup.

## 7. Install on a real store & smoke-test

1. Partner Dashboard → your app → **Test your app** → pick your dev store
   (it now runs against production).
2. Walk the whole flow: connect Airtable token → pick base → Create tables
   → toggles → Run initial sync.
3. Create a test order and a test product in the store; confirm rows appear
   in Airtable within a few seconds and that editing/cancelling updates the
   same row (no duplicates).
4. Test billing: click **Upgrade to Pro** — you should land on Shopify's
   subscription approval screen showing $14.99/month with a 7-day trial.
   (On a development store this is automatically a test charge.)

---

## 8. Submitting for App Store review

In the Partner Dashboard → your app → **Distribution** → choose **Public
distribution**, then create the listing. Checklist:

**Technical requirements (already handled by this codebase — verify, don't rebuild):**
- [x] Embedded app using App Bridge + Polaris, loads inside the admin
- [x] OAuth via the Remix template (immediate redirect to install)
- [x] Webhook HMAC verification (`authenticate.webhook`)
- [x] Mandatory compliance webhooks (`customers/data_request`,
      `customers/redact`, `shop/redact`) — registered in `shopify.app.toml`
- [x] Billing through Shopify's Billing API (no external checkout)
- [x] App works end-to-end on a clean install (test on a fresh dev store!)

**Things only you can do:**
- [ ] **App listing content**: app name ("AirSync — Airtable Order & Product
      Sync"), 100-character tagline, description (what syncs, how fast,
      what's in free vs Pro), app icon (1200×1200 px), 3+ desktop
      screenshots (1600×900 px) of the settings page inside the admin.
- [ ] **Pricing section**: Free plan (50 orders/month) and Pro
      ($14.99/month, 7-day trial) — must match the code exactly.
- [ ] **Support**: support email + (optionally) support URL.
- [ ] **Privacy policy URL** — required. It must mention: what you store
      (encrypted Airtable token, Shopify↔Airtable record ID mappings, sync
      settings), that order/customer data is written to the merchant's own
      Airtable base, and your data deletion behavior (everything deleted on
      uninstall / `shop/redact`).
- [ ] **Protected customer data access** (app → API access → Protected
      customer data): request access, level "Protected customer data"
      (name/email needed for the Customer name/email columns). Fill in the
      data-use questionnaire honestly: purpose = syncing order data to the
      merchant's Airtable; storage = merchant's own Airtable base only.
- [ ] **`read_all_orders` approval**: same API access page — request it,
      explaining the app backfills 90 days of order history on first sync.
      (Until approved, installs sync only the last 60 days; the app handles
      that gracefully.)
- [ ] **Review instructions**: give the review team a test Airtable token
      (create a throwaway Airtable account + PAT with the 4 scopes) and
      1-2-3 steps: connect token → create tables → run initial sync.
- [ ] Run the automated checks: Partner Dashboard → Distribution → "Run" on
      the pre-submission checks, fix anything red.
- [ ] Submit. First review typically takes a few business days; expect at
      least one round of feedback.

---

## 9. Day-2 operations

- **Logs**: Railway → service → Deployments → View Logs. Every webhook
  logs one line; sync failures also land in the `SyncError` table and on
  the merchant-facing status page.
- **DB console**: Railway Postgres → Data tab (or `railway connect`).
- **Schema changes**: edit BOTH `prisma/schema.prisma` and
  `prisma/schema.production.prisma`, run `npx prisma migrate dev` locally
  for SQLite, push — production applies the change on next boot via
  `prisma db push`.
- **Scaling note**: the Airtable throttle and backfill run in-process, so
  keep the service at **1 replica**. One container comfortably handles the
  webhook volume of hundreds of stores; revisit with a proper job queue
  (e.g. BullMQ + Redis) only if you outgrow that.
