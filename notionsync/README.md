# NotionSync — Notion Order & Product Sync

A Shopify app that automatically syncs a merchant's **orders** and **products**
into their own **Notion workspace**, in near real-time, via Shopify webhooks.
Thin, reliable connector — no AI, no dashboards, just sync.

Built on the official [Shopify Remix app template](https://github.com/Shopify/shopify-app-template-remix)
(TypeScript, Prisma, Polaris). Deployment target: Railway (Docker).
**See [DEPLOY.md](./DEPLOY.md) for the full production deployment guide.**

> Sibling app: [`../airsync`](../airsync) is the same product for Airtable.
> The two share their architecture; fixes in one usually apply to the other.

## How it works

1. The merchant creates a Notion **internal integration**
   (notion.so/my-integrations), connects it to a page in their workspace,
   and pastes the integration secret on the settings page. It's validated
   against Notion, then stored **AES-256-GCM encrypted** — never in plain
   text, never logged.
2. They pick a parent page and click **"Create databases for me"** — the app
   creates `Orders` and `Products` databases with a fixed property schema.
3. **"Run initial sync"** backfills the last 90 days of orders and all
   products (paginated GraphQL Admin API, throttled Notion writes).
4. From then on, Shopify webhooks (`orders/create|updated|cancelled`,
   `products/create|update|delete`) keep Notion up to date. A local
   `RecordMap` table maps Shopify IDs to Notion page IDs, so updates modify
   the existing row instead of duplicating it. Product deletes archive the
   Notion page.

### Reliability

- Notion allows ~3 requests/second per integration — all calls go through a
  per-integration throttle queue (350ms spacing) in `app/lib/notion.server.ts`.
- Failed Notion writes retry 3× with exponential backoff. After that the
  failure lands in the `SyncError` table and shows up on the settings page.
- Rows deleted or archived by hand in Notion are transparently recreated on
  the next update.
- Webhook handlers never crash on malformed payloads — they log the error
  and return 200. HMAC verification is handled by `authenticate.webhook`
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
    crypto.server.ts           AES-256-GCM encryption for Notion tokens
    notion.server.ts           Notion REST client (throttle, retries, DB creation)
    sync.server.ts             Property mapping, upsert logic, free-plan metering
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

The first run walks you through logging in, creating/linking the app
(create it as a NEW app named "NotionSync" — don't link it to AirSync's
app), and choosing a dev store, then prints a preview link. Press `p` (or
open the link) and install the app on your dev store.

To test the sync you'll need a Notion internal integration
(https://www.notion.so/my-integrations) with **Read / Insert / Update
content** capabilities, connected to at least one page in your workspace
(open the page → ••• → Connections → your integration).

### Tests

```bash
npm run test:sync
```

Runs the offline test suite (no Shopify/Notion accounts needed): property
mapping + token encryption, Notion throttling/retry behavior (mocked API),
and free-plan metering against the real dev database (needs
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
| `ENCRYPTION_KEY` | optional* | **required** | Encrypts Notion tokens (`openssl rand -hex 32`) |
| `BILLING_TEST` | default `true` | set `false` | Test vs. real billing charges |

\* In dev it falls back to `SHOPIFY_API_SECRET` so things just work.
**Never change `ENCRYPTION_KEY` after merchants have connected — stored
tokens become undecryptable and every merchant must reconnect.**

## Notes & limitations (MVP)

- Field mapping is fixed (see `app/lib/sync.server.ts`) — not configurable.
- "Create databases for me" always creates fresh databases (Notion database
  titles aren't unique, so unlike Airtable there's no safe reuse-by-name).
  Old databases keep their data; the app just starts writing to the new ones.
- The 90-day order backfill needs the `read_all_orders` scope; without
  Shopify's approval of that scope, public-app installs only get 60 days.
- The backfill runs in-process (fine on Railway's always-on containers; not
  suitable for serverless hosts).
- Order names/emails are written to the merchant's own Notion workspace. We
  store no customer PII in our database — see `webhooks.compliance.tsx`.
