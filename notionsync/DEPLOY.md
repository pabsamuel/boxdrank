# Deploying NotionSync to production

Step-by-step from a working local app to a live, reviewable App Store app.
Follow in order. Anything in `UPPER_SNAKE` is a value you supply.

This is the same playbook as AirSync's DEPLOY.md — NotionSync is a separate
Shopify app with its own Partner-Dashboard entry, its own Railway service,
and its own database, even though it lives in the same repo.

---

## 0. Prerequisites

- The app runs locally (`npm run dev`, installed on your dev store).
- Accounts: [Shopify Partners](https://partners.shopify.com),
  [Railway](https://railway.app), GitHub (this repo pushed to it).
- Shopify CLI installed locally: `npm install -g @shopify/cli@latest`.

> **Heads up:** this app lives in the `notionsync/` subdirectory of the
> repo. Wherever Railway asks for a root directory, use `notionsync`.

---

## 1. Create the Railway project

1. Railway dashboard → **New Project → Deploy from GitHub repo** → pick this
   repo. (If AirSync is already deployed you can instead add a **new
   service** to the same Railway project from the same repo.)
2. In the new service: **Settings → Source → Root Directory** = `notionsync`.
   Railway will detect the `Dockerfile` (via `railway.json`) automatically.
3. **Don't deploy yet** — add the database and env vars first (next steps).

## 2. Add PostgreSQL

1. In the project: **Create → Database → Add PostgreSQL**. Give NotionSync
   its own Postgres instance — don't share AirSync's database.
2. On the NotionSync service: **Variables → New Variable → Add Reference** →
   select this Postgres's `DATABASE_URL`.

## 3. Generate a public domain

1. Service → **Settings → Networking → Generate Domain**.
2. Note it down, e.g. `https://notionsync-production.up.railway.app`.
   This is your `SHOPIFY_APP_URL`.

## 4. Set the environment variables

Service → **Variables**. Add:

| Variable | Value |
| --- | --- |
| `SHOPIFY_API_KEY` | Partner Dashboard → Apps → NotionSync → Overview → Client ID |
| `SHOPIFY_API_SECRET` | Same page → Client secret |
| `SHOPIFY_APP_URL` | The Railway domain from step 3 (with `https://`) |
| `SCOPES` | `read_orders,read_all_orders,read_products` |
| `DATABASE_URL` | (reference added in step 2) |
| `ENCRYPTION_KEY` | Run `openssl rand -hex 32` locally and paste the result |
| `BILLING_TEST` | `false` (real charges; test stores still aren't charged) |

Use a **different** `ENCRYPTION_KEY` than AirSync's, and **never change it
later** — every merchant's saved Notion token would become undecryptable.

## 5. Deploy

1. Push your latest code to GitHub — Railway builds and deploys the
   Dockerfile automatically.
2. The container start runs `prisma db push`, which creates all tables in
   PostgreSQL on first boot.
3. Check **Deployments → View Logs**: you want `remix-serve` listening and
   no Prisma errors. Then open `https://YOUR_DOMAIN/` — you should see the
   NotionSync landing page.

## 6. Point the Shopify app at production

1. Edit `shopify.app.toml` and add/update these lines (top level, under
   `client_id`):

   ```toml
   application_url = "https://YOUR_RAILWAY_DOMAIN"

   [auth]
   redirect_urls = ["https://YOUR_RAILWAY_DOMAIN/auth/callback"]
   ```

2. Run `shopify app deploy` from `notionsync/`. This pushes the app config
   to Shopify: the URLs, the scopes, **and all webhook subscriptions** from
   `shopify.app.toml` (order/product sync, uninstall, and the GDPR
   compliance topics) — webhooks follow the deployed `application_url`, so
   this is also what "switches webhooks to prod".
3. Sanity check in Partner Dashboard → NotionSync → **Configuration**: App
   URL and redirect URL show the Railway domain; **API access** lists the
   three scopes; **Compliance webhooks** show `/webhooks/compliance`.

> Dev tip: keep a separate dev app config so `shopify app dev` never
> clobbers production URLs (`shopify app config link` → new app called
> "NotionSync Dev", saved as `shopify.app.dev.toml`, switch with
> `npm run config:use -- dev`).

## 7. Install on a real store & smoke-test

1. Partner Dashboard → NotionSync → **Test your app** → pick your dev store.
2. Walk the whole flow: connect the Notion integration secret → pick a page
   → Create databases → toggles → Run initial sync.
3. Create a test order and a test product in the store; confirm rows appear
   in the Notion databases within a few seconds, that editing updates the
   same row (no duplicates), and that deleting a product archives its row.
4. Test billing: click **Upgrade to Pro** — you should land on Shopify's
   subscription approval screen showing $14.99/month with a 7-day trial.

---

## 8. Submitting for App Store review

Partner Dashboard → NotionSync → **Distribution** → **Public distribution**,
then create the listing. Checklist:

**Technical requirements (already handled by this codebase — verify, don't rebuild):**
- [x] Embedded app using App Bridge + Polaris, loads inside the admin
- [x] OAuth via the Remix template (immediate redirect to install)
- [x] Webhook HMAC verification (`authenticate.webhook`)
- [x] Mandatory compliance webhooks (`customers/data_request`,
      `customers/redact`, `shop/redact`) — registered in `shopify.app.toml`
- [x] Billing through Shopify's Billing API (no external checkout)
- [x] App works end-to-end on a clean install (test on a fresh dev store!)

**Things only you can do:**
- [ ] **App listing content**: app name ("NotionSync — Notion Order &
      Product Sync"), 100-character tagline, description, app icon
      (1200×1200 px), 3+ desktop screenshots (1600×900 px) of the settings
      page inside the admin.
- [ ] **Pricing section**: Free plan (50 orders/month) and Pro
      ($14.99/month, 7-day trial) — must match the code exactly.
- [ ] **Support**: support email + (optionally) support URL.
- [ ] **Privacy policy URL** — required. It must mention: what you store
      (encrypted Notion token, Shopify↔Notion page ID mappings, sync
      settings), that order/customer data is written to the merchant's own
      Notion workspace, and your data deletion behavior (everything deleted
      on uninstall / `shop/redact`).
- [ ] **Protected customer data access** (app → API access → Protected
      customer data): request access (name/email needed for the Customer
      name/email columns). Purpose = syncing order data to the merchant's
      Notion; storage = merchant's own Notion workspace only.
- [ ] **`read_all_orders` approval**: same API access page — request it,
      explaining the app backfills 90 days of order history on first sync.
      (Until approved, installs sync only the last 60 days; the app handles
      that gracefully.)
- [ ] **Review instructions**: give the review team a test Notion
      integration secret (throwaway Notion workspace, integration connected
      to one page) and 1-2-3 steps: connect secret → create databases →
      run initial sync.
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
- **Scaling note**: the Notion throttle and backfill run in-process, so
  keep the service at **1 replica**. One container comfortably handles the
  webhook volume of hundreds of stores; revisit with a proper job queue
  (e.g. BullMQ + Redis) only if you outgrow that.
