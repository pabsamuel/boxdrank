import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  SubscriptionError,
  parseSubscriptionEvent,
  planFromEvent,
  resolvePlanId,
  verifySubscriptionToken,
} from '../src/billing/subscription.js';
import { FallbackSink, WebhookSink } from '../src/drift/sinks.js';
import { canUseOneClickRepair } from '../src/billing/tiers.js';
import { requiredScopes } from '../src/server/oauth.js';
import type { DriftNotification } from '../src/drift/scheduler.js';

const SECRET = 'signing-secret';

function signedToken(payload: Record<string, unknown>, secret = SECRET, alg = 'HS256'): string {
  const header = Buffer.from(JSON.stringify({ alg, typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

describe('verifySubscriptionToken', () => {
  it('returns the payload of a correctly signed token', () => {
    const token = signedToken({ type: 'app_subscription_created', data: { account_id: '1' } });
    expect(verifySubscriptionToken(token, SECRET)).toMatchObject({ type: 'app_subscription_created' });
  });

  it('rejects a token signed with another secret', () => {
    const token = signedToken({ type: 'install' }, 'someone-elses-secret');
    expect(() => verifySubscriptionToken(token, SECRET)).toThrow(/does not verify/);
  });

  it('rejects a token that declares a different algorithm', () => {
    // Letting the token choose the verification scheme is the alg:none family
    // of attacks. The endpoint writes plan state, so this is the boundary.
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ type: 'app_subscription_created' })).toString('base64url');
    expect(() => verifySubscriptionToken(`${header}.${body}.`, SECRET)).toThrow(/Only HS256/);
  });

  it('rejects anything that is not a JWT', () => {
    expect(() => verifySubscriptionToken('not-a-token', SECRET)).toThrow(SubscriptionError);
  });

  it('rejects a tampered payload', () => {
    const token = signedToken({ type: 'install', data: { account_id: '1' } });
    const [h, , s] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ type: 'app_subscription_created' })).toString('base64url');
    expect(() => verifySubscriptionToken(`${h}.${forged}.${s}`, SECRET)).toThrow(/does not verify/);
  });
});

describe('parseSubscriptionEvent', () => {
  it('reads an account id from either nesting level', () => {
    expect(parseSubscriptionEvent({ type: 'install', data: { account_id: '42' } }).accountId).toBe('42');
    expect(parseSubscriptionEvent({ type: 'install', account_id: '43' }).accountId).toBe('43');
  });

  it('reads plan and renewal from the subscription object', () => {
    const event = parseSubscriptionEvent({
      type: 'app_subscription_created',
      data: {
        account_id: '42',
        subscription: { plan_id: 'pro_monthly', renewal_date: '2026-10-20T00:00:00Z', is_trial: false },
      },
    });
    expect(event).toMatchObject({ planId: 'pro_monthly', renewsAt: '2026-10-20T00:00:00Z', isTrial: false });
  });

  it('refuses an unrecognised event rather than treating it as a no-op', () => {
    // A no-op on an unknown event means billing a customer who cancelled, or
    // serving paid features to one who did.
    expect(() => parseSubscriptionEvent({ type: 'app_subscription_exploded', data: { account_id: '1' } })).toThrow(
      /refuses to guess/,
    );
  });

  it('refuses an event with no account id', () => {
    expect(() => parseSubscriptionEvent({ type: 'install' })).toThrow(/no account id/);
  });
});

describe('planFromEvent', () => {
  const account = { account_id: '42' };

  it('grants Pro on a new subscription', () => {
    const event = parseSubscriptionEvent({ type: 'app_subscription_created', data: account });
    expect(planFromEvent(event).planId).toBe('pro');
  });

  it('grants Pro for a trial — a trial that cannot run the audit is not a trial', () => {
    const event = parseSubscriptionEvent({ type: 'app_trial_subscription_started', data: account });
    expect(planFromEvent(event).planId).toBe('pro');
  });

  it.each([
    'app_subscription_cancelled',
    'app_subscription_cancelled_by_user',
    'app_trial_subscription_ended',
    'uninstall',
  ])('downgrades on %s', (type) => {
    const event = parseSubscriptionEvent({ type, data: account });
    expect(planFromEvent(event).planId).toBe('free');
  });

  it('does not treat an install as a purchase', () => {
    const event = parseSubscriptionEvent({ type: 'install', data: account });
    expect(planFromEvent(event).planId).toBe('free');
  });

  it('resolves an unknown plan id downward once plan ids are configured', () => {
    const event = parseSubscriptionEvent({
      type: 'app_subscription_created',
      data: { ...account, subscription: { plan_id: 'mystery_tier' } },
    });
    // Serving Pro to an account that stopped paying is a bug nobody finds.
    expect(planFromEvent(event, ['pro_monthly', 'pro_yearly']).planId).toBe('free');
    expect(planFromEvent(event, []).planId).toBe('pro');
  });
});

