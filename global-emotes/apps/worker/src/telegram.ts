import type { ObjectStorage } from '@global-emotes/asset-pipeline';
import type { AppEnv } from '@global-emotes/config';
import { schema, type Db } from '@global-emotes/database';
import { asc, eq } from 'drizzle-orm';

/**
 * Telegram sticker export (docs/integrations/TELEGRAM.md). Static 512px WEBP
 * variants only at v1. Injectable fetch keeps it offline-testable.
 */

export class TelegramClient {
  constructor(
    private readonly botToken: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  get configured(): boolean {
    return this.botToken.length > 0;
  }

  private async call(method: string, form: FormData): Promise<Record<string, unknown>> {
    const res = await this.fetchFn(`https://api.telegram.org/bot${this.botToken}/${method}`, {
      method: 'POST',
      body: form,
    });
    const json = (await res.json()) as { ok: boolean; description?: string; result?: unknown };
    if (!json.ok) throw new Error(`telegram ${method} failed: ${json.description ?? res.status}`);
    return json as Record<string, unknown>;
  }

  async createStickerSet(input: {
    userId: number;
    name: string;
    title: string;
    firstSticker: Buffer;
  }): Promise<void> {
    const form = new FormData();
    form.set('user_id', String(input.userId));
    form.set('name', input.name);
    form.set('title', input.title);
    form.set(
      'stickers',
      JSON.stringify([{ sticker: 'attach://sticker0', format: 'static', emoji_list: ['😀'] }]),
    );
    form.set(
      'sticker0',
      new Blob([new Uint8Array(input.firstSticker)], { type: 'image/webp' }),
      'sticker.webp',
    );
    await this.call('createNewStickerSet', form);
  }

  async addSticker(input: { userId: number; name: string; sticker: Buffer }): Promise<void> {
    const form = new FormData();
    form.set('user_id', String(input.userId));
    form.set('name', input.name);
    form.set(
      'sticker',
      JSON.stringify({ sticker: 'attach://sticker0', format: 'static', emoji_list: ['😀'] }),
    );
    form.set(
      'sticker0',
      new Blob([new Uint8Array(input.sticker)], { type: 'image/webp' }),
      'sticker.webp',
    );
    await this.call('addStickerToSet', form);
  }
}

export interface TelegramExportPayload {
  packId: string;
  telegramUserId: number;
  botUsername: string;
}

/** Export a pack's active emotes as a Telegram sticker set. Idempotent-ish: re-running adds missing stickers via stable ordering. */
export async function handleTelegramExport(
  deps: { db: Db; storage: ObjectStorage; env: AppEnv; telegram: TelegramClient },
  payload: TelegramExportPayload,
): Promise<{ status: 'succeeded' | 'skipped' | 'failed'; exported: number; reason?: string }> {
  const { db, storage, env, telegram } = deps;
  if (!telegram.configured)
    return { status: 'skipped', exported: 0, reason: 'telegram not configured' };

  const packs = await db
    .select()
    .from(schema.emotePacks)
    .where(eq(schema.emotePacks.id, payload.packId))
    .limit(1);
  const pack = packs[0];
  if (!pack) return { status: 'skipped', exported: 0, reason: 'pack missing' };
  if (!pack.allowTelegramExport) {
    return { status: 'skipped', exported: 0, reason: 'creator disabled export' };
  }

  const emotes = await db
    .select({
      contentHash: schema.emotes.contentHash,
      status: schema.emotes.status,
      position: schema.emotePackItems.position,
    })
    .from(schema.emotePackItems)
    .innerJoin(schema.emotes, eq(schema.emotePackItems.emoteId, schema.emotes.id))
    .where(eq(schema.emotePackItems.packId, pack.id))
    .orderBy(asc(schema.emotePackItems.position));

  const setName = `${pack.slug.replaceAll('-', '_')}_by_${payload.botUsername}`;
  let exported = 0;
  for (const emote of emotes) {
    if (emote.status !== 'active' || !emote.contentHash) continue;
    const key = `emotes/${emote.contentHash.slice(0, 2)}/${emote.contentHash}/telegram.webp`;
    const buffer = await storage.get(env.S3_BUCKET_PROCESSED, key);
    if (!buffer) continue;
    if (exported === 0) {
      await telegram.createStickerSet({
        userId: payload.telegramUserId,
        name: setName,
        title: `${pack.name} — ${env.BRAND_NAME}`,
        firstSticker: buffer,
      });
    } else {
      await telegram.addSticker({ userId: payload.telegramUserId, name: setName, sticker: buffer });
    }
    exported++;
  }
  if (exported === 0) return { status: 'failed', exported: 0, reason: 'no exportable stickers' };
  return { status: 'succeeded', exported };
}
