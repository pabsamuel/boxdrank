import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, count, eq } from 'drizzle-orm';
import { schema } from '@global-emotes/database';
import { requestUploadSchema, createEmoteRequestSchema, shortcodeSchema } from '@global-emotes/contracts';
import { assertCanAddEmote, assertCanUploadAnimated } from '@global-emotes/billing';
import { detectFormat, validateAsset } from '@global-emotes/asset-pipeline';
import type { CreatorPlan } from '@global-emotes/config';
import { requireUser } from '../plugins/auth';
import { conflict, notFound, validation } from '../errors';
import { ownedCreator } from './creators';

/**
 * Upload lifecycle: grant → PUT bytes (quarantine bucket) → complete →
 * validation + emote row + async processing job. Publishing is blocked until
 * processing succeeds (spec §11.13).
 */
export const registerUploadRoutes: FastifyPluginAsync = async (app) => {
  const { db, env, storage, jobs } = app.ctx;

  app.post(
    '/uploads',
    { schema: { body: requestUploadSchema } },
    async (req) => {
      const user = requireUser(req);
      const body = req.body as z.infer<typeof requestUploadSchema>;
      const key = `incoming/${user.id}/${crypto.randomUUID()}`;
      const inserted = await db
        .insert(schema.uploadGrants)
        .values({
          userId: user.id,
          objectKey: key,
          mimeType: body.mimeType,
          maxBytes: body.bytes,
          expiresAt: new Date(Date.now() + 15 * 60_000),
        })
        .returning();
      const grant = inserted[0]!;
      return {
        grantId: grant.id,
        // Local/simple deployments PUT to this API; S3 presigned PUT is the
        // production path (worker docs) — same grant model either way.
        uploadUrl: `${env.PUBLIC_API_URL}/v1/uploads/${grant.id}/content`,
        expiresAt: grant.expiresAt.toISOString(),
      };
    },
  );

  /** Raw byte upload into quarantine. */
  app.addContentTypeParser(
    ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/octet-stream'],
    { parseAs: 'buffer' },
    (_req, body, done) => done(null, body),
  );

  app.put(
    '/uploads/:grantId/content',
    { schema: { params: z.object({ grantId: z.string().uuid() }) } },
    async (req) => {
      const user = requireUser(req);
      const { grantId } = req.params as { grantId: string };
      const body = req.body as Buffer;
      if (!Buffer.isBuffer(body) || body.length === 0) throw validation('empty body');

      const grants = await db
        .select()
        .from(schema.uploadGrants)
        .where(and(eq(schema.uploadGrants.id, grantId), eq(schema.uploadGrants.userId, user.id)))
        .limit(1);
      const grant = grants[0];
      if (!grant) throw notFound('upload grant not found');
      if (grant.status !== 'pending' || grant.expiresAt < new Date()) {
        throw validation('upload grant expired or already used');
      }
      if (body.length > grant.maxBytes) throw validation('body exceeds granted size');
      if (detectFormat(body) === null) throw validation('unrecognized image format');

      await storage.put(env.S3_BUCKET_QUARANTINE, grant.objectKey, body, grant.mimeType);
      await db
        .update(schema.uploadGrants)
        .set({ status: 'uploaded' })
        .where(eq(schema.uploadGrants.id, grant.id));
      return { uploaded: true, bytes: body.length };
    },
  );

  /** Create the emote from an uploaded grant and queue processing. */
  app.post(
    '/creators/:creatorId/emotes',
    {
      schema: {
        params: z.object({ creatorId: z.string().uuid() }),
        body: createEmoteRequestSchema,
      },
    },
    async (req) => {
      const user = requireUser(req);
      const { creatorId } = req.params as { creatorId: string };
      const body = req.body as z.infer<typeof createEmoteRequestSchema>;
      const creator = await ownedCreator(app, user.id, creatorId);
      shortcodeSchema.parse(body.shortcode);

      const emoteCount = await db
        .select({ n: count() })
        .from(schema.emotes)
        .where(eq(schema.emotes.creatorId, creatorId));
      assertCanAddEmote(creator.plan as CreatorPlan, emoteCount[0]?.n ?? 0);

      const grants = await db
        .select()
        .from(schema.uploadGrants)
        .where(
          and(eq(schema.uploadGrants.id, body.uploadGrantId), eq(schema.uploadGrants.userId, user.id)),
        )
        .limit(1);
      const grant = grants[0];
      if (!grant || grant.status !== 'uploaded') {
        throw validation('upload grant missing or not yet uploaded');
      }

      // Early validation from quarantine so obvious garbage fails fast; the
      // worker re-validates and generates variants.
      const buffer = await storage.get(env.S3_BUCKET_QUARANTINE, grant.objectKey);
      if (!buffer) throw validation('uploaded object missing');
      const validated = await validateAsset(buffer, { claimedMimeType: grant.mimeType });
      if (validated.animated) assertCanUploadAnimated(creator.plan as CreatorPlan);

      const dupes = await db
        .select({ id: schema.emotes.id })
        .from(schema.emotes)
        .where(
          and(
            eq(schema.emotes.creatorId, creatorId),
            eq(schema.emotes.shortcode, body.shortcode),
          ),
        )
        .limit(1);
      if (dupes.length > 0) throw conflict('shortcode already used by this creator');

      const emote = await db.transaction(async (tx) => {
        const inserted = await tx
          .insert(schema.emotes)
          .values({
            creatorId,
            name: body.name,
            shortcode: body.shortcode,
            animated: validated.animated,
            status: 'processing',
            contentHash: validated.contentHash,
          })
          .returning();
        const emoteRow = inserted[0]!;
        await tx
          .update(schema.uploadGrants)
          .set({ status: 'consumed' })
          .where(eq(schema.uploadGrants.id, grant.id));
        await tx.insert(schema.assetProcessingJobs).values({
          emoteId: emoteRow.id,
          uploadGrantId: grant.id,
          status: 'queued',
        });
        for (const tagName of body.tags) {
          await tx.insert(schema.emoteTags).values({ name: tagName }).onConflictDoNothing();
          const tagRows = await tx
            .select()
            .from(schema.emoteTags)
            .where(eq(schema.emoteTags.name, tagName))
            .limit(1);
          if (tagRows[0]) {
            await tx
              .insert(schema.emoteTagLinks)
              .values({ emoteId: emoteRow.id, tagId: tagRows[0].id })
              .onConflictDoNothing();
          }
        }
        return emoteRow;
      });

      await jobs.enqueue('asset-processing', {
        emoteId: emote.id,
        quarantineKey: grant.objectKey,
        mimeType: grant.mimeType,
      });

      return {
        id: emote.id,
        name: emote.name,
        shortcode: emote.shortcode,
        animated: emote.animated,
        status: emote.status,
      };
    },
  );
};
