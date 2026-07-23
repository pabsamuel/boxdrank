import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { schema } from '@global-emotes/database';
import {
  normalizeStripeEvent,
  verifyStripeSignature,
  subscriptionRevenueTransaction,
  validateLedgerTransaction,
} from '@global-emotes/billing';
import { requireUser } from '../plugins/auth';
import { notFound } from '../errors';

/**
 * Web billing (creator SaaS + flagged Fan Plus): Stripe Checkout, portal, and
 * the signed webhook that is the only writer of subscription state.
 */
export const registerBillingRoutes: FastifyPluginAsync = async (app) => {
  const { db, env, billing } = app.ctx;

  app.post(
    '/billing/checkout',
    {
      schema: {
        body: z.object({
          productKey: z.enum(['fan_plus', 'creator_pro', 'creator_business']),
          interval: z.enum(['month', 'year']).default('month'),
        }),
      },
    },
    async (req) => {
      const user = requireUser(req);
      const { productKey, interval } = req.body as { productKey: string; interval: 'month' | 'year' };

      const priceRows = await db
        .select({ stripePriceId: schema.prices.stripePriceId })
        .from(schema.prices)
        .innerJoin(schema.products, eq(schema.prices.productId, schema.products.id))
        .where(
          and(
            eq(schema.products.key, productKey),
            eq(schema.prices.interval, interval),
            eq(schema.prices.active, true),
          ),
        )
        .limit(1);
      const priceId = priceRows[0]?.stripePriceId;
      if (!priceId) throw notFound(`no active price for ${productKey}/${interval} — configure prices first`);

      let customerRows = await db
        .select()
        .from(schema.billingCustomers)
        .where(eq(schema.billingCustomers.userId, user.id))
        .limit(1);
      let customerId = customerRows[0]?.stripeCustomerId;
      if (!customerId) {
        const created = await billing.createCustomer({ email: user.email, userId: user.id });
        customerId = created.customerId;
        await db
          .insert(schema.billingCustomers)
          .values({ userId: user.id, stripeCustomerId: customerId })
          .onConflictDoNothing();
      }

      const session = await billing.createCheckoutSession({
        customerId,
        priceId,
        successUrl: `${env.PUBLIC_WEB_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${env.PUBLIC_WEB_URL}/billing/cancel`,
        clientReferenceId: user.id,
        trialDays: productKey === 'creator_pro' ? 14 : undefined,
      });
      return { url: session.url };
    },
  );

  app.post('/billing/portal', async (req) => {
    const user = requireUser(req);
    const customerRows = await db
      .select()
      .from(schema.billingCustomers)
      .where(eq(schema.billingCustomers.userId, user.id))
      .limit(1);
    if (!customerRows[0]) throw notFound('no billing customer for this account');
    const session = await billing.createPortalSession({
      customerId: customerRows[0].stripeCustomerId,
      returnUrl: `${env.PUBLIC_WEB_URL}/settings/billing`,
    });
    return { url: session.url };
  });

  app.get('/billing/subscriptions', async (req) => {
    const user = requireUser(req);
    const rows = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, user.id));
    return {
      items: rows.map((r) => ({
        id: r.id,
        productKey: r.productKey,
        status: r.status,
        currentPeriodEnd: r.currentPeriodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd: r.cancelAtPeriodEnd,
      })),
    };
  });
};

/**
 * Stripe webhook — registered separately because it needs the raw body and no
 * session auth. Signature verification + inbox idempotency (payment_events).
 */
