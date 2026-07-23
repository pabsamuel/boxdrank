import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { loadEnv, resetEnvCache } from '@global-emotes/config';
import { createTestDb, asDb } from '@global-emotes/database/testing';
import { seed } from '@global-emotes/database/seed';
import { schema, type Db } from '@global-emotes/database';
import { eq } from 'drizzle-orm';
import { MemoryObjectStorage } from '@global-emotes/asset-pipeline';
import { TelegramClient, handleTelegramExport } from './telegram';
import { handleDataExport } from './data-export';

let db: Db;
let close: () => Promise<void>;
let storage: MemoryObjectStorage;
let seeded: Awaited<ReturnType<typeof seed>>;
const env = (() => {
  resetEnvCache();
  return loadEnv({ NODE_ENV: 'test', TELEGRAM_BOT_TOKEN: 'bot-token' });
})();

beforeAll(async () => {
  const t = await createTestDb();
  db = asDb(t.db);
  close = t.close;
  seeded = await seed(t.db as never);
  storage = new MemoryObjectStorage();
  // Materialize telegram variants for the two seeded subscriber-pack emotes.
  const webp = await sharp({
    create: { width: 512, height: 512, channels: 4, background: { r: 9, g: 9, b: 9, alpha: 1 } },
  })
    .webp()
    .toBuffer();
  for (const hash of ['seed-hash-1', 'seed-hash-2']) {
    await storage.put(
      env.S3_BUCKET_PROCESSED,
      `emotes/${hash.slice(0, 2)}/${hash}/telegram.webp`,
      webp,
      'image/webp',
    );
  }
});

afterAll(async () => {
  await close();
});

describe('telegram export', () => {
  it('creates a sticker set then adds remaining stickers', async () => {
    const calls: string[] = [];
    const fetchFn: typeof fetch = async (input) => {
      calls.push(String(input).split('/').pop()!);
      return new Response(JSON.stringify({ ok: true, result: {} }), {
        headers: { 'content-type': 'application/json' },
      });
    };
    const result = await handleTelegramExport(
      { db, storage, env, telegram: new TelegramClient('bot-token', fetchFn) },
      { packId: seeded.packId, telegramUserId: 12345, botUsername: 'GlobalEmotesBot' },
    );
    expect(result).toMatchObject({ status: 'succeeded', exported: 2 });
    expect(calls).toEqual(['createNewStickerSet', 'addStickerToSet']);
  });

  it('respects the creator export toggle', async () => {
    await db
      .update(schema.emotePacks)
      .set({ allowTelegramExport: false })
      .where(eq(schema.emotePacks.id, seeded.packId));
    const result = await handleTelegramExport(
      {
        db,
        storage,
        env,
        telegram: new TelegramClient('bot-token', async () => new Response('{}')),
      },
      { packId: seeded.packId, telegramUserId: 1, botUsername: 'X' },
    );
    expect(result).toMatchObject({ status: 'skipped', reason: 'creator disabled export' });
    await db
      .update(schema.emotePacks)
      .set({ allowTelegramExport: true })
      .where(eq(schema.emotePacks.id, seeded.packId));
  });

  it('skips honestly when unconfigured', async () => {
    const result = await handleTelegramExport(
      { db, storage, env, telegram: new TelegramClient('') },
      { packId: seeded.packId, telegramUserId: 1, botUsername: 'X' },
    );
    expect(result.status).toBe('skipped');
  });
});

describe('data export', () => {
  it('assembles the archive, excludes tokens, marks request ready', async () => {
    const requests = await db
      .insert(schema.dataExportRequests)
      .values({ userId: seeded.fanUserId })
      .returning();
    const result = await handleDataExport({ db, storage, env }, { requestId: requests[0]!.id });
    expect(result.status).toBe('succeeded');

    const row = await db
      .select()
      .from(schema.dataExportRequests)
      .where(eq(schema.dataExportRequests.id, requests[0]!.id));
    expect(row[0]!.status).toBe('ready');
    const archive = JSON.parse(
      (await storage.get(env.S3_BUCKET_QUARANTINE, row[0]!.objectKey!))!.toString(),
    );
    expect(archive.account.email).toBe('fan@demo.local');
    expect(JSON.stringify(archive)).not.toContain('TokenEnc');

    // Re-run is a no-op.
    const again = await handleDataExport({ db, storage, env }, { requestId: requests[0]!.id });
    expect(again.status).toBe('skipped');
  });
});
