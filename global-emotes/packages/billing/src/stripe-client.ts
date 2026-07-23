/**
 * Minimal Stripe REST client covering exactly what the product needs:
 * customers, Checkout sessions, and Billing Portal sessions. Injectable fetch
 * keeps it fully testable offline; the interface is the seam where a different
 * merchant-of-record provider can be swapped in (Spec B §1).
 */

export interface BillingProvider {
  readonly configured: boolean;
  createCustomer(input: { email: string; userId: string }): Promise<{ customerId: string }>;
  createCheckoutSession(input: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    clientReferenceId: string;
    trialDays?: number;
  }): Promise<{ url: string; sessionId: string }>;
  createPortalSession(input: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
}

export class BillingNotConfiguredError extends Error {
  constructor() {
    super('billing provider is not configured (missing STRIPE_SECRET_KEY)');
    this.name = 'BillingNotConfiguredError';
  }
}

const STRIPE_API = 'https://api.stripe.com/v1';

export class StripeBillingProvider implements BillingProvider {
  constructor(
    private readonly secretKey: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  get configured(): boolean {
    return this.secretKey.length > 0;
  }

  private async post<T>(path: string, form: Record<string, string>): Promise<T> {
    if (!this.configured) throw new BillingNotConfiguredError();
    const res = await this.fetchFn(`${STRIPE_API}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(form).toString(),
    });
    const json = (await res.json()) as T & { error?: { message?: string } };
    if (!res.ok) {
      throw new Error(`stripe error ${res.status}: ${json.error?.message ?? 'unknown'}`);
    }
    return json;
  }

  async createCustomer(input: { email: string; userId: string }): Promise<{ customerId: string }> {
    const json = await this.post<{ id: string }>('/customers', {
      email: input.email,
      'metadata[user_id]': input.userId,
    });
    return { customerId: json.id };
  }

  async createCheckoutSession(input: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    clientReferenceId: string;
    trialDays?: number;
  }): Promise<{ url: string; sessionId: string }> {
    const form: Record<string, string> = {
      mode: 'subscription',
      customer: input.customerId,
      'line_items[0][price]': input.priceId,
      'line_items[0][quantity]': '1',
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.clientReferenceId,
      'automatic_tax[enabled]': 'false',
    };
    if (input.trialDays && input.trialDays > 0) {
      form['subscription_data[trial_period_days]'] = String(input.trialDays);
    }
    const json = await this.post<{ id: string; url: string }>('/checkout/sessions', form);
    return { url: json.url, sessionId: json.id };
  }

  async createPortalSession(input: { customerId: string; returnUrl: string }): Promise<{ url: string }> {
    const json = await this.post<{ url: string }>('/billing_portal/sessions', {
      customer: input.customerId,
      return_url: input.returnUrl,
    });
    return { url: json.url };
  }
}
