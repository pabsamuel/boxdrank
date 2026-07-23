import { describe, expect, it } from 'vitest';
import {
  generateStripeTestSignature,
  normalizeStripeEvent,
  verifyStripeSignature,
} from './webhooks';
import {
  assertCanAddEmote,
  assertCanCreatePack,
  assertCanUploadAnimated,
  resolveCreatorPlan,
  resolveFanPlan,
  PlanLimitError,
} from './plans';
import {
  LedgerInvariantError,
  subscriptionRevenueTransaction,
  validateLedgerTransaction,
} from './ledger';
import { StripeBillingProvider, BillingNotConfiguredError } from './stripe-client';

const NOW = new Date('2026-07-23T12:00:00Z');

describe('stripe webhook signatures', () => {
  const secret = 'whsec_test';
  const body = JSON.stringify({ id: 'evt_1', type: 'invoice.paid' });

  it('accepts a valid signature within tolerance', () => {
    const header = generateStripeTestSignature(body, secret, NOW);
    expect(() =>
      verifyStripeSignature({ rawBody: body, signatureHeader: header, secret, now: () => NOW }),
    ).not.toThrow();
  });

  it('rejects tampered bodies and wrong secrets', () => {
    const header = generateStripeTestSignature(body, secret, NOW);
    expect(() =>
      verifyStripeSignature({
        rawBody: body + 'x',
        signatureHeader: header,
        secret,
        now: () => NOW,
      }),
    ).toThrow(/signature mismatch/);
    expect(() =>
      verifyStripeSignature({
        rawBody: body,
        signatureHeader: header,
        secret: 'other',
        now: () => NOW,
      }),
    ).toThrow(/signature mismatch/);
  });

  it('rejects replayed (old) signatures outside tolerance', () => {
    const old = new Date(NOW.getTime() - 10 * 60_000);
    const header = generateStripeTestSignature(body, secret, old);
    expect(() =>
      verifyStripeSignature({ rawBody: body, signatureHeader: header, secret, now: () => NOW }),
    ).toThrow(/tolerance/);
  });

  it('rejects missing/malformed headers', () => {
    expect(() =>
      verifyStripeSignature({ rawBody: body, signatureHeader: undefined, secret }),
    ).toThrow(/no signature header/);
    expect(() =>
      verifyStripeSignature({ rawBody: body, signatureHeader: 'nonsense', secret }),
    ).toThrow(/malformed/);
  });
});

describe('stripe event normalization', () => {
  it('maps subscription lifecycle events with product key from price lookup_key', () => {
    const action = normalizeStripeEvent({
      id: 'evt_2',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          customer: 'cus_1',
          status: 'active',
          cancel_at_period_end: false,
          current_period_end: Math.floor(NOW.getTime() / 1000) + 86400,
          items: { data: [{ price: { lookup_key: 'creator_pro' } }] },
        },
      },
    });
    expect(action).toMatchObject({
      kind: 'subscription_sync',
      stripeSubscriptionId: 'sub_1',
      productKey: 'creator_pro',
      status: 'active',
    });
  });

  it('maps deletion to canceled and unknown events to ignored', () => {
    const del = normalizeStripeEvent({
      id: 'e',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active' } },
    });
    expect(del).toMatchObject({ kind: 'subscription_sync', status: 'canceled' });
    expect(
      normalizeStripeEvent({ id: 'e', type: 'weird.event', data: { object: {} } }),
    ).toMatchObject({ kind: 'ignored' });
  });
});

