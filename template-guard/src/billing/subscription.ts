import crypto from 'node:crypto';
import type { AccountPlan, PlanId } from './tiers.js';

/**
 * monday marketplace billing, on the receiving end.
 *
 * monday collects the money. This app never sees a card, never stores a
 * billing address, and has no payment form — which is the single largest
 * reduction in security-review surface available to a marketplace app, and it
 * is free. What arrives here is a signed webhook saying "this account is now
 * on this plan."
 *
 * The rule that shapes this file: **a subscription event may only ever be
 * trusted if its signature verifies.** Plan state decides who gets paid
 * features. An unauthenticated endpoint that writes plan state is an endpoint
 * that hands out the product, so an unverifiable payload is rejected before
 * anything is parsed out of it.
 *
 * ✱ UNVERIFIED — the exact event names and payload field spellings monday
 * sends. They are read defensively (several spellings, all optional) and an
 * unrecognised event is rejected loudly rather than guessed at. Verify against
 * a real subscription before launch; the parse is one function.
 */

export type SubscriptionEventType =
  | 'app_subscription_created'
  | 'app_subscription_changed'
  | 'app_subscription_renewed'
  | 'app_subscription_cancelled_by_user'
  | 'app_subscription_cancelled'
  | 'app_trial_subscription_started'
  | 'app_trial_subscription_ended'
  | 'install'
  | 'uninstall';

export interface SubscriptionEvent {
  type: SubscriptionEventType;
  accountId: string;
  /** monday's plan identifier, as configured in the developer console. */
  planId: string | null;
  renewsAt: string | null;
  isTrial: boolean;
}

export class SubscriptionError extends Error {
  constructor(
    message: string,
    readonly reason: 'unverified' | 'malformed' | 'unknown_event',
  ) {
    super(message);
    this.name = 'SubscriptionError';
  }
}

/**
 * Verifies monday's signed webhook JWT and returns its payload.
 *
 * Two checks that are easy to omit and expensive to omit:
 *
 *  - The algorithm is pinned to HS256 from the header. Accepting whatever the
 *    token declares is the `alg: none` family of attacks, where the attacker
 *    picks the verification scheme.
 *  - The comparison is `timingSafeEqual`. A plain `===` on a signature leaks
 *    it a byte at a time to anyone patient.
 */
export function verifySubscriptionToken(token: string, signingSecret: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new SubscriptionError('Subscription webhook token is not a JWT.', 'unverified');
  }
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  let header: { alg?: string };
  try {
    header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as { alg?: string };
  } catch {
    throw new SubscriptionError('Subscription webhook token header is unreadable.', 'unverified');
  }
  if (header.alg !== 'HS256') {
    throw new SubscriptionError(
      `Subscription webhook token declares alg "${header.alg}". Only HS256 is accepted.`,
      'unverified',
    );
  }

  const expected = crypto
    .createHmac('sha256', signingSecret)
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  const actual = Buffer.from(signatureB64, 'base64url');

  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw new SubscriptionError('Subscription webhook signature does not verify.', 'unverified');
  }

  try {
    return JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new SubscriptionError('Subscription webhook payload is unreadable.', 'malformed');
  }
}

const KNOWN_EVENTS = new Set<SubscriptionEventType>([
  'app_subscription_created',
  'app_subscription_changed',
  'app_subscription_renewed',
  'app_subscription_cancelled_by_user',
  'app_subscription_cancelled',
  'app_trial_subscription_started',
  'app_trial_subscription_ended',
  'install',
  'uninstall',
]);

function firstString(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value !== '') return value;
    if (typeof value === 'number') return String(value);
  }
  return null;
}

/** Narrows a verified payload into the fields this app acts on. */
export function parseSubscriptionEvent(payload: Record<string, unknown>): SubscriptionEvent {
  const data = (payload.data ?? payload) as Record<string, unknown>;
  const type = firstString(payload, ['type', 'event_type', 'notification_type']);

  if (!type || !KNOWN_EVENTS.has(type as SubscriptionEventType)) {
    // Not silently ignored. An event type we do not recognise may be the one
    // that cancels a subscription, and treating it as a no-op means billing a
    // customer who cancelled — or, worse, serving paid features to one who did.
    throw new SubscriptionError(
      `Unrecognised subscription event "${type ?? '(none)'}". Template Guard refuses to guess what it means for the account's plan.`,
      'unknown_event',
    );
  }

  const subscription = (data.subscription ?? data) as Record<string, unknown>;
  const accountId = firstString(data, ['account_id', 'accountId']) ?? firstString(payload, ['account_id', 'accountId']);
  if (!accountId) {
    throw new SubscriptionError('Subscription event carries no account id.', 'malformed');
  }

  return {
    type: type as SubscriptionEventType,
    accountId,
    planId: firstString(subscription, ['plan_id', 'planId', 'pricing_version_id']),
    renewsAt: firstString(subscription, ['renewal_date', 'renewalDate', 'billing_period_end']),
    isTrial: subscription.is_trial === true || data.is_trial === true,
  };
}

/**
 * Turns an event into the plan the account should now have.
 *
 * Where it is ambiguous, it resolves **downward**. Serving Pro to an account
 * that stopped paying is a bug we would never find; serving Free to an account
 * that is paying is a bug that gets reported within the hour, with a support
 * conversation that ends in an apology rather than an accounting problem.
 *
 * Trials get the full Pro feature set. A trial of an auditing tool that cannot
 * run the scheduled audit is not a trial of anything.
 */
export function planFromEvent(event: SubscriptionEvent, knownPaidPlanIds: string[] = []): AccountPlan {
  const downgrade: AccountPlan = { accountId: event.accountId, planId: 'free', renewsAt: null };

  switch (event.type) {
    case 'uninstall':
    case 'app_subscription_cancelled':
    case 'app_subscription_cancelled_by_user':
    case 'app_trial_subscription_ended':
      return downgrade;

    case 'install':
      // Installing is not buying. monday sends a subscription event separately
      // when money is involved.
      return downgrade;

    case 'app_trial_subscription_started':
      return { accountId: event.accountId, planId: 'pro', renewsAt: event.renewsAt };

    case 'app_subscription_created':
    case 'app_subscription_changed':
    case 'app_subscription_renewed': {
      const planId = resolvePlanId(event.planId, knownPaidPlanIds);
      return { accountId: event.accountId, planId, renewsAt: event.renewsAt };
    }
  }
}

/**
 * Maps monday's plan identifier to ours.
 *
 * When `knownPaidPlanIds` is configured, only those grant Pro — an unfamiliar
 * id resolves to Free. When it is empty (before the console is configured),
 * any subscription event grants Pro, because at that point the *existence* of
 * a subscription is the only signal there is.
 */
export function resolvePlanId(mondayPlanId: string | null, knownPaidPlanIds: string[]): PlanId {
  if (knownPaidPlanIds.length === 0) return 'pro';
  if (!mondayPlanId) return 'free';
  return knownPaidPlanIds.includes(mondayPlanId) ? 'pro' : 'free';
}
