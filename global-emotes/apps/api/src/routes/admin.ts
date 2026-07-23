import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { count, desc, eq } from 'drizzle-orm';
import { schema } from '@global-emotes/database';
import { requireAdmin } from '../plugins/auth';
import { notFound } from '../errors';
import { applyEvidenceToRule } from '../services/entitlement-service';

/**
 * Admin tools (spec §20): least privilege via adminRole, mandatory reasons for
 * destructive actions, append-only admin_actions audit, no raw tokens ever.
 */
export const registerAdminRoutes: FastifyPluginAsync = async (app) => {
  const { db, providers } = app.ctx;

  app.get('/admin/overview', async (req) => {
    requireAdmin(req);
    const [users, creators, packs, emotes, liveEntitlements, openReports] = await Promise.all([
      db.select({ n: count() }).from(schema.users),
      db.select({ n: count() }).from(schema.creatorProfiles),
      db.select({ n: count() }).from(schema.emotePacks),
      db.select({ n: count() }).from(schema.emotes),
      db.select({ n: count() }).from(schema.entitlements).where(eq(schema.entitlements.status, 'active')),
      db.select({ n: count() }).from(schema.reports).where(eq(schema.reports.status, 'open')),
    ]);
    return {
      users: users[0]?.n ?? 0,
      creators: creators[0]?.n ?? 0,
      packs: packs[0]?.n ?? 0,
      emotes: emotes[0]?.n ?? 0,
      activeEntitlements: liveEntitlements[0]?.n ?? 0,
      openReports: openReports[0]?.n ?? 0,
    };
  });

  /** Integration health page: capability matrix + live health checks. */
  app.get('/admin/integrations', async (req) => {
    requireAdmin(req);
    const rows = await db.select().from(schema.providers);
    const items = await Promise.all(
      providers.all().map(async ({ id, adapter }) => ({
        id,
        enabled: rows.find((r) => r.id === id)?.enabled ?? false,
        capabilities: adapter.capabilities(),
        health: await adapter.healthCheck(),
      })),
    );
    return { items };
  });

  app.post(
    '/admin/providers/:providerId/toggle',
    {
      schema: {
        params: z.object({ providerId: z.string() }),
        body: z.object({ enabled: z.boolean(), reason: z.string().min(3) }),
      },
    },
    async (req) => {
      const admin = requireAdmin(req);
      const { providerId } = req.params as { providerId: string };
      const { enabled, reason } = req.body as { enabled: boolean; reason: string };
      await db
        .update(schema.providers)
        .set({ enabled, updatedAt: new Date() })
        .where(eq(schema.providers.id, providerId));
      await db.insert(schema.adminActions).values({
        adminUserId: admin.id,
        action: enabled ? 'provider.enabled' : 'provider.disabled',
        targetKind: 'provider',
        targetId: providerId,
        reason,
      });
      return { ok: true };
    },
  );

  app.post(
    '/admin/packs/:packId/suspend',
    {
      schema: {
        params: z.object({ packId: z.string().uuid() }),
        body: z.object({ reason: z.string().min(3) }),
      },
    },
    async (req) => {
      const admin = requireAdmin(req);
      const { packId } = req.params as { packId: string };
      const { reason } = req.body as { reason: string };
      const packs = await db
        .select()
        .from(schema.emotePacks)
        .where(eq(schema.emotePacks.id, packId))
        .limit(1);
      if (!packs[0]) throw notFound('pack not found');
      await db
        .update(schema.emotePacks)
        .set({ visibility: 'suspended' })
        .where(eq(schema.emotePacks.id, packId));
      await db.insert(schema.adminActions).values({
        adminUserId: admin.id,
        action: 'pack.suspended',
        targetKind: 'pack',
        targetId: packId,
        reason,
      });
      return { suspended: true };
    },
  );

  app.post(
    '/admin/emotes/:emoteId/takedown',
    {
      schema: {
        params: z.object({ emoteId: z.string().uuid() }),
        body: z.object({ reason: z.string().min(3) }),
      },
    },
    async (req) => {
      const admin = requireAdmin(req);
      const { emoteId } = req.params as { emoteId: string };
      const { reason } = req.body as { reason: string };
      await db.update(schema.emotes).set({ status: 'takedown' }).where(eq(schema.emotes.id, emoteId));
      await db.insert(schema.adminActions).values({
        adminUserId: admin.id,
        action: 'emote.takedown',
        targetKind: 'emote',
        targetId: emoteId,
        reason,
      });
      return { takedown: true };
    },
  );

  app.post(
    '/admin/entitlements/:entitlementId/revoke',
    {
      schema: {
        params: z.object({ entitlementId: z.string().uuid() }),
        body: z.object({ reason: z.string().min(3) }),
      },
    },
    async (req) => {
      const admin = requireAdmin(req);
      const { entitlementId } = req.params as { entitlementId: string };
      const { reason } = req.body as { reason: string };
      const rows = await db
        .select()
        .from(schema.entitlements)
        .where(eq(schema.entitlements.id, entitlementId))
        .limit(1);
      const entitlement = rows[0];
      if (!entitlement || !entitlement.ruleId) throw notFound('entitlement not found');
      const ruleRows = await db
        .select()
        .from(schema.entitlementRules)
        .where(eq(schema.entitlementRules.id, entitlement.ruleId))
        .limit(1);
      const rule = ruleRows[0];
      if (!rule) throw notFound('rule not found');
      await applyEvidenceToRule(
        db,
        entitlement.userId,
        entitlement.creatorId,
        {
          id: rule.id,
          packId: rule.packId,
          kind: rule.kind,
          providerId: rule.providerId,
          config: rule.config,
          graceHoursOverride: rule.graceHoursOverride,
        },
        {
          kind: 'admin_action',
          providerId: null,
          externalRef: `admin:${admin.id}:${reason}`,
          observedAt: new Date(),
          active: false,
          tier: null,
          expiresAt: null,
        },
      );
      await db.insert(schema.adminActions).values({
        adminUserId: admin.id,
        action: 'entitlement.revoked',
        targetKind: 'entitlement',
        targetId: entitlementId,
        reason,
      });
      return { revoked: true };
    },
  );

  app.get(
    '/admin/audit-logs',
    { schema: { querystring: z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }) } },
    async (req) => {
      requireAdmin(req);
      const { limit } = req.query as { limit: number };
      const rows = await db
        .select()
        .from(schema.auditLogs)
        .orderBy(desc(schema.auditLogs.createdAt))
        .limit(limit);
      return { items: rows };
    },
  );

  app.get('/admin/feature-flags', async (req) => {
    requireAdmin(req);
    return { items: await db.select().from(schema.featureFlags) };
  });

  app.post(
    '/admin/feature-flags/:key',
    {
      schema: {
        params: z.object({ key: z.string() }),
        body: z.object({ enabled: z.boolean(), reason: z.string().min(3) }),
      },
    },
    async (req) => {
      const admin = requireAdmin(req);
      const { key } = req.params as { key: string };
      const { enabled, reason } = req.body as { enabled: boolean; reason: string };
      const updated = await db
        .update(schema.featureFlags)
        .set({ enabled, updatedAt: new Date() })
        .where(eq(schema.featureFlags.key, key))
        .returning();
      if (updated.length === 0) throw notFound('unknown flag');
      await db.insert(schema.adminActions).values({
        adminUserId: admin.id,
        action: enabled ? 'flag.enabled' : 'flag.disabled',
        targetKind: 'feature_flag',
        targetId: key,
        reason,
      });
      return { ok: true };
    },
  );
};
