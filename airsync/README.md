# AirSync — Airtable Order & Product Sync

A Shopify app that automatically syncs a merchant's **orders** and **products**
into their own **Airtable base**, in near real-time, via Shopify webhooks.
Thin, reliable connector — no AI, no dashboards, just sync.

Built on the official [Shopify Remix app template](https://github.com/Shopify/shopify-app-template-remix)
(TypeScript, Prisma, Polaris). Deployment target: Railway (Docker).
**See [DEPLOY.md](./DEPLOY.md) for the full production deployment guide.**

## How it works

1. The merchant pastes an Airtable **Personal Access Token** on the settings
   page. It's validated against Airtable, then stored **AES-256-GCM
   encrypted** — never in plain text, never logged.
2. They pick a base and click **"Create tables for me"** — the app creates
   `Orders` and `Products` tables with a fixed schema via the Airtable Meta API.
3. **"Run initial sync"** backfills the last 90 days of orders and all
   products (paginated GraphQL Admin API, throttled Airtable writes).
4. From then on, Shopify webhooks (`orders/create|updated|cancelled`,
   `products/create|update|delete`) keep Airtable up to date. A local
   `RecordMap` table maps Shopify IDs to Airtable record IDs, so updates
   modify the existing row instead of duplicating it.

### Reliability

- Airtable allows 5 requests/second per base — all writes go through a
  per-base throttle queue (4/sec) in `app/lib/airtable.server.ts`.
- Failed Airtable writes retry 3× with exponential backoff (429s wait 30s).
  After that the failure lands in the `SyncError` table and shows up on the
  settings page.
- Webhook handlers never crash on malformed payloads — they log the error and
  return 200. HMAC verification is handled by `authenticate.webhook`
  (invalid signatures get a 401 before any of our code runs).

### Billing

- **Free**: sync up to 50 orders per calendar month. When exceeded, order
  sync pauses and the settings page shows an upgrade banner. (Counter resets
  monthly.)
- **Pro**: $14.99/month, unlimited, 7-day free trial — via Shopify's Billing
  API (`billing.request` / `billing.check` from the app template).

## Project structure

```
app/
  shopify.server.ts            Shopify app setup + billing plan config
  lib/
    crypto.server.ts           AES-256-GCM encryption for Airtable tokens
    airtable.server.ts         Airtable REST client (throttle, retries, Meta API)
    sync.server.ts             Field mapping, upsert logic, free-plan metering
    backfill.server.ts         90-day initial sync (background job)
    constants.ts               Shared client/server constants
  routes/
    app._index.tsx             The settings page (Polaris UI + all actions)
    webhooks.orders.tsx        orders/create|updated|cancelled
    webhooks.products.tsx      products/create|update|delete
    webhooks.compliance.tsx    GDPR: customers/data_request|redact, shop/redact
    webhooks.app.uninstalled.tsx  Cleanup on uninstall
prisma/
  schema.prisma                Dev schema (SQLite)
  schema.production.prisma     Prod schema (PostgreSQL) — keep in sync!
shopify.app.toml               Scopes + webhook subscriptions
Dockerfile / railway.json      Production deploy (see DEPLOY.md)
```

## Local development

Prerequisites: Node 20.19+/22.12+, a [Shopify Partner account](https://partners.shopify.com)
with a development store, and the Shopify CLI (`npm install -g @shopify/cli@latest`).

```bash
npm install
npm run dev        # = shopify app dev
```

The first run walks you through logging in, creating/linking the app, and
choosing a dev store, then prints a preview link. Press `p` (or open the
link) and install the app on your dev store — the AirSync settings page
should load inside the Shopify admin.

To test the sync you'll need an Airtable Personal Access Token
(https://airtable.com/create/tokens) with scopes `data.records:read`,
`data.records:write`, `schema.bases:read`, `schema.bases:write`, granted
access to at least one base or workspace.

### Tests

```bash
npm run test:sync
```

Runs the offline test suite (no Shopify/Airtable accounts needed): field
mapping + token encryption, Airtable throttling/retry behavior (mocked
API), and free-plan metering against the real dev database (needs
`npx prisma migrate dev` to have run once). Takes ~20s — most of it is the
throttle test genuinely waiting out the rate limit.

## Environment variables

| Variable | Dev | Production | Purpose |
| --- | --- | --- | --- |
| `SHOPIFY_API_KEY` | set by CLI | required | App client ID (Partner Dashboard) |
| `SHOPIFY_API_SECRET` | set by CLI | required | App client secret |
| `SHOPIFY_APP_URL` | set by CLI | required | Public app URL (Railway domain) |
| `SCOPES` | optional | required | `read_orders,read_all_orders,read_products` |
| `DATABASE_URL` | unused (SQLite) | required | PostgreSQL connection string |
| `ENCRYPTION_KEY` | optional* | **required** | Encrypts Airtable tokens (`openssl rand -hex 32`) |
| `BILLING_TEST` | default `true` | set `false` | Test vs. real billing charges |

\* In dev it falls back to `SHOPIFY_API_SECRET` so things just work.
**Never change `ENCRYPTION_KEY` after merchants have connected — stored
tokens become undecryptable and every merchant must reconnect.**

## Notes & limitations (MVP)

- Field mapping is fixed (see `app/lib/sync.server.ts`) — not configurable.
- The 90-day order backfill needs the `read_all_orders` scope; without
  Shopify's approval of that scope, public-app installs only get 60 days.
- The backfill runs in-process (fine on Railway's always-on containers; not
  suitable for serverless hosts).
- Order names/emails are written to the merchant's own Airtable base. We
  store no customer PII in our database — see `webhooks.compliance.tsx`.
