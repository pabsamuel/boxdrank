import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { generateStripeTestSignature } from '@global-emotes/billing';
import { schema } from '@global-emotes/database';
import { eq } from 'drizzle-orm';
import { createTestApp, type TestApp } from './test-helpers';

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t.app.close();
  await t.close();
});

describe('health + openapi', () => {
  it('serves health and an OpenAPI 3.1 document', async () => {
    const health = await t.app.inject({ method: 'GET', url: '/v1/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ ok: true });
    const openapi = await t.app.inject({ method: 'GET', url: '/v1/openapi.json' });
    expect(openapi.json().openapi).toBe('3.1.0');
  });
});

describe('auth', () => {
  it('runs the magic-link flow end to end and sets a session', async () => {
    const cookie = await t.login('newfan@test.local');
    const me = await t.app.inject({ method: 'GET', url: '/v1/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ email: 'newfan@test.local', isAdmin: false });
  });

  it('rejects unauthenticated access with the error envelope', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/v1/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatchObject({ code: 'unauthorized' });
    expect(res.json().error.requestId).toBeTruthy();
  });

  it('magic-link tokens are single-use', async () => {
    await t.app.inject({
      method: 'POST',
      url: '/v1/auth/magic-link',
      payload: { email: 'single@test.local' },
    });
    const mail = [...t.sentEmails].reverse().find((m) => m.to === 'single@test.local');
    const token = mail!.text.match(/token=([A-Za-z0-9_-]+)/)![1];
    const first = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/verify',
      payload: { token },
    });
    expect(first.statusCode).toBe(200);
    const second = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/verify',
      payload: { token },
    });
    expect(second.statusCode).toBe(400);
  });
});

