import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, asc, count, eq, isNull } from 'drizzle-orm';
import { schema } from '@global-emotes/database';
import { createPackRequestSchema, normalizeSlug, isValidNewSlug } from '@global-emotes/contracts';
import { assertCanCreatePack } from '@global-emotes/billing';
import type { CreatorPlan } from '@global-emotes/config';
import { requireUser } from '../plugins/auth';
import { conflict, notFound, validation } from '../errors';
import { ownedCreator } from './creators';

const ruleConfigSchema = z.object({
  kind: z.enum([
    'public',
    'follower',
    'member',
    'tier',
    'discord_role',
    'patreon_tier',
    'access_code',
    'purchase',
    'campaign',
  ]),
  providerId: z.string().nullable().default(null),
  config: z.record(z.unknown()).default({}),
  graceHoursOverride: z.number().int().min(0).max(24 * 30).nullable().default(null),
});

export const registerPackRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app.ctx;

  app.post(
    '/creators/:creatorId/packs',
    {
      schema: {
        params: z.object({ creatorId: z.string().uuid() }),
        body: createPackRequestSchema,
      },
    },
    async (req) => {
      const user = requireUser(req);
      const { creatorId } = req.params as { creatorId: string };
      const body = req.body as z.infer<typeof createPackRequestSchema>;
      const creator = await ownedCreator(app, user.id, creatorId);

      const packCount = await db
        .select({ n: count() })
        .from(schema.emotePacks)
        .where(and(eq(schema.emotePacks.creatorId, creatorId), isNull(schema.emotePacks.deletedAt)));
      assertCanCreatePack(creator.plan as CreatorPlan, packCount[0]?.n ?? 0);

      const slug = body.slug ?? normalizeSlug(body.name);
      if (!isValidNewSlug(slug)) throw validation(`slug "${slug}" is invalid or reserved`);
      const dupe = await db
        .select({ id: schema.emotePacks.id })
        .from(schema.emotePacks)
        .where(and(eq(schema.emotePacks.creatorId, creatorId), eq(schema.emotePacks.slug, slug)))
        .limit(1);
      if (dupe.length > 0) throw conflict('pack slug already exists for this creator');

      const inserted = await db
        .insert(schema.emotePacks)
        .values({
          creatorId,
          slug,
          name: body.name,
          description: body.description ?? null,
          allowTelegramExport: body.allowTelegramExport,
        })
        .returning();
      return inserted[0];
    },
  );

  app.get(
    '/creators/:creatorId/packs',
    { schema: { params: z.object({ creatorId: z.string().uuid() }) } },
    async (req) => {
      const user = requireUser(req);
      const { creatorId } = req.params as { creatorId: string };
      await ownedCreator(app, user.id, creatorId);
      const packs = await db
        .select()
        .from(schema.emotePacks)
        .where(and(eq(schema.emotePacks.creatorId, creatorId), isNull(schema.emotePacks.deletedAt)))
        .orderBy(asc(schema.emotePacks.createdAt));
      return { items: packs, nextCursor: null };
    },
  );

  app.patch(
    '/packs/:packId',
    {
      schema: {
        params: z.object({ packId: z.string().uuid() }),
        body: z.object({
          name: z.string().min(1).max(80).optional(),
          description: z.string().max(500).optional(),
          allowTelegramExport: z.boolean().optional(),
        }),
      },
    },
    async (req) => {
      const user = requireUser(req);
      const { packId } = req.params as { packId: string };
      const pack = await ownedPack(app, user.id, packId);
      await db
        .update(schema.emotePacks)
        .set(req.body as Record<string, unknown>)
        .where(eq(schema.emotePacks.id, pack.id));
      return { ok: true };
    },
  );

  /** Attach an existing emote to a pack (position-ordered). */
  app.post(
    '/packs/:packId/emotes',
    {
      schema: {
        params: z.object({ packId: z.string().uuid() }),
        body: z.object({ emoteId: z.string().uuid(), position: z.number().int().min(0).default(0) }),
      },
    },
    async (req) => {
      const user = requireUser(req);
      const { packId } = req.params as { packId: string };
      const { emoteId, position } = req.body as { emoteId: string; position: number };
      const pack = await ownedPack(app, user.id, packId);
      const emotes = await db
        .select()
        .from(schema.emotes)
        .where(and(eq(schema.emotes.id, emoteId), eq(schema.emotes.creatorId, pack.creatorId)))
        .limit(1);
      if (emotes.length === 0) throw notFound('emote not found for this creator');
      await db
        .insert(schema.emotePackItems)
        .values({ packId, emoteId, position })
        .onConflictDoNothing();
      return { ok: true };
    },
  );

  /** Entitlement rules for a pack. */
  app.put(
    '/packs/:packId/rules',
    {
      schema: {
        params: z.object({ packId: z.string().uuid() }),
        body: z.object({ rules: z.array(ruleConfigSchema).max(10) }),
      },
    },
    async (req) => {
      const user = requireUser(req);
      const { packId } = req.params as { packId: string };
      const { rules } = req.body as { rules: Array<z.infer<typeof ruleConfigSchema>> };
      const pack = await ownedPack(app, user.id, packId);
      await db.transaction(async (tx) => {
        await tx.delete(schema.entitlementRules).where(eq(schema.entitlementRules.packId, pack.id));
        if (rules.length > 0) {
          await tx.insert(schema.entitlementRules).values(
            rules.map((r) => ({
              packId: pack.id,
              kind: r.kind,
              providerId: r.providerId,
              config: r.config as Record<string, unknown>,
              graceHoursOverride: r.graceHoursOverride,
            })),
          );
        }
      });
      const saved = await db
        .select()
        .from(schema.entitlementRules)
        .where(eq(schema.entitlementRules.packId, pack.id));
      return { rules: saved };
    },
  );

  /** Publish: snapshot the pack, bump version, set visibility. */
  app.post(
    '/packs/:packId/publish',
    { schema: { params: z.object({ packId: z.string().uuid() }) } },
    async (req) => {
      const user = requireUser(req);
      const { packId } = req.params as { packId: string };
      const pack = await ownedPack(app, user.id, packId);

      const items = await db
        .select({
          emoteId: schema.emotePackItems.emoteId,
          position: schema.emotePackItems.position,
          shortcode: schema.emotes.shortcode,
          status: schema.emotes.status,
        })
        .from(schema.emotePackItems)
        .innerJoin(schema.emotes, eq(schema.emotePackItems.emoteId, schema.emotes.id))
        .where(eq(schema.emotePackItems.packId, pack.id));
      if (items.length === 0) throw validation('cannot publish an empty pack');
      const notReady = items.filter((i) => i.status !== 'active');
      if (notReady.length > 0) {
        throw validation(`${notReady.length} emote(s) still processing or rejected`);
      }

      const version = await db.transaction(async (tx) => {
        const versions = await tx
          .select({ n: count() })
          .from(schema.packVersions)
          .where(eq(schema.packVersions.packId, pack.id));
        const nextVersion = (versions[0]?.n ?? 0) + 1;
        const versionRows = await tx
          .insert(schema.packVersions)
          .values({
            packId: pack.id,
            version: nextVersion,
            snapshot: { items } as Record<string, unknown>,
          })
          .returning({ id: schema.packVersions.id });
        await tx.insert(schema.packPublications).values({
          packId: pack.id,
          packVersionId: versionRows[0]!.id,
          publishedBy: user.id,
        });
        await tx
          .update(schema.emotePacks)
          .set({ visibility: 'published', publishedAt: new Date() })
          .where(eq(schema.emotePacks.id, pack.id));
        return nextVersion;
      });
      return { published: true, version };
    },
  );
};

export async function ownedPack(
  app: { ctx: { db: import('@global-emotes/database').Db } },
  userId: string,
  packId: string,
) {
  const rows = await app.ctx.db
    .select()
    .from(schema.emotePacks)
    .where(and(eq(schema.emotePacks.id, packId), isNull(schema.emotePacks.deletedAt)))
    .limit(1);
  const pack = rows[0];
  if (!pack) throw notFound('pack not found');
  await ownedCreator(app, userId, pack.creatorId);
  return pack;
}
