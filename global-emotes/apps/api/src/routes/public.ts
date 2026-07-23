import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { schema } from '@global-emotes/database';
import { notFound } from '../errors';

/**
 * Public, unauthenticated surface: creator pages and pack pages (the top of
 * the growth funnel, IP-11) and abuse reporting. Only public-safe fields;
 * member-only asset originals are never exposed here.
 */
export const registerPublicRoutes: FastifyPluginAsync = async (app) => {
  const { db, env, storage } = app.ctx;

  app.get(
    '/public/creators/:handle',
    { schema: { params: z.object({ handle: z.string() }) } },
    async (req) => {
      const { handle } = req.params as { handle: string };
      const creators = await db
        .select({
          id: schema.creatorProfiles.id,
          handle: schema.creatorProfiles.handle,
          displayName: schema.creatorProfiles.displayName,
          bio: schema.creatorProfiles.bio,
          avatarUrl: schema.creatorProfiles.avatarUrl,
          brandColor: schema.creatorProfiles.brandColor,
        })
        .from(schema.creatorProfiles)
        .where(
          and(eq(schema.creatorProfiles.handle, handle), isNull(schema.creatorProfiles.deletedAt)),
        )
        .limit(1);
      const creator = creators[0];
      if (!creator) throw notFound('creator not found');

      const packs = await db
        .select({
          id: schema.emotePacks.id,
          slug: schema.emotePacks.slug,
          name: schema.emotePacks.name,
          description: schema.emotePacks.description,
          publishedAt: schema.emotePacks.publishedAt,
        })
        .from(schema.emotePacks)
        .where(
          and(
            eq(schema.emotePacks.creatorId, creator.id),
            eq(schema.emotePacks.visibility, 'published'),
            isNull(schema.emotePacks.deletedAt),
          ),
        )
        .orderBy(asc(schema.emotePacks.createdAt));
      return { creator, packs };
    },
  );

  app.get(
    '/public/creators/:handle/packs/:slug',
    { schema: { params: z.object({ handle: z.string(), slug: z.string() }) } },
    async (req) => {
      const { handle, slug } = req.params as { handle: string; slug: string };
      const rows = await db
        .select({
          pack: schema.emotePacks,
          creatorHandle: schema.creatorProfiles.handle,
          creatorName: schema.creatorProfiles.displayName,
        })
        .from(schema.emotePacks)
        .innerJoin(
          schema.creatorProfiles,
          eq(schema.emotePacks.creatorId, schema.creatorProfiles.id),
        )
        .where(and(eq(schema.creatorProfiles.handle, handle), eq(schema.emotePacks.slug, slug)))
        .limit(1);
      const row = rows[0];
      if (!row || row.pack.visibility === 'draft' || row.pack.visibility === 'suspended') {
        throw notFound('pack not found');
      }

      const rules = await db
        .select({
          kind: schema.entitlementRules.kind,
          providerId: schema.entitlementRules.providerId,
        })
        .from(schema.entitlementRules)
        .where(eq(schema.entitlementRules.packId, row.pack.id));

      const emotes = await db
        .select({
          id: schema.emotes.id,
          name: schema.emotes.name,
          shortcode: schema.emotes.shortcode,
          animated: schema.emotes.animated,
          status: schema.emotes.status,
          contentHash: schema.emotes.contentHash,
        })
        .from(schema.emotePackItems)
        .innerJoin(schema.emotes, eq(schema.emotePackItems.emoteId, schema.emotes.id))
        .where(eq(schema.emotePackItems.packId, row.pack.id))
        .orderBy(asc(schema.emotePackItems.position));

      // Public preview: small preview variants only (not share/originals).
      const emoteList = [] as Array<Record<string, unknown>>;
      for (const emote of emotes) {
        if (emote.status !== 'active') continue;
        emoteList.push({
          id: emote.id,
          name: emote.name,
          shortcode: emote.shortcode,
          animated: emote.animated,
          previewUrl: emote.contentHash
            ? await storage.signedGetUrl(
                env.S3_BUCKET_PROCESSED,
                `emotes/${emote.contentHash.slice(0, 2)}/${emote.contentHash}/web_preview.webp`,
                3600,
              )
            : null,
        });
      }
      return {
        pack: {
          id: row.pack.id,
          slug: row.pack.slug,
          name: row.pack.name,
          description: row.pack.description,
          creatorHandle: row.creatorHandle,
          creatorDisplayName: row.creatorName,
          accessSummary: rules.map((r) => r.kind),
          emoteCount: emoteList.length,
          publishedAt: row.pack.publishedAt?.toISOString() ?? null,
        },
        emotes: emoteList,
        installUrl: `${env.PUBLIC_WEB_URL}/get?pack=${row.pack.id}`,
      };
    },
  );

  /** Abuse/copyright reporting — available without an account, rate-limited. */
  app.post(
    '/public/reports',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
      schema: {
        body: z.object({
          targetKind: z.enum(['creator', 'pack', 'emote', 'user']),
          targetId: z.string().uuid(),
          category: z.enum(['copyright', 'impersonation', 'prohibited_content', 'spam', 'other']),
          reason: z.string().min(10).max(2000),
          reporterEmail: z.string().email().optional(),
        }),
      },
    },
    async (req) => {
      const body = req.body as {
        targetKind: 'creator' | 'pack' | 'emote' | 'user';
        targetId: string;
        category: 'copyright' | 'impersonation' | 'prohibited_content' | 'spam' | 'other';
        reason: string;
        reporterEmail?: string;
      };
      const inserted = await db
        .insert(schema.reports)
        .values({
          reporterUserId: req.user?.id ?? null,
          reporterEmail: body.reporterEmail ?? null,
          targetKind: body.targetKind,
          targetId: body.targetId,
          category: body.category,
          reason: body.reason,
        })
        .returning({ id: schema.reports.id });
      await db.insert(schema.moderationCases).values({
        reportId: inserted[0]!.id,
        targetKind: body.targetKind,
        targetId: body.targetId,
      });
      return { reported: true, reportId: inserted[0]!.id };
    },
  );
};
