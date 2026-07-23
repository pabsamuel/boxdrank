import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDb } from './testing.js';
import { seed } from './seed.js';
import * as schema from './schema/index.js';

let db: TestDb;
let close: () => Promise<void>;

beforeAll(async () => {
  const t = await createTestDb();
  db = t.db;
  close = t.close;
});

afterAll(async () => {
  await close();
});

describe('migrations + schema', () => {
  it('applies all migrations and seeds demo data idempotently', async () => {
    const first = await seed(db as never);
    const second = await seed(db as never); // idempotent
    expect(second.packId).toBe(first.packId);

    const packs = await db.select().from(schema.emotePacks);
    expect(packs.length).toBe(2);
  });

  it('enforces unique creator handle', async () => {
    await expect(
      db.insert(schema.creatorProfiles).values({
        userId: '00000000-0000-4000-8000-000000000002',
        handle: 'demo-creator',
        displayName: 'Impersonator',
      }),
    ).rejects.toThrow();
  });

  it('enforces one live entitlement per user+rule via partial unique index', async () => {
    const userId = '00000000-0000-4000-8000-000000000002';
    const seeded = await seed(db as never);
    await db.insert(schema.entitlements).values({
      userId,
      creatorId: seeded.creatorId,
      packId: seeded.packId,
      ruleId: seeded.tierRuleId,
      providerId: 'mock',
      status: 'active',
    });
    // second live row for same rule must fail
    await expect(
      db.insert(schema.entitlements).values({
        userId,
        creatorId: seeded.creatorId,
        packId: seeded.packId,
        ruleId: seeded.tierRuleId,
        providerId: 'mock',
        status: 'active',
      }),
    ).rejects.toThrow();
    // but a historical (revoked) row is allowed
    await db.insert(schema.entitlements).values({
      userId,
      creatorId: seeded.creatorId,
      packId: seeded.packId,
      ruleId: seeded.tierRuleId,
      providerId: 'mock',
      status: 'revoked',
      revokedReason: 'test-history',
    });
    const rows = await db
      .select()
      .from(schema.entitlements)
      .where(eq(schema.entitlements.userId, userId));
    expect(rows.length).toBe(2);
  });

  it('cascades pack items when a pack is deleted', async () => {
    const seeded = await seed(db as never);
    await db.delete(schema.emotePacks).where(eq(schema.emotePacks.id, seeded.publicPackId));
    const items = await db
      .select()
      .from(schema.emotePackItems)
      .where(eq(schema.emotePackItems.packId, seeded.publicPackId));
    expect(items.length).toBe(0);
  });
});
