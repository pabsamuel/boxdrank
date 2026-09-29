# 0005 — One-time purchase via Lemon Squeezy licence keys

**Status:** accepted

## Context

Monetisation without accounts. Options: Stripe Checkout + our own entitlement store, app-store
IAP (needs native apps), Lemon Squeezy / Paddle as merchant of record with licence keys.

## Decision

Lemon Squeezy. A purchase yields a licence key; the host phone types it once; the TV activates it
through the Worker (`/api/license/*`) and remembers it in localStorage. No user database anywhere.

## Consequences

- VAT/KDV, invoices and refunds are handled by the merchant of record; the project holds no
  payment secrets (the licence API is unauthenticated by key).
- Keys can be shared; the activation limit (5) bounds the damage and matches a family's devices.
- Switching to Stripe later means replacing `entitlements.ts` only.
- `ENTITLEMENTS_MODE=open` keeps self-hosting and development free of any of this.
