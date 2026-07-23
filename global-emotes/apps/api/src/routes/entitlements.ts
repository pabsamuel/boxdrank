import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { schema } from '@global-emotes/database';
import { redeemCodeRequestSchema } from '@global-emotes/contracts';
import { generateAccessCode, decryptSecret } from '@global-emotes/auth';
import { CREATOR_PLAN_LIMITS, type CreatorPlan } from '@global-emotes/config';
import { requireUser } from '../plugins/auth';
import { notFound, validation } from '../errors';
import { ownedPack } from './packs';
import { applyEvidenceToRule, refreshUserEntitlements } from '../services/entitlement-service';

export const registerEntitlementRoutes: FastifyPluginAsync = async (app) => {
  const { db, env, providers } = app.ctx;

  app.get('/entitlements', async (req) => {
    const user = requireUser(req);
    const rows = await db
      .select({
        id: schema.entitlements.id,
        packId: schema.entitlements.packId,
        creatorId: schema.entitlements.creatorId,
        providerId: schema.entitlements.providerId,
        tier: schema.entitlements.tier,
        status: schema.entitlements.status,
        startedAt: schema.entitlements.startedAt,
        expiresAt: schema.entitlements.expiresAt,
        graceUntil: schema.entitlements.graceUntil,
      })
      .from(schema.entitlements)
      .where(eq(schema.entitlements.userId, user.id))
      .orderBy(desc(schema.entitlements.updatedAt))
      .limit(200);
    return {
      items: rows.map((r) => ({
        ...r,
        startedAt: r.startedAt.toISOString(),
        expiresAt: r.expiresAt?.toISOString() ?? null,
        graceUntil: r.graceUntil?.toISOString() ?? null,
      })),
      nextCursor: null,
    };
  });

  /** On-demand entitlement refresh across connected providers. */
  app.post(
    '/entitlements/refresh',
    { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } },
    async (req) => {
      const user = requireUser(req);
      const result = await refreshUserEntitlements(
        db,
        providers,
        (enc) => decryptSecret(enc, env.TOKEN_ENCRYPTION_KEY),
        user.id,
      );
      return result;
    },
  );

  /** Redeem a creator-issued access code (brute-force rate-limited). */
  app.post(
    '/codes/redeem',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
      schema: { body: redeemCodeRequestSchema },
    },
    async (req) => {
      const user = requireUser(req);
      const { code } = req.body as { code: string };

      // Throwing inside the transaction rolls back the redemption-count bump.
      const codeRow = await db.transaction(async (tx) => {
        const codes = await tx
          .select()
          .from(schema.accessCodes)
          .where(eq(schema.accessCodes.code, code))
          .limit(1);
        const row = codes[0];
        if (!row) throw validation('invalid code');
        if (row.revokedAt) throw validation('code revoked');
        if (row.expiresAt && row.expiresAt < new Date()) throw validation('code expired');
        if (row.redemptionCount >= row.maxRedemptions) throw validation('code fully redeemed');
        const already = await tx
          .select({ id: schema.accessCodeRedemptions.id })
          .from(schema.accessCodeRedemptions)
          .where(
            and(
              eq(schema.accessCodeRedemptions.codeId, row.id),
              eq(schema.accessCodeRedemptions.userId, user.id),
            ),
          )
          .limit(1);
        if (already.length > 0) throw validation('code already redeemed');

        await tx
          .update(schema.accessCodes)
          .set({ redemptionCount: row.redemptionCount + 1 })
          .where(eq(schema.accessCodes.id, row.id));
        return row;
      });

      // Find (or synthesize) the pack's access_code rule and grant via the engine.
      const rules = await db
        .select()
        .from(schema.entitlementRules)
        .where(
          and(
            eq(schema.entitlementRules.packId, codeRow.packId),
            eq(schema.entitlementRules.kind, 'access_code'),
          ),
        )
        .limit(1);
      let rule = rules[0];
      if (!rule) {
        const inserted = await db
          .insert(schema.entitlementRules)
          .values({
            packId: codeRow.packId,
            kind: 'access_code',
            providerId: 'access_code',
          })
          .returning();
        rule = inserted[0]!;
      }

      const expiresAt = codeRow.grantDurationHours
        ? new Date(Date.now() + codeRow.grantDurationHours * 3_600_000)
        : null;
      await applyEvidenceToRule(
        db,
        user.id,
        codeRow.creatorId,
        {
          id: rule.id,
          packId: rule.packId,
          kind: rule.kind,
          providerId: rule.providerId,
          config: rule.config,
          graceHoursOverride: rule.graceHoursOverride,
        },
        {
          kind: 'access_code',
          providerId: 'access_code',
          externalRef: `code:${codeRow.id}`,
          observedAt: new Date(),
          active: true,
          tier: codeRow.tier,
          expiresAt,
        },
      );

      const entitlement = await db
        .select()
        .from(schema.entitlements)
        .where(
          and(
            eq(schema.entitlements.userId, user.id),
            eq(schema.entitlements.ruleId, rule.id),
            inArray(schema.entitlements.status, ['active', 'grace']),
          ),
        )
        .limit(1);
      await db.insert(schema.accessCodeRedemptions).values({
        codeId: codeRow.id,
        userId: user.id,
        entitlementId: entitlement[0]?.id ?? null,
      });

      return { unlocked: true, packId: codeRow.packId };
    },
  );

  /** Creator: generate a batch of access codes for a pack. */
  app.post(
    '/packs/:packId/codes',
    {
      schema: {
        params: z.object({ packId: z.string().uuid() }),
        body: z.object({
          quantity: z.number().int().min(1).max(10_000).default(1),
          tier: z.string().max(32).nullable().default(null),
          maxRedemptions: z.number().int().min(1).max(100_000).default(1),
          grantDurationHours: z
            .number()
            .int()
            .min(1)
            .max(24 * 365)
            .nullable()
            .default(null),
          expiresAt: z.string().datetime().nullable().default(null),
        }),
      },
    },
    async (req) => {
      const user = requireUser(req);
      const { packId } = req.params as { packId: string };
      const body = req.body as {
        quantity: number;
        tier: string | null;
        maxRedemptions: number;
        grantDurationHours: number | null;
        expiresAt: string | null;
      };
      const pack = await ownedPack(app, user.id, packId);
      const creatorRows = await db
        .select({ plan: schema.creatorProfiles.plan })
        .from(schema.creatorProfiles)
        .where(eq(schema.creatorProfiles.id, pack.creatorId))
        .limit(1);
      const plan = (creatorRows[0]?.plan ?? 'creator_free') as CreatorPlan;
      const maxBatch = CREATOR_PLAN_LIMITS[plan].maxAccessCodesPerBatch;
      if (body.quantity > maxBatch) {
        throw validation(`plan ${plan} allows at most ${maxBatch} codes per batch`);
      }

      const batchId = crypto.randomUUID();
      const values = Array.from({ length: body.quantity }, () => ({
        creatorId: pack.creatorId,
        packId: pack.id,
        code: generateAccessCode(),
        tier: body.tier,
        batchId,
        maxRedemptions: body.maxRedemptions,
        grantDurationHours: body.grantDurationHours,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        createdBy: user.id,
      }));
      const inserted = await db.insert(schema.accessCodes).values(values).returning({
        id: schema.accessCodes.id,
        code: schema.accessCodes.code,
      });
      return { batchId, codes: inserted };
    },
  );

  app.post(
    '/codes/:codeId/revoke',
    { schema: { params: z.object({ codeId: z.string().uuid() }) } },
    async (req) => {
      const user = requireUser(req);
      const { codeId } = req.params as { codeId: string };
      const codes = await db
        .select()
        .from(schema.accessCodes)
        .where(eq(schema.accessCodes.id, codeId))
        .limit(1);
      const code = codes[0];
      if (!code) throw notFound('code not found');
      await ownedPack(app, user.id, code.packId);
      await db
        .update(schema.accessCodes)
        .set({ revokedAt: new Date() })
        .where(eq(schema.accessCodes.id, codeId));
      return { revoked: true };
    },
  );
};
