import type { FastifyPluginAsync } from 'fastify';
import { asc, eq, inArray } from 'drizzle-orm';
import { schema } from '@global-emotes/database';
import type { SyncManifest } from '@global-emotes/contracts';
import { requireUser } from '../plugins/auth';

/**
 * Device sync manifest: everything a keyboard needs in one cacheable payload —
 * unlocked packs, emotes with signed asset URLs, and removed pack ids so
 * clients can tombstone revoked content (spec §13/§14).
 */
export const registerSyncRoutes: FastifyPluginAsync = async (app) => {
  const { db, env, storage } = app.ctx;

  app.get('/sync/manifest', async (req) => {
    const user = requireUser(req);

    const live = await db
      .select({
        packId: schema.entitlements.packId,
        status: schema.entitlements.status,
      })
      .from(schema.entitlements)
      .where(eq(schema.entitlements.userId, user.id));
    const unlockedPackIds = new Map<string, 'active' | 'grace'>();
    const removedPackIds = new Set<string>();
    for (const row of live) {
      if (!row.packId) continue;
      if (row.status === 'active' || row.status === 'grace') {
        unlockedPackIds.set(row.packId, row.status);
      } else {
        removedPackIds.add(row.packId);
      }
    }
    for (const id of unlockedPackIds.keys()) removedPackIds.delete(id);

    // Public packs are always included.
    const publicRules = await db
      .select({ packId: schema.entitlementRules.packId })
      .from(schema.entitlementRules)
      .where(eq(schema.entitlementRules.kind, 'public'));
    for (const rule of publicRules) {
      if (!unlockedPackIds.has(rule.packId)) unlockedPackIds.set(rule.packId, 'active');
    }

    const packIds = [...unlockedPackIds.keys()];
    const manifest: SyncManifest = {
      generatedAt: new Date().toISOString(),
      cursor: String(Date.now()),
      packs: [],
      removedPackIds: [...removedPackIds],
    };
    if (packIds.length === 0) return manifest;

    const packs = await db
      .select({
        id: schema.emotePacks.id,
        slug: schema.emotePacks.slug,
        name: schema.emotePacks.name,
        visibility: schema.emotePacks.visibility,
        creatorHandle: schema.creatorProfiles.handle,
      })
      .from(schema.emotePacks)
      .innerJoin(schema.creatorProfiles, eq(schema.emotePacks.creatorId, schema.creatorProfiles.id))
      .where(inArray(schema.emotePacks.id, packIds));

    for (const pack of packs) {
      if (pack.visibility !== 'published' && pack.visibility !== 'unlisted') continue;
      const emotes = await db
        .select({
          id: schema.emotes.id,
          shortcode: schema.emotes.shortcode,
          name: schema.emotes.name,
          animated: schema.emotes.animated,
          status: schema.emotes.status,
          contentHash: schema.emotes.contentHash,
        })
        .from(schema.emotePackItems)
        .innerJoin(schema.emotes, eq(schema.emotePackItems.emoteId, schema.emotes.id))
        .where(eq(schema.emotePackItems.packId, pack.id))
        .orderBy(asc(schema.emotePackItems.position));

      const entries = [] as SyncManifest['packs'][number]['emotes'];
      for (const emote of emotes) {
        if (emote.status !== 'active' || !emote.contentHash) continue;
        const keyboardKey = `emotes/${emote.contentHash.slice(0, 2)}/${emote.contentHash}/keyboard.webp`;
        const shareKey = `emotes/${emote.contentHash.slice(0, 2)}/${emote.contentHash}/share.webp`;
        entries.push({
          id: emote.id,
          shortcode: emote.shortcode,
          name: emote.name,
          animated: emote.animated,
          keyboardUrl: await storage.signedGetUrl(env.S3_BUCKET_PROCESSED, keyboardKey, 3600),
          shareUrl: await storage.signedGetUrl(env.S3_BUCKET_PROCESSED, shareKey, 3600),
          contentHash: emote.contentHash,
        });
      }
      manifest.packs.push({
        packId: pack.id,
        slug: pack.slug,
        name: pack.name,
        creatorHandle: pack.creatorHandle,
        entitlementStatus: unlockedPackIds.get(pack.id) ?? 'active',
        emotes: entries,
      });
    }
    return manifest;
  });

  /** Server-served compatibility registry (IP-06). Seeded data; admin-editable later. */
  app.get('/compatibility', async () => COMPATIBILITY_REGISTRY);
};

const COMPATIBILITY_REGISTRY = {
  version: 1,
  updatedAt: '2026-07-23T00:00:00Z',
  entries: [
    {
      appId: 'com.google.android.apps.messaging',
      platform: 'android',
      displayName: 'Google Messages',
      capabilities: ['direct_static_image', 'direct_animated_gif', 'clipboard_static', 'share_sheet'],
      lastVerifiedAt: null,
      notes: 'commitContent widely supported; verify per-device before marketing claims.',
    },
    {
      appId: 'com.whatsapp',
      platform: 'android',
      displayName: 'WhatsApp',
      capabilities: ['clipboard_static', 'share_sheet'],
      lastVerifiedAt: null,
      notes: 'Rejects most commitContent; use share sheet or sticker export (flagged).',
    },
    {
      appId: 'org.telegram.messenger',
      platform: 'android',
      displayName: 'Telegram',
      capabilities: ['direct_static_image', 'direct_animated_gif', 'clipboard_static', 'share_sheet'],
      lastVerifiedAt: null,
      notes: 'Also supports native sticker packs via export.',
    },
    {
      appId: 'com.discord',
      platform: 'android',
      displayName: 'Discord',
      capabilities: ['direct_static_image', 'clipboard_static', 'share_sheet'],
      lastVerifiedAt: null,
      notes: '',
    },
    {
      appId: 'net.whatsapp.WhatsApp',
      platform: 'ios',
      displayName: 'WhatsApp',
      capabilities: ['clipboard_static', 'share_sheet'],
      lastVerifiedAt: null,
      notes: 'iOS keyboards cannot insert images directly; paste flow.',
    },
    {
      appId: 'ph.telegra.Telegraph',
      platform: 'ios',
      displayName: 'Telegram',
      capabilities: ['clipboard_static', 'clipboard_animated', 'share_sheet'],
      lastVerifiedAt: null,
      notes: 'Paste supports animated content; sticker export preferred.',
    },
  ],
} as const;
