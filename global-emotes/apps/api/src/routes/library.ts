import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { schema } from '@global-emotes/database';
import { assertFavoriteCapacity } from '@global-emotes/billing';
import { FAN_PLAN_LIMITS, type FanPlan } from '@global-emotes/config';
import { requireUser } from '../plugins/auth';

/** Favorites, recents, and library search. */
export const registerLibraryRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app.ctx;

  app.get('/favorites', async (req) => {
    const user = requireUser(req);
    const rows = await db
      .select({
        emoteId: schema.favorites.emoteId,
        createdAt: schema.favorites.createdAt,
        shortcode: schema.emotes.shortcode,
        name: schema.emotes.name,
        animated: schema.emotes.animated,
      })
      .from(schema.favorites)
      .innerJoin(schema.emotes, eq(schema.favorites.emoteId, schema.emotes.id))
      .where(eq(schema.favorites.userId, user.id))
      .orderBy(desc(schema.favorites.createdAt));
    return { items: rows };
  });

  app.post(
    '/favorites/:emoteId',
    { schema: { params: z.object({ emoteId: z.string().uuid() }) } },
    async (req) => {
      const user = requireUser(req);
      const { emoteId } = req.params as { emoteId: string };
      const current = await db
        .select({ n: count() })
        .from(schema.favorites)
        .where(eq(schema.favorites.userId, user.id));
      assertFavoriteCapacity(user.fanPlan as FanPlan, current[0]?.n ?? 0);
      await db.insert(schema.favorites).values({ userId: user.id, emoteId }).onConflictDoNothing();
      return { ok: true };
    },
  );

  app.delete(
    '/favorites/:emoteId',
    { schema: { params: z.object({ emoteId: z.string().uuid() }) } },
    async (req) => {
      const user = requireUser(req);
      const { emoteId } = req.params as { emoteId: string };
      await db
        .delete(schema.favorites)
        .where(and(eq(schema.favorites.userId, user.id), eq(schema.favorites.emoteId, emoteId)));
      return { ok: true };
    },
  );

  app.post(
    '/recents/:emoteId',
    { schema: { params: z.object({ emoteId: z.string().uuid() }) } },
    async (req) => {
      const user = requireUser(req);
      const { emoteId } = req.params as { emoteId: string };
      await db
        .insert(schema.recentEmotes)
        .values({ userId: user.id, emoteId })
        .onConflictDoUpdate({
          target: [schema.recentEmotes.userId, schema.recentEmotes.emoteId],
          set: {
            lastUsedAt: new Date(),
            useCount: sql`${schema.recentEmotes.useCount} + 1`,
          },
        });
      return { ok: true };
    },
  );

  app.get('/recents', async (req) => {
    const user = requireUser(req);
    const limit = FAN_PLAN_LIMITS[user.fanPlan as FanPlan]?.maxRecents ?? 30;
    const rows = await db
      .select({
        emoteId: schema.recentEmotes.emoteId,
        lastUsedAt: schema.recentEmotes.lastUsedAt,
        useCount: schema.recentEmotes.useCount,
        shortcode: schema.emotes.shortcode,
        name: schema.emotes.name,
        animated: schema.emotes.animated,
      })
      .from(schema.recentEmotes)
      .innerJoin(schema.emotes, eq(schema.recentEmotes.emoteId, schema.emotes.id))
      .where(eq(schema.recentEmotes.userId, user.id))
      .orderBy(desc(schema.recentEmotes.lastUsedAt))
      .limit(limit);
    return { items: rows };
  });

  /** Library search across emote name, shortcode, creator handle, pack name. */
  app.get(
    '/search',
    { schema: { querystring: z.object({ q: z.string().min(1).max(64) }) } },
    async (req) => {
      requireUser(req);
      const { q } = req.query as { q: string };
      const pattern = `%${q.replaceAll('%', '').replaceAll('_', '')}%`;
      const rows = await db
        .select({
          emoteId: schema.emotes.id,
          name: schema.emotes.name,
          shortcode: schema.emotes.shortcode,
          animated: schema.emotes.animated,
          creatorHandle: schema.creatorProfiles.handle,
        })
        .from(schema.emotes)
        .innerJoin(schema.creatorProfiles, eq(schema.emotes.creatorId, schema.creatorProfiles.id))
        .where(
          and(
            eq(schema.emotes.status, 'active'),
            or(
              ilike(schema.emotes.name, pattern),
              ilike(schema.emotes.shortcode, pattern),
              ilike(schema.creatorProfiles.handle, pattern),
            ),
          ),
        )
        .limit(50);
      return { items: rows };
    },
  );
};
