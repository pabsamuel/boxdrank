# MONETIZATION

Order of attack (IP-01): **creator SaaS first**, Fan Plus flagged, marketplace later.

## Plans (config: `packages/config` CREATOR_PLAN_LIMITS / FAN_PLAN_LIMITS / PLAN_PRICING)

| Plan                       | Price (placeholder)            | Key gates                                                                                    |
| -------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------- |
| Creator Free               | $0                             | 1 provider, 3 packs, 30 emotes, static only, 25 codes/batch                                  |
| Creator Pro                | $12/mo · $99/yr · 14-day trial | 10 providers, 50 packs, 1k emotes, animated, team ×5, scheduled releases, advanced analytics |
| Creator Business           | $49/mo                         | orgs/brands, 200 packs, 5k emotes, team ×25, audit exports, priority support                 |
| Fan Free                   | $0                             | full unlock experience, 50 favorites, 30 recents                                             |
| Fan Plus (flag `fan_plus`) | $3.99/mo · $29.99/yr           | sync, folders, 1k favorites, personal packs, themes                                          |

Enforcement is server-side only (`packages/billing`, tested: forged client plans cannot bypass).

## Stripe setup

Create products with prices carrying `lookup_key` ∈ {`creator_pro`,`creator_business`,`fan_plus`} (monthly + annual). Insert rows:

```sql
INSERT INTO prices (product_id, stripe_price_id, currency, unit_amount, interval)
SELECT id, '<price_xxx>', 'usd', 1200, 'month' FROM products WHERE key='creator_pro';
```

Webhook events consumed: `customer.subscription.*`, `invoice.paid|payment_succeeded|finalized|payment_failed`, `checkout.session.completed`. Plans derive exclusively from webhook-synced state; `past_due` keeps access during dunning; period-end lapse downgrades even if a status update is missed.

## Marketplace (flag `marketplace`, payouts flag `creator_payouts` — both OFF)

Double-entry ledger already live (subscription revenue recorded today), so turning on paid packs later is product work, not a data migration. Blockers before enabling payouts: KYC/tax (Stripe Connect Express or MoR), refund/chargeback policy, Apple/Google digital-goods rules for fan-side purchases, creator agreement (legal review). Take-rate placeholder: 15% + payment fees.

## Revenue instrumentation

`checkout_started/completed`, `subscription_cancelled` events + `subscriptions` table = MRR/ARR/churn/trial-conversion queries (OBSERVABILITY.md). Expansion revenue = plan upgrades visible in `subscription_sync` history via `payment_events`.
