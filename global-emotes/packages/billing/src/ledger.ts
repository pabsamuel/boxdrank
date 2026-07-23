/**
 * Double-entry ledger invariants (master spec §5.6, IP-08). The database rows
 * are written by the API/worker; this module guarantees a transaction balances
 * before anything is persisted. Never rely on a single mutable balance number.
 */

export interface LedgerEntryInput {
  accountKey: string;
  amountMinor: number;
  currency: string;
}

export interface LedgerTransactionInput {
  description: string;
  kind:
    | 'gross_sale'
    | 'tax'
    | 'payment_fee'
    | 'commission'
    | 'creator_payable'
    | 'refund'
    | 'chargeback'
    | 'payout'
    | 'subscription_revenue';
  externalRef?: string;
  entries: LedgerEntryInput[];
}

export class LedgerInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerInvariantError';
  }
}

export function validateLedgerTransaction(tx: LedgerTransactionInput): void {
  if (tx.entries.length < 2) {
    throw new LedgerInvariantError('a transaction needs at least two entries');
  }
  const currencies = new Set(tx.entries.map((e) => e.currency));
  if (currencies.size > 1) {
    throw new LedgerInvariantError('mixed currencies in one transaction');
  }
  for (const entry of tx.entries) {
    if (!Number.isInteger(entry.amountMinor)) {
      throw new LedgerInvariantError('amounts must be integer minor units');
    }
    if (entry.amountMinor === 0) {
      throw new LedgerInvariantError('zero-amount entries are not allowed');
    }
  }
  const sum = tx.entries.reduce((total, e) => total + e.amountMinor, 0);
  if (sum !== 0) {
    throw new LedgerInvariantError(`entries must sum to zero (got ${sum})`);
  }
}

/** Convenience builder: a subscription payment recorded as revenue. */
export function subscriptionRevenueTransaction(input: {
  invoiceId: string;
  amountMinor: number;
  currency: string;
  productKey: string;
}): LedgerTransactionInput {
  return {
    description: `subscription revenue ${input.productKey} invoice ${input.invoiceId}`,
    kind: 'subscription_revenue',
    externalRef: input.invoiceId,
    entries: [
      { accountKey: 'platform:cash', amountMinor: input.amountMinor, currency: input.currency },
      { accountKey: 'platform:revenue', amountMinor: -input.amountMinor, currency: input.currency },
    ],
  };
}
