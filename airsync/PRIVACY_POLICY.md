# AirSync — Privacy Policy

_Last updated: July 18, 2026_

> **Before publishing:** replace the two `[FILL IN]` values below (your
> name/company and support email), review the text, and host this document
> at a public URL (your website, or this file's GitHub URL). Paste that URL
> into the app listing's "Privacy policy" field. This draft describes what
> the app actually does; if you change the app's behavior, update this too.

AirSync — Airtable Order & Product Sync ("AirSync", "the app") is operated
by **[FILL IN: your name or company]** ("we", "us"). This policy explains
what data the app touches when a merchant ("you") installs it on a Shopify
store, and what happens to that data.

## What the app does with your store's data

AirSync copies your store's **orders** and **products** from Shopify into
an **Airtable base that you own and control**. The synced fields are:

- Orders: order number, creation date, customer name, customer email,
  total price, currency, financial status, fulfillment status, a line-item
  summary, shipping country, tags, and a link to the order in your admin.
- Products: title, status, vendor, product type, price, total inventory,
  tags, creation date, and a link to the product in your admin.

This data flows **through** our server to Airtable; order and customer
details are **not stored in our database**.

## What we store on our servers

- Your shop's `.myshopify.com` domain and Shopify API session tokens
  (required for the app to function).
- Your Airtable Personal Access Token, **encrypted at rest with
  AES-256-GCM**. It is never stored or logged in plain text.
- Which Airtable base and tables you sync into, and your sync settings.
- A mapping table linking Shopify order/product IDs to Airtable record IDs
  (numbers only — no names, emails, or order contents).
- Sync error logs (error messages and resource IDs, kept so you can see
  failures on the status page; you can clear them at any time).
- A monthly counter of synced orders (for free-plan limits).

## What we do NOT do

- We do not sell, rent, or share your data with anyone.
- We do not use your data for advertising, profiling, or training.
- We do not store your customers' personal information in our database.

## Third parties

- **Shopify** sends us order/product webhooks and processes billing.
- **Airtable** receives the synced rows — into your own base, under your
  own Airtable account and Airtable's terms.
- Our server and database are hosted on **Railway**.

## Data retention & deletion

- Uninstalling the app deletes your sessions, settings, encrypted Airtable
  token, ID mappings, and error logs from our systems. Shopify's
  `shop/redact` request (sent 48 hours after uninstall) triggers the same
  deletion again as a backstop.
- Rows already synced to your Airtable base are yours and remain in your
  Airtable account — delete them there if you wish.
- We honor Shopify's GDPR webhooks (`customers/data_request`,
  `customers/redact`, `shop/redact`). Because we hold no customer personal
  data, customer requests require no action on our side beyond
  acknowledgment; your Airtable base is under your control.

## Contact

Questions or data requests: **[FILL IN: support email]**

We may update this policy as the app evolves; material changes will be
reflected in the "Last updated" date above.
