import { MondayClient } from '../api/client.js';
import { TemplateGuardError } from '../api/errors.js';
import type { AccountPlan } from './tiers.js';
import {
  SubscriptionError,
  parseSubscriptionEvent,
  planFromEvent,
  verifySubscriptionToken,
} from './subscription.js';

/**
 * monday's lifecycle and billing webhook, decided without trusting it.
 *
 * Three platform facts shape this (apps/docs/webhooks-1; Automation Watchdog,
 * which runs the same flow live, 28 Sep 2026):
 *
 *  1. The request carries a JWT in `Authorization` signed with the app's
 *     **Client Secret**. The Signing Secret is also accepted, so a platform
 *     change fails safe instead of dropping every uninstall.
 *  2. The event itself — `type`, `data.account_id`, the subscription — is in
 *     the **body**, which the signature does not cover.
 *  3. The board view's session token is signed with the *same* Client Secret.
 *     So a valid signature proves only "someone with a session for some
 *     account", not "monday sent this". Any user could post a forged
 *     "uninstall" or "subscription created" naming an account.
 *
 * So nothing in the body is acted on as-is:
 *  - The signed claims, where they name an account, must match the body.
 *  - **Uninstall** deletes only once monday confirms the stored token is dead
 *    (tokens are valid "until the user uninstalls"). A forged uninstall against
 *    a live install changes nothing; an unconfirmable one is retried.
 *  - **Subscription events** never carry the plan into storage. The plan is
 *    read back from monday's `app_subscription` with the account's own token,
 *    so a forged "subscription created" cannot grant Pro.
 */

export interface WebhookStorage {
  getInstall(accountId: string): Promise<{ encryptedToken: string } | null>;
  savePlan(plan: AccountPlan): Promise<void>;
  deleteAccount(accountId: string): Promise<void>;
}

export interface WebhookDeps {
  storage: WebhookStorage;
  decrypt: (encryptedToken: string) => string;
  clientSecret: string;
  signingSecret: string;
  paidPlanIds?: string[];
  /** Injectable for tests; the real one talks to monday. */
  clientFor?: (token: string) => Pick<MondayClient, 'request'>;
  nowSeconds?: number;
  log?: (line: string) => void;
}

export interface WebhookOutcome {
  status: number;
  body: Record<string, unknown>;
}

type TokenState = 'alive' | 'dead' | 'unknown';

async function tokenState(client: Pick<MondayClient, 'request'>): Promise<TokenState> {
  try {
    const { data, errors } = await client.request<{ me?: { id?: string | null } | null }>('query { me { id } }');
    if (data?.me?.id != null) return 'alive';
    const codes = errors.map((e) => (e as { extensions?: { code?: string } }).extensions?.code);
    return codes.includes('NOT_AUTHENTICATED') || codes.includes('UNAUTHORIZED') ? 'dead' : 'unknown';
  } catch (err) {
    return err instanceof TemplateGuardError && err.kind === 'permission_denied' ? 'dead' : 'unknown';
  }
}

async function subscriptionFromMonday(
  client: Pick<MondayClient, 'request'>,
): Promise<{ plan_id?: string | null; is_trial?: boolean }[] | null> {
  try {
    const { data, errors } = await client.request<{
      app_subscription?: { plan_id?: string | null; is_trial?: boolean }[] | null;
    }>('query { app_subscription { plan_id is_trial } }');
    if (errors.length > 0 || !Array.isArray(data?.app_subscription)) return null;
    return data.app_subscription;
  } catch {
    return null;
  }
}

function claimedAccount(claims: Record<string, unknown>): string | null {
  const dat = claims.dat as { account_id?: unknown } | undefined;
  const data = claims.data as { account_id?: unknown } | undefined;
  const v = claims.accountId ?? claims.account_id ?? dat?.account_id ?? data?.account_id;
  return v == null ? null : String(v);
}

export async function handleLifecycleWebhook(
  authorization: string | undefined,
  rawBody: unknown,
  deps: WebhookDeps,
): Promise<WebhookOutcome> {
  const log = deps.log ?? ((line: string) => console.log(line));
  const body = (rawBody ?? {}) as Record<string, unknown>;

  if (typeof body.challenge === 'string') return { status: 200, body: { challenge: body.challenge } };

  const token =
    (typeof body.token === 'string' ? body.token : undefined) ?? authorization?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { status: 401, body: { error: 'Webhook carried no token.', kind: 'unverified' } };

  let claims: Record<string, unknown>;
  try {
    try {
      claims = verifySubscriptionToken(token, deps.clientSecret);
    } catch {
      claims = verifySubscriptionToken(token, deps.signingSecret);
    }
  } catch (err) {
    return { status: 401, body: { error: err instanceof Error ? err.message : 'unverified', kind: 'unverified' } };
  }
  const now = deps.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (typeof claims.exp === 'number' && claims.exp < now) {
    return { status: 401, body: { error: 'Webhook token has expired.', kind: 'unverified' } };
  }

  let event;
  try {
    // The event is in the body. Older payloads that carried it inside the
    // signed token are still understood.
    event = parseSubscriptionEvent(typeof body.type === 'string' ? body : claims);
  } catch (err) {
    if (err instanceof SubscriptionError) {
      return { status: 400, body: { error: err.message, kind: err.reason } };
    }
    throw err;
  }

  const claimed = claimedAccount(claims);
  if (claimed !== null && claimed !== event.accountId) {
    return { status: 401, body: { error: 'Webhook account does not match its signature.', kind: 'unverified' } };
  }

  const install = await deps.storage.getInstall(event.accountId);
  const clientFor = deps.clientFor ?? ((t: string) => new MondayClient({ token: t }));

  if (event.type === 'install') return { status: 200, body: { ok: true } };

  if (event.type === 'uninstall') {
    if (install) {
      const state = await tokenState(clientFor(deps.decrypt(install.encryptedToken)));
      if (state === 'alive') {
        log(`[template-guard] uninstall ignored for account=${event.accountId}: its token still works`);
        return { status: 200, body: { ok: true, purged: false } };
      }
      if (state === 'unknown') {
        // Asked to be sent again rather than guessing. A stale record costs a
        // failed sweep; a live install deleted costs the customer their data.
        return { status: 503, body: { error: 'Could not confirm the uninstall with monday yet.' } };
      }
    }
    await deps.storage.deleteAccount(event.accountId);
    log(`[template-guard] uninstall account=${event.accountId} -> purged`);
    return { status: 200, body: { ok: true, purged: true } };
  }

  // Subscription events: the plan comes from monday, never from the body.
  if (!install) {
    log(`[template-guard] subscription ${event.type} for account=${event.accountId} with no install; ignored`);
    return { status: 200, body: { ok: true, ignored: true } };
  }
  const subs = await subscriptionFromMonday(clientFor(deps.decrypt(install.encryptedToken)));
  if (subs === null) {
    return { status: 503, body: { error: 'Could not read the subscription from monday yet.' } };
  }
  const active = subs[0];
  const plan = active
    ? planFromEvent(
        {
          type: active.is_trial ? 'app_trial_subscription_started' : 'app_subscription_changed',
          accountId: event.accountId,
          planId: active.plan_id ?? null,
          renewsAt: null,
          isTrial: active.is_trial === true,
        },
        deps.paidPlanIds ?? [],
      )
    : { accountId: event.accountId, planId: 'free' as const, renewsAt: null };
  await deps.storage.savePlan(plan);
  log(`[template-guard] subscription ${event.type} account=${event.accountId} -> ${plan.planId} (read from monday)`);
  return { status: 200, body: { ok: true, plan: plan.planId } };
}
