import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Stripe webhook signature verification (docs: "Verify webhook signatures
 * manually"). Header format: `t=<unix>,v1=<hmac>,v1=<hmac>...`.
 * Signed payload: `${t}.${rawBody}` with HMAC-SHA256(webhook secret).
 * Implemented manually so it is fully testable offline; behaviour matches
 * stripe-node's constructEvent (including the tolerance check).
 */

export class WebhookVerificationError extends Error {
  constructor(
    public readonly code: 'missing_header' | 'bad_signature' | 'outside_tolerance',
    message: string,
  ) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

export interface VerifyStripeSignatureInput {
  rawBody: string;
  signatureHeader: string | undefined;
  secret: string;
  toleranceSeconds?: number;
  now?: () => Date;
}

export function verifyStripeSignature(input: VerifyStripeSignatureInput): void {
  const { rawBody, signatureHeader, secret } = input;
  const tolerance = input.toleranceSeconds ?? 300;
  const now = input.now?.() ?? new Date();

  if (!signatureHeader) throw new WebhookVerificationError('missing_header', 'no signature header');

  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of signatureHeader.split(',')) {
    const [key, value] = part.split('=', 2);
    if (key === 't' && value) timestamp = Number(value);
    if (key === 'v1' && value) signatures.push(value);
  }
  if (!timestamp || signatures.length === 0) {
    throw new WebhookVerificationError('missing_header', 'malformed signature header');
  }

  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const expectedBuf = Buffer.from(expected);
  const valid = signatures.some((sig) => {
    const sigBuf = Buffer.from(sig);
    return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
  });
  if (!valid) throw new WebhookVerificationError('bad_signature', 'signature mismatch');

  const ageSeconds = Math.abs(now.getTime() / 1000 - timestamp);
  if (ageSeconds > tolerance) {
    throw new WebhookVerificationError('outside_tolerance', 'timestamp outside tolerance');
  }
}

/** Test helper mirroring stripe-node's generateTestHeaderString. */
export function generateStripeTestSignature(rawBody: string, secret: string, at = new Date()): string {
  const t = Math.floor(at.getTime() / 1000);
  const v1 = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

// ── Event normalization ──────────────────────────────────────────────────────

export interface StripeEventLike {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export type BillingAction =
  | {
      kind: 'subscription_sync';
      stripeSubscriptionId: string;
      stripeCustomerId: string;
      status: string;
      productKey: string | null;
      currentPeriodEnd: Date | null;
      cancelAtPeriodEnd: boolean;
    }
  | { kind: 'checkout_completed'; stripeCustomerId: string; stripeSubscriptionId: string | null; clientReferenceId: string | null }
  | { kind: 'invoice_recorded'; stripeInvoiceId: string; amountDue: number; currency: string; status: string; stripeSubscriptionId: string | null }
  | { kind: 'payment_failed'; stripeCustomerId: string; stripeSubscriptionId: string | null }
  | { kind: 'ignored'; reason: string };

/** Map a verified Stripe event into a provider-agnostic billing action. */
export function normalizeStripeEvent(event: StripeEventLike): BillingAction {
  const object = event.data.object;
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const items = object['items'] as
        | { data?: Array<{ price?: { lookup_key?: string | null; metadata?: Record<string, string> } }> }
        | undefined;
      const price = items?.data?.[0]?.price;
      const productKey = price?.lookup_key ?? price?.metadata?.['product_key'] ?? null;
      const periodEnd = object['current_period_end'];
      return {
        kind: 'subscription_sync',
        stripeSubscriptionId: String(object['id']),
        stripeCustomerId: String(object['customer']),
        status: event.type === 'customer.subscription.deleted' ? 'canceled' : String(object['status']),
        productKey,
        currentPeriodEnd: typeof periodEnd === 'number' ? new Date(periodEnd * 1000) : null,
        cancelAtPeriodEnd: Boolean(object['cancel_at_period_end']),
      };
    }
    case 'checkout.session.completed':
      return {
        kind: 'checkout_completed',
        stripeCustomerId: String(object['customer']),
        stripeSubscriptionId: object['subscription'] ? String(object['subscription']) : null,
        clientReferenceId: object['client_reference_id'] ? String(object['client_reference_id']) : null,
      };
    case 'invoice.paid':
    case 'invoice.payment_succeeded':
    case 'invoice.finalized':
      return {
        kind: 'invoice_recorded',
        stripeInvoiceId: String(object['id']),
        amountDue: Number(object['amount_due'] ?? 0),
        currency: String(object['currency'] ?? 'usd'),
        status: String(object['status'] ?? 'unknown'),
        stripeSubscriptionId: object['subscription'] ? String(object['subscription']) : null,
      };
    case 'invoice.payment_failed':
      return {
        kind: 'payment_failed',
        stripeCustomerId: String(object['customer']),
        stripeSubscriptionId: object['subscription'] ? String(object['subscription']) : null,
      };
    default:
      return { kind: 'ignored', reason: `unhandled event type ${event.type}` };
  }
}
