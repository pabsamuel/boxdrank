import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { TemplateGuardError } from '../src/api/errors.js';
import type { MondayClient } from '../src/api/client.js';
import type { AccountPlan } from '../src/billing/tiers.js';
import { handleLifecycleWebhook, type WebhookDeps } from '../src/billing/webhook.js';

const CLIENT = 'client-secret';
const SIGNING = 'signing-secret';

function jwt(payload: Record<string, unknown>, secret = CLIENT): string {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const s = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${s}`;
}

type Answer = { data?: unknown; errors?: unknown[] } | Error;

function world(opts: { installed?: boolean; answers?: Record<string, Answer> } = {}) {
  const deleted: string[] = [];
  const plans: AccountPlan[] = [];
  const answers = opts.answers ?? {};
  const client = {
    request: async (query: string) => {
      const key = Object.keys(answers).find((k) => query.includes(k));
      const a = key ? answers[key] : { data: {} };
      if (a instanceof Error) throw a;
      return { data: a?.data, errors: a?.errors ?? [] };
    },
  } as unknown as Pick<MondayClient, 'request'>;
  const deps: WebhookDeps = {
    storage: {
      getInstall: async () => (opts.installed === false ? null : { encryptedToken: 'enc' }),
      savePlan: async (p) => void plans.push(p),
      deleteAccount: async (id) => void deleted.push(id),
    },
    decrypt: () => 'token',
    clientSecret: CLIENT,
    signingSecret: SIGNING,
    paidPlanIds: ['pro-plan'],
    clientFor: () => client,
    nowSeconds: 1,
    log: () => {},
  };
  return { deps, deleted, plans };
}

const bearer = (claims: Record<string, unknown>, secret = CLIENT) => `Bearer ${jwt(claims, secret)}`;
const uninstall = { type: 'uninstall', data: { account_id: 42 } };
const created = { type: 'app_subscription_created', data: { account_id: 42, subscription: { plan_id: 'pro-plan' } } };

describe('lifecycle webhook', () => {
  it('echoes the URL-verification challenge', async () => {
    const { deps } = world();
    expect((await handleLifecycleWebhook(undefined, { challenge: 'x' }, deps)).body).toEqual({ challenge: 'x' });
  });

  it('accepts the Client Secret, which is what monday signs webhooks with', async () => {
    const dead = new TemplateGuardError('401', 'permission_denied');
    const { deps, deleted } = world({ answers: { me: dead } });
    const out = await handleLifecycleWebhook(bearer({ accountId: 42 }), uninstall, deps);
    expect(out.status).toBe(200);
    expect(deleted).toEqual(['42']);
  });

  it('refuses a token signed with neither secret', async () => {
    const { deps, deleted } = world();
    const out = await handleLifecycleWebhook(bearer({}, 'someone-else'), uninstall, deps);
    expect(out.status).toBe(401);
    expect(deleted).toEqual([]);
  });

  it('refuses a body naming another account than the signed claims', async () => {
    const { deps, deleted } = world({ answers: { me: new TemplateGuardError('401', 'permission_denied') } });
    const out = await handleLifecycleWebhook(bearer({ dat: { account_id: 7 } }), uninstall, deps);
    expect(out.status).toBe(401);
    expect(deleted).toEqual([]);
  });

  it('ignores a forged uninstall while the stored token still works', async () => {
    const { deps, deleted } = world({ answers: { me: { data: { me: { id: '5' } } } } });
    const out = await handleLifecycleWebhook(bearer({}), uninstall, deps);
    expect(out.body).toMatchObject({ purged: false });
    expect(deleted).toEqual([]);
  });

  it('asks to be retried when monday cannot confirm the uninstall', async () => {
    const { deps, deleted } = world({ answers: { me: new TemplateGuardError('down', 'transport') } });
    const out = await handleLifecycleWebhook(bearer({}), uninstall, deps);
    expect(out.status).toBe(503);
    expect(deleted).toEqual([]);
  });

  it('reads the plan from monday, so a forged "subscription created" cannot grant Pro', async () => {
    const { deps, plans } = world({ answers: { app_subscription: { data: { app_subscription: [] } } } });
    const out = await handleLifecycleWebhook(bearer({}), created, deps);
    expect(out.status).toBe(200);
    expect(plans).toEqual([{ accountId: '42', planId: 'free', renewsAt: null }]);
  });

  it('grants Pro when monday confirms a paid subscription', async () => {
    const { deps, plans } = world({
      answers: { app_subscription: { data: { app_subscription: [{ plan_id: 'pro-plan', is_trial: false }] } } },
    });
    await handleLifecycleWebhook(bearer({}), created, deps);
    expect(plans[0]?.planId).toBe('pro');
  });

  it('asks to be retried when the subscription cannot be read', async () => {
    const { deps, plans } = world({ answers: { app_subscription: { errors: [{ message: 'nope' }] } } });
    const out = await handleLifecycleWebhook(bearer({}), created, deps);
    expect(out.status).toBe(503);
    expect(plans).toEqual([]);
  });

  it('rejects an event type it does not know', async () => {
    const { deps } = world();
    const out = await handleLifecycleWebhook(bearer({}), { type: 'mystery', data: { account_id: 42 } }, deps);
    expect(out.status).toBe(400);
  });
});