describe('creator journey: profile → upload → pack → publish', () => {
  let cookie: string;
  let creatorId: string;
  let emoteId: string;
  let packId: string;

  beforeAll(async () => {
    cookie = await t.login('newcreator@test.local');
  });

  it('creates a creator profile, rejecting reserved handles', async () => {
    const bad = await t.app.inject({
      method: 'POST',
      url: '/v1/creators',
      headers: { cookie },
      payload: { handle: 'admin', displayName: 'Nope' },
    });
    expect(bad.statusCode).toBe(400);

    const res = await t.app.inject({
      method: 'POST',
      url: '/v1/creators',
      headers: { cookie },
      payload: { handle: 'Test Creator!', displayName: 'Test Creator' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().handle).toBe('test-creator');
    creatorId = res.json().id;
  });

  it('uploads a real PNG through grant → content → emote, processed to active', async () => {
    const png = await sharp({
      create: {
        width: 128,
        height: 128,
        channels: 4,
        background: { r: 90, g: 60, b: 220, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const grantRes = await t.app.inject({
      method: 'POST',
      url: '/v1/uploads',
      headers: { cookie },
      payload: { fileName: 'hype.png', mimeType: 'image/png', bytes: png.length },
    });
    expect(grantRes.statusCode).toBe(200);
    const { grantId } = grantRes.json();

    const putRes = await t.app.inject({
      method: 'PUT',
      url: `/v1/uploads/${grantId}/content`,
      headers: { cookie, 'content-type': 'image/png' },
      payload: png,
    });
    expect(putRes.statusCode).toBe(200);

    const emoteRes = await t.app.inject({
      method: 'POST',
      url: `/v1/creators/${creatorId}/emotes`,
      headers: { cookie },
      payload: { name: 'Hype', shortcode: 'tcHype', uploadGrantId: grantId, tags: ['hype'] },
    });
    expect(emoteRes.statusCode).toBe(200);
    emoteId = emoteRes.json().id;

    // Inline test runner processed it: variants exist and emote is active.
    const emoteRows = await t.ctx.db
      .select()
      .from(schema.emotes)
      .where(eq(schema.emotes.id, emoteId));
    expect(emoteRows[0]!.status).toBe('active');
    expect(t.processedJobs.some((j) => j.queue === 'asset-processing')).toBe(true);
  });

  it('rejects MIME-spoofed uploads', async () => {
    const jpeg = await sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .toBuffer();
    const grantRes = await t.app.inject({
      method: 'POST',
      url: '/v1/uploads',
      headers: { cookie },
      payload: { fileName: 'fake.png', mimeType: 'image/png', bytes: jpeg.length },
    });
    const { grantId } = grantRes.json();
    await t.app.inject({
      method: 'PUT',
      url: `/v1/uploads/${grantId}/content`,
      headers: { cookie, 'content-type': 'image/png' },
      payload: jpeg,
    });
    const emoteRes = await t.app.inject({
      method: 'POST',
      url: `/v1/creators/${creatorId}/emotes`,
      headers: { cookie },
      payload: { name: 'Fake', shortcode: 'tcFake', uploadGrantId: grantId, tags: [] },
    });
    expect(emoteRes.statusCode).toBe(400);
  });

  it('creates a pack, attaches the emote, sets rules, publishes', async () => {
    const packRes = await t.app.inject({
      method: 'POST',
      url: `/v1/creators/${creatorId}/packs`,
      headers: { cookie },
      payload: { name: 'Test Pack' },
    });
    expect(packRes.statusCode).toBe(200);
    packId = packRes.json().id;

    // Publishing an empty pack fails.
    const emptyPublish = await t.app.inject({
      method: 'POST',
      url: `/v1/packs/${packId}/publish`,
      headers: { cookie },
    });
    expect(emptyPublish.statusCode).toBe(400);

    await t.app.inject({
      method: 'POST',
      url: `/v1/packs/${packId}/emotes`,
      headers: { cookie },
      payload: { emoteId, position: 0 },
    });
    const rulesRes = await t.app.inject({
      method: 'PUT',
      url: `/v1/packs/${packId}/rules`,
      headers: { cookie },
      payload: { rules: [{ kind: 'access_code', providerId: 'access_code' }] },
    });
    expect(rulesRes.statusCode).toBe(200);

    const publish = await t.app.inject({
      method: 'POST',
      url: `/v1/packs/${packId}/publish`,
      headers: { cookie },
    });
    expect(publish.statusCode).toBe(200);
    expect(publish.json()).toMatchObject({ published: true, version: 1 });
  });

  it('enforces authorization: another user cannot edit the pack', async () => {
    const otherCookie = await t.login('intruder@test.local');
    const res = await t.app.inject({
      method: 'PATCH',
      url: `/v1/packs/${packId}`,
      headers: { cookie: otherCookie },
      payload: { name: 'Hacked' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('serves the public pack page without auth', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/v1/public/creators/test-creator/packs/test-pack',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pack.accessSummary).toContain('access_code');
    expect(body.emotes).toHaveLength(1);
    expect(body.emotes[0].previewUrl).toContain('web_preview');
  });
});

describe('fan journey: codes + provider sync + manifest', () => {
  let fanCookie: string;

  beforeAll(async () => {
    fanCookie = await t.login('fan2@test.local');
  });

  it('redeems a seeded access code and unlocks the pack', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/v1/codes/redeem',
      headers: { cookie: fanCookie },
      payload: { code: t.seeded.accessCode.toLowerCase() }, // case-insensitive
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ unlocked: true, packId: t.seeded.packId });

    const entitlements = await t.app.inject({
      method: 'GET',
      url: '/v1/entitlements',
      headers: { cookie: fanCookie },
    });
    const items = entitlements.json().items;
    expect(
      items.some(
        (e: { packId: string; status: string }) =>
          e.packId === t.seeded.packId && e.status === 'active',
      ),
    ).toBe(true);
  });

  it('rejects double redemption and invalid codes', async () => {
    const again = await t.app.inject({
      method: 'POST',
      url: '/v1/codes/redeem',
      headers: { cookie: fanCookie },
      payload: { code: t.seeded.accessCode },
    });
    expect(again.statusCode).toBe(400);
    const bogus = await t.app.inject({
      method: 'POST',
      url: '/v1/codes/redeem',
      headers: { cookie: fanCookie },
      payload: { code: 'NOPE-NOPE-NOPE' },
    });
    expect(bogus.statusCode).toBe(400);
  });

  it('mock provider webhook grants an entitlement via the engine', async () => {
    // Link the fan to the mock provider account first.
    const userRow = await t.ctx.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.primaryEmail, 'fan2@test.local'));
    await t.ctx.db.insert(schema.externalFanAccounts).values({
      userId: userRow[0]!.id,
      providerId: 'mock',
      externalAccountId: 'mock-fan-1',
    });

    const res = await t.app.inject({
      method: 'POST',
      url: '/v1/webhooks/providers/mock',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        eventId: 'evt-100',
        fanId: 'mock-fan-1',
        creatorId: 'mock-broadcaster-1',
        tier: 'tier2',
        active: true,
      }),
    });
    expect(res.statusCode).toBe(200);

    const entitlements = await t.ctx.db
      .select()
      .from(schema.entitlements)
      .where(eq(schema.entitlements.userId, userRow[0]!.id));
    const viaMock = entitlements.filter((e) => e.providerId === 'mock');
    expect(viaMock.length).toBeGreaterThan(0);
    expect(viaMock[0]!.status).toBe('active');
    expect(viaMock[0]!.tier).toBe('tier2');
  });

  it('duplicate webhook deliveries are idempotent', async () => {
    const payload = JSON.stringify({
      eventId: 'evt-100',
      fanId: 'mock-fan-1',
      creatorId: 'mock-broadcaster-1',
      tier: 'tier2',
      active: true,
    });
    const res = await t.app.inject({
      method: 'POST',
      url: '/v1/webhooks/providers/mock',
      headers: { 'content-type': 'application/json' },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const events = await t.ctx.db
      .select()
      .from(schema.providerEvents)
      .where(eq(schema.providerEvents.externalEventId, 'evt-100'));
    expect(events).toHaveLength(1);
  });

  it('sync manifest contains unlocked packs with signed keyboard URLs', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/v1/sync/manifest',
      headers: { cookie: fanCookie },
    });
    expect(res.statusCode).toBe(200);
    const manifest = res.json();
    const packIds = manifest.packs.map((p: { packId: string }) => p.packId);
    expect(packIds).toContain(t.seeded.packId); // unlocked by code
    expect(packIds).toContain(t.seeded.publicPackId); // public rule
  });

  it('favorites and recents round-trip', async () => {
    const emoteRows = await t.ctx.db.select().from(schema.emotes).limit(1);
    const emoteId = emoteRows[0]!.id;
    await t.app.inject({
      method: 'POST',
      url: `/v1/favorites/${emoteId}`,
      headers: { cookie: fanCookie },
    });
    await t.app.inject({
      method: 'POST',
      url: `/v1/recents/${emoteId}`,
      headers: { cookie: fanCookie },
    });
    await t.app.inject({
      method: 'POST',
      url: `/v1/recents/${emoteId}`,
      headers: { cookie: fanCookie },
    });
    const favorites = await t.app.inject({
      method: 'GET',
      url: '/v1/favorites',
      headers: { cookie: fanCookie },
    });
    expect(favorites.json().items).toHaveLength(1);
    const recents = await t.app.inject({
      method: 'GET',
      url: '/v1/recents',
      headers: { cookie: fanCookie },
    });
    expect(recents.json().items[0].useCount).toBe(2);
  });
});

describe('billing', () => {
  it('creates a checkout session for a configured price', async () => {
    const cookie = await t.login('buyer@test.local');
    // Configure a price first (normally done via admin/seed).
    const productRows = await t.ctx.db
      .select()
      .from(schema.products)
      .where(eq(schema.products.key, 'creator_pro'));
    await t.ctx.db.insert(schema.prices).values({
      productId: productRows[0]!.id,
      stripePriceId: 'price_test_pro',
      currency: 'usd',
      unitAmount: 1200,
      interval: 'month',
    });
    const res = await t.app.inject({
      method: 'POST',
      url: '/v1/billing/checkout',
      headers: { cookie },
      payload: { productKey: 'creator_pro', interval: 'month' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().url).toContain('checkout');
  });

  it('processes signed Stripe webhooks idempotently and updates plans', async () => {
    const buyerRows = await t.ctx.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.primaryEmail, 'buyer@test.local'));
    const customers = await t.ctx.db
      .select()
      .from(schema.billingCustomers)
      .where(eq(schema.billingCustomers.userId, buyerRows[0]!.id));
    const stripeCustomerId = customers[0]!.stripeCustomerId;

    const event = JSON.stringify({
      id: 'evt_sub_1',
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_test_1',
          customer: stripeCustomerId,
          status: 'active',
          cancel_at_period_end: false,
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
          items: { data: [{ price: { lookup_key: 'fan_plus' } }] },
        },
      },
    });
    const signature = generateStripeTestSignature(event, t.ctx.env.STRIPE_WEBHOOK_SECRET || '');

    // Unsigned request is rejected.
    const unsigned = await t.app.inject({
      method: 'POST',
      url: '/v1/webhooks/stripe',
      headers: { 'content-type': 'application/json' },
      payload: event,
    });
    expect(unsigned.statusCode).toBeGreaterThanOrEqual(400);

    const first = await t.app.inject({
      method: 'POST',
      url: '/v1/webhooks/stripe',
      headers: { 'content-type': 'application/json', 'stripe-signature': signature },
      payload: event,
    });
    expect(first.statusCode).toBe(200);
    const second = await t.app.inject({
      method: 'POST',
      url: '/v1/webhooks/stripe',
      headers: { 'content-type': 'application/json', 'stripe-signature': signature },
      payload: event,
    });
    expect(second.json()).toMatchObject({ duplicate: true });

    const updated = await t.ctx.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, buyerRows[0]!.id));
    expect(updated[0]!.fanPlan).toBe('fan_plus');
  });
});

