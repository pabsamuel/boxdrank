import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { loadEnv, resetEnvCache } from '@global-emotes/config';
import { createTestDb, asDb } from '@global-emotes/database/testing';
import { seed } from '@global-emotes/database/seed';
import { schema, type Db } from '@global-emotes/database';
import { eq } from 'drizzle-orm';
import { MemoryObjectStorage } from '@global-emotes/asset-pipeline';
import { createProviderRegistry } from '@global-emotes/provider-sdk';
import type { EmailMessage } from '@global-emotes/notifications';
import {
  handleAssetProcessing,
  handleCleanup,
  handleEntitlementSweep,
  type HandlerDeps,
} from './handlers';

let db: Db;
let close: () => Promise<void>;
let deps: HandlerDeps;
let sentEmails: EmailMessage[];
let seeded: Awaited<ReturnType<typeof seed>>;

const NOW = new Date('2026-07-23T12:00:00Z');

beforeAll(async () => {
  resetEnvCache();
  const env = loadEnv({ NODE_ENV: 'test' });
  const t = await createTestDb();
  db = asDb(t.db);
  close = t.close;
  seeded = await seed(t.db as never);
  sentEmails = [];
  deps = {
    env,
    db,
    storage: new MemoryObjectStorage(),
    providers: createProviderRegistry(env),
    email: {
      async send(m) {
        sentEmails.push(m);
      },
    },
    now: () => NOW,
  };
});

afterAll(async () => {
  await close();
});

describe('asset processing handler', () => {
  it('processes a queued upload end to end and is idempotent', async () => {
    const png = await sharp({
      create: {
        width: 96,
        height: 96,
        channels: 4,
        background: { r: 255, g: 128, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    await deps.storage.put(deps.env.S3_BUCKET_QUARANTINE, 'incoming/test/e1', png, 'image/png');
    const emoteRows = await db
      .insert(schema.emotes)
      .values({
        creatorId: seeded.creatorId,
        name: 'Worker Test',
        shortcode: 'wkTest',
        status: 'processing',
      })
      .returning();
    const emoteId = emoteRows[0]!.id;
    await db.insert(schema.assetProcessingJobs).values({ emoteId, status: 'queued' });

    const result = await handleAssetProcessing(deps, {
      emoteId,
      quarantineKey: 'incoming/test/e1',
    });
    expect(result.status).toBe('succeeded');

    const emote = await db.select().from(schema.emotes).where(eq(schema.emotes.id, emoteId));
    expect(emote[0]!.status).toBe('active');
    const versions = await db
      .select()
      .from(schema.emoteAssetVersions)
      .where(eq(schema.emoteAssetVersions.emoteId, emoteId));
    expect(versions).toHaveLength(1);
    expect((versions[0]!.variants as unknown[]).length).toBe(6);
    // quarantine cleaned
    expect(await deps.storage.get(deps.env.S3_BUCKET_QUARANTINE, 'incoming/test/e1')).toBeNull();

    // Re-running is a no-op, not a duplicate version.
    const second = await handleAssetProcessing(deps, {
      emoteId,
      quarantineKey: 'incoming/test/e1',
    });
    expect(second.status).toBe('skipped');
  });

  it('rejects garbage uploads and marks the emote rejected', async () => {
    await deps.storage.put(
      deps.env.S3_BUCKET_QUARANTINE,
      'incoming/test/bad',
      Buffer.from('not an image at all'),
      'image/png',
    );
    const emoteRows = await db
      .insert(schema.emotes)
      .values({
        creatorId: seeded.creatorId,
        name: 'Bad',
        shortcode: 'wkBad',
        status: 'processing',
      })
      .returning();
    const emoteId = emoteRows[0]!.id;
    await db.insert(schema.assetProcessingJobs).values({ emoteId, status: 'queued' });
    const result = await handleAssetProcessing(deps, {
      emoteId,
      quarantineKey: 'incoming/test/bad',
    });
    expect(result.status).toBe('failed');
    const emote = await db.select().from(schema.emotes).where(eq(schema.emotes.id, emoteId));
    expect(emote[0]!.status).toBe('rejected');
  });
});

describe('entitlement sweep handler', () => {
  it('moves lapsed active → grace (with email) and lapsed grace → expired', async () => {
    // Active entitlement whose hard expiry passed 1h ago.
    const lapsedActive = await db
      .insert(schema.entitlements)
      .values({
        userId: seeded.fanUserId,
        creatorId: seeded.creatorId,
        packId: seeded.packId,
        ruleId: seeded.tierRuleId,
        providerId: 'mock',
        status: 'active',
        expiresAt: new Date(NOW.getTime() - 3_600_000),
      })
      .returning();
    // Grace entitlement whose grace ended.
    const lapsedGrace = await db
      .insert(schema.entitlements)
      .values({
        userId: seeded.creatorUserId,
        creatorId: seeded.creatorId,
        packId: seeded.packId,
        ruleId: seeded.codeRuleId,
        providerId: 'access_code',
        status: 'grace',
        graceUntil: new Date(NOW.getTime() - 60_000),
      })
      .returning();

    const result = await handleEntitlementSweep(deps);
    expect(result.toGrace).toBe(1);
    expect(result.toExpired).toBe(1);

    const activeRow = await db
      .select()
      .from(schema.entitlements)
      .where(eq(schema.entitlements.id, lapsedActive[0]!.id));
    expect(activeRow[0]!.status).toBe('grace');
    // Grace anchors at expiresAt + 72h (mock provider default).
    expect(activeRow[0]!.graceUntil!.getTime()).toBe(NOW.getTime() - 3_600_000 + 72 * 3_600_000);

    const graceRow = await db
      .select()
      .from(schema.entitlements)
      .where(eq(schema.entitlements.id, lapsedGrace[0]!.id));
    expect(graceRow[0]!.status).toBe('expired');

    expect(sentEmails.some((m) => m.subject.includes('ending'))).toBe(true);

    // Evidence rows recorded for both transitions (audit trail).
    const evidence = await db
      .select()
      .from(schema.entitlementEvidence)
      .where(eq(schema.entitlementEvidence.entitlementId, lapsedActive[0]!.id));
    expect(evidence.length).toBe(1);
  });

  it('is idempotent: a second sweep changes nothing', async () => {
    const result = await handleEntitlementSweep(deps);
    expect(result).toEqual({ toGrace: 0, toExpired: 0 });
  });
});

describe('cleanup handler', () => {
  it('expires stale upload grants and purges old auth tokens', async () => {
    await db.insert(schema.uploadGrants).values({
      userId: seeded.fanUserId,
      objectKey: 'incoming/stale',
      mimeType: 'image/png',
      maxBytes: 1000,
      status: 'pending',
      expiresAt: new Date(NOW.getTime() - 60_000),
    });
    await db.insert(schema.authTokens).values({
      email: 'old@test.local',
      tokenHash: 'stale-hash',
      purpose: 'magic_link',
      expiresAt: new Date(NOW.getTime() - 48 * 3_600_000),
    });
    const result = await handleCleanup(deps);
    expect(result.expiredGrants).toBe(1);
    expect(result.expiredTokens).toBe(1);
  });
});
