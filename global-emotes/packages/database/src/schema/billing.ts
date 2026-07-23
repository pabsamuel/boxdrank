import {
  bigint,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.js';

const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();

export const products = pgTable(
  'products',
  {
    id: id(),
    key: text('key').notNull(), // 'fan_plus' | 'creator_pro' | 'creator_business'
    name: text('name').notNull(),
    active: boolean('active').default(true).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('products_key_idx').on(t.key)],
);

export const prices = pgTable(
  'prices',
  {
    id: id(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    stripePriceId: text('stripe_price_id'),
    currency: text('currency').default('usd').notNull(),
    unitAmount: bigint('unit_amount', { mode: 'number' }).notNull(),
    interval: text('interval', { enum: ['month', 'year'] }).notNull(),
    active: boolean('active').default(true).notNull(),
  },
  (t) => [index('prices_product_idx').on(t.productId)],
);

export const billingCustomers = pgTable(
  'billing_customers',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stripeCustomerId: text('stripe_customer_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('billing_customers_user_idx').on(t.userId),
    uniqueIndex('billing_customers_stripe_idx').on(t.stripeCustomerId),
  ],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    productKey: text('product_key').notNull(),
    stripeSubscriptionId: text('stripe_subscription_id'),
    status: text('status', {
      enum: ['trialing', 'active', 'past_due', 'canceled', 'incomplete', 'unpaid'],
    }).notNull(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false).notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('subscriptions_stripe_idx').on(t.stripeSubscriptionId),
    index('subscriptions_user_idx').on(t.userId, t.status),
  ],
);

export const invoices = pgTable(
  'invoices',
  {
    id: id(),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, {
      onDelete: 'set null',
    }),
    stripeInvoiceId: text('stripe_invoice_id').notNull(),
    amountDue: bigint('amount_due', { mode: 'number' }).notNull(),
    currency: text('currency').default('usd').notNull(),
    status: text('status').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('invoices_stripe_idx').on(t.stripeInvoiceId)],
);

/** Stripe webhook inbox: idempotent processing + replay protection. */
export const paymentEvents = pgTable(
  'payment_events',
  {
    id: id(),
    stripeEventId: text('stripe_event_id').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    receivedAt: createdAt(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    status: text('status', { enum: ['received', 'processed', 'failed', 'skipped'] })
      .default('received')
      .notNull(),
    error: text('error'),
  },
  (t) => [uniqueIndex('payment_events_stripe_idx').on(t.stripeEventId)],
);

// ── Double-entry ledger (IP-08): live from day one, used by marketplace later ─

export const ledgerAccounts = pgTable(
  'ledger_accounts',
  {
    id: id(),
    key: text('key').notNull(), // e.g. 'platform:revenue', 'creator:<id>:payable'
    kind: text('kind', { enum: ['asset', 'liability', 'revenue', 'expense'] }).notNull(),
    currency: text('currency').default('usd').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('ledger_accounts_key_idx').on(t.key)],
);

export const ledgerTransactions = pgTable('ledger_transactions', {
  id: id(),
  description: text('description').notNull(),
  kind: text('kind', {
    enum: [
      'gross_sale',
      'tax',
      'payment_fee',
      'commission',
      'creator_payable',
      'refund',
      'chargeback',
      'payout',
      'subscription_revenue',
    ],
  }).notNull(),
  externalRef: text('external_ref'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: createdAt(),
});

/**
 * Signed minor-unit amounts. Invariant (service + test enforced): entries of a
 * transaction sum to zero. Rows are immutable — corrections are new transactions.
 */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: id(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => ledgerTransactions.id, { onDelete: 'restrict' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => ledgerAccounts.id, { onDelete: 'restrict' }),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: text('currency').default('usd').notNull(),
  },
  (t) => [index('ledger_entries_tx_idx').on(t.transactionId)],
);

export const refunds = pgTable('refunds', {
  id: id(),
  stripeRefundId: text('stripe_refund_id'),
  invoiceId: uuid('invoice_id').references(() => invoices.id),
  amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
  reason: text('reason'),
  createdAt: createdAt(),
});

export const payouts = pgTable('payouts', {
  id: id(),
  /** Marketplace payouts — feature-flagged off until compliance review (spec §5.6). */
  creatorLedgerAccountId: uuid('creator_ledger_account_id')
    .notNull()
    .references(() => ledgerAccounts.id),
  amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
  status: text('status', { enum: ['pending', 'paid', 'failed'] })
    .default('pending')
    .notNull(),
  createdAt: createdAt(),
});