export const registerStripeWebhook: FastifyPluginAsync = async (app) => {
  const { db, env } = app.ctx;

  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) =>
    done(null, body),
  );

  app.post('/webhooks/stripe', async (req, reply) => {
    const rawBody = req.body as string;
    verifyStripeSignature({
      rawBody,
      signatureHeader: req.headers['stripe-signature'] as string | undefined,
      secret: env.STRIPE_WEBHOOK_SECRET,
    });

    const event = JSON.parse(rawBody) as {
      id: string;
      type: string;
      data: { object: Record<string, unknown> };
    };

    // Inbox idempotency: first insert wins, replays are acknowledged and skipped.
    const inserted = await db
      .insert(schema.paymentEvents)
      .values({ stripeEventId: event.id, type: event.type, payload: event as never })
      .onConflictDoNothing()
      .returning({ id: schema.paymentEvents.id });
    if (inserted.length === 0) return reply.send({ received: true, duplicate: true });

    const action = normalizeStripeEvent(event);
    try {
      switch (action.kind) {
        case 'subscription_sync': {
          const customerRows = await db
            .select()
            .from(schema.billingCustomers)
            .where(eq(schema.billingCustomers.stripeCustomerId, action.stripeCustomerId))
            .limit(1);
          const customer = customerRows[0];
          if (!customer) break;
          await db
            .insert(schema.subscriptions)
            .values({
              userId: customer.userId,
              productKey: action.productKey ?? 'unknown',
              stripeSubscriptionId: action.stripeSubscriptionId,
              status: action.status as never,
              currentPeriodEnd: action.currentPeriodEnd,
              cancelAtPeriodEnd: action.cancelAtPeriodEnd,
            })
            .onConflictDoUpdate({
              target: [schema.subscriptions.stripeSubscriptionId],
              set: {
                status: action.status as never,
                ...(action.productKey ? { productKey: action.productKey } : {}),
                currentPeriodEnd: action.currentPeriodEnd,
                cancelAtPeriodEnd: action.cancelAtPeriodEnd,
                updatedAt: new Date(),
              },
            });
          // Creator plan derives from subscription state.
          if (action.productKey === 'creator_pro' || action.productKey === 'creator_business') {
            const entitled = ['active', 'trialing', 'past_due'].includes(action.status);
            await db
              .update(schema.creatorProfiles)
              .set({ plan: entitled ? (action.productKey as never) : 'creator_free' })
              .where(eq(schema.creatorProfiles.userId, customer.userId));
          }
          if (action.productKey === 'fan_plus') {
            const entitled = ['active', 'trialing', 'past_due'].includes(action.status);
            await db
              .update(schema.users)
              .set({ fanPlan: entitled ? 'fan_plus' : 'fan_free' })
              .where(eq(schema.users.id, customer.userId));
          }
          break;
        }
        case 'invoice_recorded': {
          await db
            .insert(schema.invoices)
            .values({
              stripeInvoiceId: action.stripeInvoiceId,
              amountDue: action.amountDue,
              currency: action.currency,
              status: action.status,
            })
            .onConflictDoNothing();
          if (action.status === 'paid' && action.amountDue > 0) {
            const tx = subscriptionRevenueTransaction({
              invoiceId: action.stripeInvoiceId,
              amountMinor: action.amountDue,
              currency: action.currency,
              productKey: 'subscription',
            });
            validateLedgerTransaction(tx);
            await recordLedger(db, tx);
          }
          break;
        }
        case 'payment_failed':
        case 'checkout_completed':
        case 'ignored':
          break;
      }
      await db
        .update(schema.paymentEvents)
        .set({ status: 'processed', processedAt: new Date() })
        .where(eq(schema.paymentEvents.stripeEventId, event.id));
    } catch (err) {
      await db
        .update(schema.paymentEvents)
        .set({ status: 'failed', error: String(err) })
        .where(eq(schema.paymentEvents.stripeEventId, event.id));
      throw err;
    }
    return reply.send({ received: true });
  });
};

async function recordLedger(
  db: import('@global-emotes/database').Db,
  tx: import('@global-emotes/billing').LedgerTransactionInput,
): Promise<void> {
  await db.transaction(async (t) => {
    const txRows = await t
      .insert(schema.ledgerTransactions)
      .values({ description: tx.description, kind: tx.kind, externalRef: tx.externalRef ?? null })
      .returning({ id: schema.ledgerTransactions.id });
    for (const entry of tx.entries) {
      await t
        .insert(schema.ledgerAccounts)
        .values({
          key: entry.accountKey,
          kind: entry.accountKey.includes('revenue') ? 'revenue' : 'asset',
          currency: entry.currency,
        })
        .onConflictDoNothing();
      const accountRows = await t
        .select()
        .from(schema.ledgerAccounts)
        .where(eq(schema.ledgerAccounts.key, entry.accountKey))
        .limit(1);
      await t.insert(schema.ledgerEntries).values({
        transactionId: txRows[0]!.id,
        accountId: accountRows[0]!.id,
        amountMinor: entry.amountMinor,
        currency: entry.currency,
      });
    }
  });
}