describe('plan resolution and enforcement', () => {
  it('resolves plans from subscription state, highest tier wins', () => {
    expect(resolveCreatorPlan([], NOW)).toBe('creator_free');
    expect(
      resolveCreatorPlan(
        [
          { productKey: 'creator_pro', status: 'active', currentPeriodEnd: null },
          { productKey: 'creator_business', status: 'trialing', currentPeriodEnd: null },
        ],
        NOW,
      ),
    ).toBe('creator_business');
    expect(
      resolveCreatorPlan(
        [{ productKey: 'creator_pro', status: 'canceled', currentPeriodEnd: null }],
        NOW,
      ),
    ).toBe('creator_free');
    // past_due keeps access during dunning
    expect(
      resolveCreatorPlan(
        [{ productKey: 'creator_pro', status: 'past_due', currentPeriodEnd: null }],
        NOW,
      ),
    ).toBe('creator_pro');
    // expired period ends access even if status lags
    expect(
      resolveFanPlan(
        [
          {
            productKey: 'fan_plus',
            status: 'active',
            currentPeriodEnd: new Date(NOW.getTime() - 1000),
          },
        ],
        NOW,
      ),
    ).toBe('fan_free');
  });

  it('enforces creator limits server-side (forged client plans cannot bypass)', () => {
    expect(() => assertCanCreatePack('creator_free', 3)).toThrow(PlanLimitError);
    expect(() => assertCanCreatePack('creator_free', 2)).not.toThrow();
    expect(() => assertCanAddEmote('creator_free', 30)).toThrow(PlanLimitError);
    expect(() => assertCanUploadAnimated('creator_free')).toThrow(PlanLimitError);
    expect(() => assertCanUploadAnimated('creator_pro')).not.toThrow();
  });
});

describe('ledger invariants', () => {
  it('accepts balanced transactions', () => {
    const tx = subscriptionRevenueTransaction({
      invoiceId: 'in_1',
      amountMinor: 1200,
      currency: 'usd',
      productKey: 'creator_pro',
    });
    expect(() => validateLedgerTransaction(tx)).not.toThrow();
  });

  it('rejects unbalanced, single-entry, zero, fractional, and mixed-currency transactions', () => {
    expect(() =>
      validateLedgerTransaction({
        description: 'bad',
        kind: 'gross_sale',
        entries: [
          { accountKey: 'a', amountMinor: 100, currency: 'usd' },
          { accountKey: 'b', amountMinor: -90, currency: 'usd' },
        ],
      }),
    ).toThrow(LedgerInvariantError);
    expect(() =>
      validateLedgerTransaction({
        description: 'bad',
        kind: 'gross_sale',
        entries: [{ accountKey: 'a', amountMinor: 0, currency: 'usd' }],
      }),
    ).toThrow(LedgerInvariantError);
    expect(() =>
      validateLedgerTransaction({
        description: 'bad',
        kind: 'gross_sale',
        entries: [
          { accountKey: 'a', amountMinor: 10.5 as never, currency: 'usd' },
          { accountKey: 'b', amountMinor: -10.5 as never, currency: 'usd' },
        ],
      }),
    ).toThrow(LedgerInvariantError);
    expect(() =>
      validateLedgerTransaction({
        description: 'bad',
        kind: 'gross_sale',
        entries: [
          { accountKey: 'a', amountMinor: 100, currency: 'usd' },
          { accountKey: 'b', amountMinor: -100, currency: 'eur' },
        ],
      }),
    ).toThrow(LedgerInvariantError);
  });
});

describe('stripe client', () => {
  it('refuses to operate unconfigured instead of faking success', async () => {
    const client = new StripeBillingProvider('');
    expect(client.configured).toBe(false);
    await expect(client.createCustomer({ email: 'a@b.c', userId: 'u1' })).rejects.toThrow(
      BillingNotConfiguredError,
    );
  });

  it('encodes checkout session params correctly', async () => {
    let captured: { url: string; body: string } | null = null;
    const fetchFn: typeof fetch = async (input, init) => {
      captured = { url: String(input), body: String(init?.body) };
      return new Response(JSON.stringify({ id: 'cs_1', url: 'https://checkout.stripe.com/x' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const client = new StripeBillingProvider('sk_test_x', fetchFn);
    const session = await client.createCheckoutSession({
      customerId: 'cus_1',
      priceId: 'price_1',
      successUrl: 'https://app/success',
      cancelUrl: 'https://app/cancel',
      clientReferenceId: 'user-1',
      trialDays: 7,
    });
    expect(session.sessionId).toBe('cs_1');
    const body = new URLSearchParams(captured!.body);
    expect(body.get('mode')).toBe('subscription');
    expect(body.get('line_items[0][price]')).toBe('price_1');
    expect(body.get('subscription_data[trial_period_days]')).toBe('7');
    expect(captured!.url).toBe('https://api.stripe.com/v1/checkout/sessions');
  });
});
