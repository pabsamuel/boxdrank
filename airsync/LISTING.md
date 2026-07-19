# AirSync — App Store listing copy (draft)

Ready-to-paste content for the Shopify App Store listing form. Tweak the
voice to taste; keep the pricing section exactly matching the code.

## App name

AirSync — Airtable Order & Product Sync

## Tagline (max 100 characters)

Option A (62): `Your orders and products in Airtable, updated in real time.`
Option B (76): `Auto-sync orders & products to your own Airtable base. Set up in 2 minutes.`

## Description

**Your Shopify data, living in Airtable — automatically.**

AirSync keeps an Airtable base of your orders and products that updates
itself. Connect your Airtable account, click "Create tables for me", and
from then on every new order, order update, cancellation, product change
and product delete lands in Airtable within seconds — no exports, no CSVs,
no Zapier chains.

**Set up in three steps**
1. Paste an Airtable Personal Access Token (stored encrypted, never shared)
2. Pick a base — AirSync creates ready-made Orders and Products tables
3. Run the initial sync: the last 90 days of orders and your full catalog

**Built to be trusted**
- No duplicates: updates modify the existing Airtable row
- Airtable rate limits respected automatically; failed writes retry
- A status page shows exactly what synced, when, and any errors
- Your data goes only to YOUR Airtable base — we don't store order contents

**Who it's for**
Ops teams living in Airtable, agencies building client dashboards, and
anyone who wants their store data in a flexible database without exports.

## Pricing (must match the app)

- **Free** — sync up to 50 orders per month, unlimited product sync
- **Pro, $14.99/month** — unlimited orders, 7-day free trial

## Assets you still need

- App icon, 1200×1200 px — a ready-to-use starter is included at
  [assets/app-icon.png](./assets/app-icon.png) (teal/blue, table + sync
  arrows); replace it with custom artwork whenever you like
- 3–6 desktop screenshots, 1600×900 px — suggested shots: the three-step
  settings page, the status panel after a sync, the resulting Airtable
  Orders table with rows in it
- Optional 30–60s screen recording of the setup flow

## Instructions for the app review team (paste into the review notes)

> 1. Install the app and open it from the admin sidebar.
> 2. Use this test Airtable token: `[create a throwaway Airtable account,
>    make a PAT with scopes data.records:read, data.records:write,
>    schema.bases:read, schema.bases:write, granted to one workspace]`
> 3. Step 1: paste the token → Connect. Step 2: pick the base "AirSync
>    Test" → Create tables for me. Step 3: Run initial sync.
> 4. Create a test order in the store — it appears in the Airtable Orders
>    table within seconds. Cancel it — the same row updates (no duplicate).
> 5. Billing: click "Upgrade to Pro" to see the $14.99/month subscription
>    with a 7-day trial via Shopify's billing screen.
