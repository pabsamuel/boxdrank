import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { schema } from '@global-emotes/database';
import { isValidNewSlug, normalizeSlug } from '@global-emotes/contracts';
import { requireUser } from '../plugins/auth';
import { conflict, forbidden, notFound, validation } from '../errors';

export const registerCreatorRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app.ctx;

  app.post(
    '/creators',
    {
      schema: {
        body: z.object({
          handle: z.string().min(2).max(64),
          displayName: z.string().min(1).max(80),
          bio: z.string().max(500).optional(),
        }),
      },
    },
    async (req) => {
      const user = requireUser(req);
      const body = req.body as { handle: string; displayName: string; bio?: string };
      const handle = normalizeSlug(body.handle);
      if (!isValidNewSlug(handle)) {
        throw validation(`handle "${handle}" is invalid or reserved`);
      }
      const existing = await db
        .select({ id: schema.creatorProfiles.id })
        .from(schema.creatorProfiles)
        .where(eq(schema.creatorProfiles.handle, handle))
        .limit(1);
      if (existing.length > 0) throw conflict('handle already taken');

      const inserted = await db
        .insert(schema.creatorProfiles)
        .values({
          userId: user.id,
          handle,
          displayName: body.displayName,
          bio: body.bio ?? null,
        })
        .returning();
      const profile = inserted[0]!;
      await db.insert(schema.auditLogs).values({
        actorType: 'user',
        actorId: user.id,
        action: 'creator.created',
        targetKind: 'creator',
        targetId: profile.id,
      });
      return { id: profile.id, handle: profile.handle, displayName: profile.displayName, plan: profile.plan };
    },
  );

  app.patch(
    '/creators/:creatorId',
    {
      schema: {
        params: z.object({ creatorId: z.string().uuid() }),
        body: z.object({
          displayName: z.string().min(1).max(80).optional(),
          bio: z.string().max(500).optional(),
          brandColor: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .optional(),
        }),
      },
    },
    async (req) => {
      const user = requireUser(req);
      const { creatorId } = req.params as { creatorId: string };
      const profile = await ownedCreator(app, user.id, creatorId);
      const body = req.body as Record<string, string>;
      await db
        .update(schema.creatorProfiles)
        .set({
          ...(body.displayName ? { displayName: body.displayName } : {}),
          ...(body.bio !== undefined ? { bio: body.bio } : {}),
          ...(body.brandColor ? { brandColor: body.brandColor } : {}),
        })
        .where(eq(schema.creatorProfiles.id, profile.id));
      return { ok: true };
    },
  );

  /** Creator verification via a connected provider account (self-ownership proof). */
  app.post(
    '/creators/:creatorId/verify',
    {
      schema: {
        params: z.object({ creatorId: z.string().uuid() }),
        body: z.object({
          providerId: z.string(),
          connectionId: z.string().uuid(),
        }),
      },
    },
    async (req) => {
      const user = requireUser(req);
      const { creatorId } = req.params as { creatorId: string };
      const { providerId, connectionId } = req.body as { providerId: string; connectionId: string };
      const profile = await ownedCreator(app, user.id, creatorId);

      const connections = await db
        .select()
        .from(schema.providerConnections)
        .where(
          and(
            eq(schema.providerConnections.id, connectionId),
            eq(schema.providerConnections.userId, user.id),
            eq(schema.providerConnections.providerId, providerId),
          ),
        )
        .limit(1);
      const connection = connections[0];
      if (!connection) throw notFound('provider connection not found');

      // The connected account belongs to this authenticated user — that IS the
      // ownership proof for self-serve providers (Twitch/mock). Guild-style
      // providers additionally verify manage rights during connection.
      await db
        .insert(schema.creatorVerifications)
        .values({
          creatorId: profile.id,
          providerId,
          externalAccountId: connection.externalAccountId,
          status: 'verified',
          verifiedAt: new Date(),
          evidence: { method: 'connected_account', connectionId },
        })
        .onConflictDoNothing();
      await db
        .insert(schema.externalCreatorAccounts)
        .values({
          creatorId: profile.id,
          providerId,
          externalAccountId: connection.externalAccountId,
        })
        .onConflictDoNothing();
      await db.insert(schema.auditLogs).values({
        actorType: 'user',
        actorId: user.id,
        action: 'creator.verified',
        targetKind: 'creator',
        targetId: profile.id,
        meta: { providerId },
      });
      return { verified: true, providerId, externalAccountId: connection.externalAccountId };
    },
  );
};

export async function ownedCreator(
  app: { ctx: { db: import('@global-emotes/database').Db } },
  userId: string,
  creatorId: string,
) {
  const rows = await app.ctx.db
    .select()
    .from(schema.creatorProfiles)
    .where(
      and(
        eq(schema.creatorProfiles.id, creatorId),
        isNull(schema.creatorProfiles.deletedAt),
      ),
    )
    .limit(1);
  const profile = rows[0];
  if (!profile) throw notFound('creator profile not found');
  if (profile.userId !== userId) {
    // Managers (creator_managers) may also act; check membership.
    const managers = await app.ctx.db
      .select({ id: schema.creatorManagers.id })
      .from(schema.creatorManagers)
      .where(
        and(
          eq(schema.creatorManagers.creatorId, creatorId),
          eq(schema.creatorManagers.userId, userId),
        ),
      )
      .limit(1);
    if (managers.length === 0) throw forbidden('not your creator profile');
  }
  return profile;
}