describe('resolvePlanId', () => {
  it('grants Pro to any subscription before the console is configured', () => {
    expect(resolvePlanId(null, [])).toBe('pro');
  });

  it('requires a match once ids are known', () => {
    expect(resolvePlanId('pro_monthly', ['pro_monthly'])).toBe('pro');
    expect(resolvePlanId(null, ['pro_monthly'])).toBe('free');
  });
});

describe('notification sinks', () => {
  const notification: DriftNotification = {
    accountId: 'acct-1',
    templateBoardId: '1',
    copyBoardId: '2',
    message: 'drifted',
    severity: 'miswired',
  };

  it('WebhookSink posts the alert and carries no item data', async () => {
    let sent: { url: string; body: unknown } | null = null;
    const sink = new WebhookSink(
      async () => 'https://hooks.example.com/tg',
      (async (url: string, init: { body: string }) => {
        sent = { url, body: JSON.parse(init.body) };
        return { ok: true, status: 200 };
      }) as unknown as typeof fetch,
    );

    await sink.deliver(notification);

    expect(sent!.url).toBe('https://hooks.example.com/tg');
    expect(sent!.body).toMatchObject({ source: 'template-guard', severity: 'miswired', copyBoardId: '2' });
    expect(JSON.stringify(sent!.body)).not.toMatch(/item/i);
  });

  it('WebhookSink throws on a non-2xx so the sweep records it', async () => {
    const sink = new WebhookSink(
      async () => 'https://hooks.example.com/tg',
      (async () => ({ ok: false, status: 500 })) as unknown as typeof fetch,
    );
    await expect(sink.deliver(notification)).rejects.toThrow(/responded 500/);
  });

  it('WebhookSink throws when no URL is configured rather than returning quietly', async () => {
    const sink = new WebhookSink(async () => null);
    await expect(sink.deliver(notification)).rejects.toThrow(/No webhook URL/);
  });

  it('FallbackSink succeeds if any channel does', async () => {
    let delivered = false;
    const sink = new FallbackSink([
      { deliver: async () => { throw new Error('monday is down'); } },
      { deliver: async () => { delivered = true; } },
    ]);

    await sink.deliver(notification);
    expect(delivered).toBe(true);
  });

  it('FallbackSink reports every reason when all channels fail', async () => {
    const sink = new FallbackSink([
      { deliver: async () => { throw new Error('monday is down'); } },
      { deliver: async () => { throw new Error('webhook timed out'); } },
    ]);

    await expect(sink.deliver(notification)).rejects.toThrow(/monday is down.*webhook timed out/);
  });

  it('FallbackSink with no channels says so rather than silently succeeding', async () => {
    await expect(new FallbackSink([]).deliver(notification)).rejects.toThrow(/No delivery channel/);
  });
});

describe('one-click repair is not in v1 (ADR-025)', () => {
  const pro = { accountId: '1', planId: 'pro' as const, renewsAt: null };
  const free = { accountId: '1', planId: 'free' as const, renewsAt: null };

  it('refuses even a Pro account when the feature is off', () => {
    const gate = canUseOneClickRepair(pro);
    expect(gate.allowed).toBe(false);
    expect('reason' in gate && gate.reason).toMatch(/not part of this release/);
  });

  it('does not upsell something nobody can buy', () => {
    // "Upgrade for this" about a capability that does not ship is a lie with
    // a price tag on it.
    const gate = canUseOneClickRepair(free);
    expect('upsell' in gate && gate.upsell).toBe('');
  });

  it('still gates by plan when the feature is switched on', () => {
    expect(canUseOneClickRepair(pro, true).allowed).toBe(true);
    expect(canUseOneClickRepair(free, true).allowed).toBe(false);
  });
});

describe('requested OAuth scopes follow the feature flag', () => {
  it('asks for no write permission in v1', () => {
    const scopes = requiredScopes(false);
    expect(scopes).toEqual(['boards:read', 'account:read', 'me:read']);
    // The strongest sentence available at security review: we could not write
    // to your boards if we wanted to.
    expect(scopes).not.toContain('boards:write');
  });

  it('adds boards:write only when one-click repair is enabled', () => {
    expect(requiredScopes(true)).toContain('boards:write');
  });

  it('never requests item, update or file access either way', () => {
    for (const scopes of [requiredScopes(false), requiredScopes(true)]) {
      expect(scopes.join(' ')).not.toMatch(/items|updates|assets|files/);
    }
  });
});