describe('admin', () => {
  it('requires admin role and a reason for destructive actions', async () => {
    const fanCookie = await t.login('fan2@test.local');
    const denied = await t.app.inject({
      method: 'GET',
      url: '/v1/admin/overview',
      headers: { cookie: fanCookie },
    });
    expect(denied.statusCode).toBe(403);

    const adminCookie = await t.login('admin@demo.local');
    const overview = await t.app.inject({
      method: 'GET',
      url: '/v1/admin/overview',
      headers: { cookie: adminCookie },
    });
    expect(overview.statusCode).toBe(200);
    expect(overview.json().creators).toBeGreaterThan(0);

    const noReason = await t.app.inject({
      method: 'POST',
      url: `/v1/admin/packs/${t.seeded.packId}/suspend`,
      headers: { cookie: adminCookie },
      payload: {},
    });
    expect(noReason.statusCode).toBe(400);

    const suspended = await t.app.inject({
      method: 'POST',
      url: `/v1/admin/packs/${t.seeded.packId}/suspend`,
      headers: { cookie: adminCookie },
      payload: { reason: 'test takedown' },
    });
    expect(suspended.statusCode).toBe(200);
    const actions = await t.ctx.db.select().from(schema.adminActions);
    expect(actions.some((a) => a.action === 'pack.suspended' && a.reason === 'test takedown')).toBe(
      true,
    );
  });

  it('shows integration health with honest statuses', async () => {
    const adminCookie = await t.login('admin@demo.local');
    const res = await t.app.inject({
      method: 'GET',
      url: '/v1/admin/integrations',
      headers: { cookie: adminCookie },
    });
    const items = res.json().items;
    const twitch = items.find((i: { id: string }) => i.id === 'twitch');
    expect(twitch.capabilities.status).toBe('credentials_required');
    const youtube = items.find((i: { id: string }) => i.id === 'youtube');
    expect(youtube.capabilities.status).toBe('approval_required');
  });
});

describe('abuse throttling', () => {
  it('rate-limits magic-link requests per IP', async () => {
    let lastStatus = 0;
    for (let i = 0; i < 7; i++) {
      const res = await t.app.inject({
        method: 'POST',
        url: '/v1/auth/magic-link',
        payload: { email: 'flood@test.local' },
        remoteAddress: '10.99.99.99',
      });
      lastStatus = res.statusCode;
    }
    expect(lastStatus).toBe(429);
  });
});

describe('analytics privacy boundary', () => {
  it('accepts allowlisted events and rejects content smuggling', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/v1/analytics/events',
      payload: {
        events: [
          { name: 'keyboard_opened', props: { platform: 'android' } },
          { name: 'typed_text', props: { text: 'private message' } },
          { name: 'emote_selected', props: { messageBody: 'secret' } },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ accepted: 1, rejected: 2 });
  });
});
