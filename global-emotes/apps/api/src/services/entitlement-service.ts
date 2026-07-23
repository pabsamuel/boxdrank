import { and, eq, inArray } from 'drizzle-orm';
import { schema, type Db } from '@global-emotes/database';
import type { ExternalEntitlement } from '@global-emotes/contracts';
import {
  decideEntitlement,
  effectiveGraceHours,
  ruleMatchesEvidence,
  evidenceDedupeKey,
  type EngineEvidence,
  type EngineRule,
  type EntitlementSnapshot,
} from '@global-emotes/entitlement-engine';

/**
 * Driver between provider adapters and the pure entitlement engine.
 * Loads matching rules + current entitlements, asks the engine for decisions,
 * applies them transactionally, and records evidence rows (the audit trail).
 */

export interface ApplyResult {
  granted: number;
  extended: number;
  transitioned: number;
  ignored: number;
}

export async function applyExternalEvidence(
  db: Db,
  userId: string,
  items: ExternalEntitlement[],
  now = new Date(),
): Promise<ApplyResult> {
  const result: ApplyResult = { granted: 0, extended: 0, transitioned: 0, ignored: 0 };

  for (const item of items) {
    // 1. Which creator does this external account belong to?
    const creatorAccounts = await db
      .select()
      .from(schema.externalCreatorAccounts)
      .where(
        and(
          eq(schema.externalCreatorAccounts.providerId, item.providerId),
          eq(schema.externalCreatorAccounts.externalAccountId, item.externalCreatorAccountId),
        ),
      );
    if (creatorAccounts.length === 0) {
      result.ignored++;
      continue;
    }

    for (const creatorAccount of creatorAccounts) {
      // 2. Load this creator's rules for published packs and match.
      const rules = await db
        .select({
          rule: schema.entitlementRules,
          packCreatorId: schema.emotePacks.creatorId,
        })
        .from(schema.entitlementRules)
        .innerJoin(schema.emotePacks, eq(schema.entitlementRules.packId, schema.emotePacks.id))
        .where(eq(schema.emotePacks.creatorId, creatorAccount.creatorId));

      for (const { rule } of rules) {
        const engineRule: EngineRule = {
          id: rule.id,
          packId: rule.packId,
          kind: rule.kind,
          providerId: rule.providerId,
          config: rule.config,
          graceHoursOverride: rule.graceHoursOverride,
        };
        if (!ruleMatchesEvidence(engineRule, item) && item.active) continue;
        // Negative evidence must still reach rules of the same provider so
        // membership loss can end access even when tier no longer matches.
        if (!item.active && rule.providerId !== item.providerId) continue;

        const evidence: EngineEvidence = {
          kind: 'api_poll',
          providerId: item.providerId,
          externalRef: item.externalRef,
          observedAt: new Date(item.observedAt),
          active: item.active,
          tier: item.tier,
          expiresAt: item.expiresAt ? new Date(item.expiresAt) : null,
          payload: item.raw ?? {},
        };
        const outcome = await applyEvidenceToRule(
          db,
          userId,
          creatorAccount.creatorId,
          engineRule,
          evidence,
          now,
        );
        result[outcome]++;
      }
    }
  }
  return result;
}

export async function applyEvidenceToRule(
  db: Db,
  userId: string,
  creatorId: string,
  rule: EngineRule,
  evidence: EngineEvidence,
  now = new Date(),
): Promise<'granted' | 'extended' | 'transitioned' | 'ignored'> {
  return db.transaction(async (tx) => {
    const currentRows = await tx
      .select()
      .from(schema.entitlements)
      .where(
        and(
          eq(schema.entitlements.userId, userId),
          eq(schema.entitlements.ruleId, rule.id),
          inArray(schema.entitlements.status, ['pending', 'active', 'grace']),
        ),
      )
      .limit(1);
    let row = currentRows[0] ?? null;
    if (!row) {
      // Fall back to most recent historical row so expired entitlements can revive.
      const history = await tx
        .select()
        .from(schema.entitlements)
        .where(and(eq(schema.entitlements.userId, userId), eq(schema.entitlements.ruleId, rule.id)))
        .orderBy(schema.entitlements.createdAt)
        .limit(50);
      row = history[history.length - 1] ?? null;
    }

    const current: EntitlementSnapshot | null = row
      ? {
          id: row.id,
          userId: row.userId,
          creatorId: row.creatorId,
          packId: row.packId,
          ruleId: row.ruleId,
          providerId: row.providerId,
          tier: row.tier,
          status: row.status,
          startedAt: row.startedAt,
          lastVerifiedAt: row.lastVerifiedAt,
          expiresAt: row.expiresAt,
          graceUntil: row.graceUntil,
        }
      : null;

    // Duplicate suppression from stored evidence of this entitlement.
    const seen = new Set<string>();
    if (row) {
      const evidenceRows = await tx
        .select()
        .from(schema.entitlementEvidence)
        .where(eq(schema.entitlementEvidence.entitlementId, row.id))
        .limit(200);
      for (const e of evidenceRows) {
        seen.add(
          `${e.kind}:${e.providerId ?? 'none'}:${e.externalRef ?? ''}:${e.observedAt.toISOString()}:${String(
            (e.payload as { active?: boolean }).active ?? true,
          )}`,
        );
      }
    }

    const graceHours = effectiveGraceHours(rule, evidence.providerId);
    const decision = decideEntitlement({
      now,
      rule,
      current,
      evidence,
      graceHours,
      seenEvidenceKeys: seen,
    });

    if (decision.action === 'ignore') return 'ignored';

    let entitlementId: string;
    if (decision.action === 'create') {
      const inserted = await tx
        .insert(schema.entitlements)
        .values({
          userId,
          creatorId,
          packId: rule.packId,
          ruleId: rule.id,
          providerId: evidence.providerId,
          tier: decision.tier,
          status: decision.status,
          startedAt: now,
          lastVerifiedAt: evidence.observedAt,
          expiresAt: decision.expiresAt,
        })
        .returning({ id: schema.entitlements.id });
      entitlementId = inserted[0]!.id;
    } else {
      entitlementId = row!.id;
      if (decision.action === 'extend') {
        await tx
          .update(schema.entitlements)
          .set({
            tier: decision.tier,
            expiresAt: decision.expiresAt,
            lastVerifiedAt: decision.lastVerifiedAt,
            updatedAt: now,
          })
          .where(eq(schema.entitlements.id, entitlementId));
      } else {
        await tx
          .update(schema.entitlements)
          .set({
            status: decision.to,
            ...(decision.tier !== undefined ? { tier: decision.tier } : {}),
            ...(decision.expiresAt !== undefined ? { expiresAt: decision.expiresAt } : {}),
            ...(decision.graceUntil !== undefined ? { graceUntil: decision.graceUntil } : {}),
            ...(decision.lastVerifiedAt ? { lastVerifiedAt: decision.lastVerifiedAt } : {}),
            ...(decision.to === 'revoked' ? { revokedReason: decision.reason } : {}),
            updatedAt: now,
          })
          .where(eq(schema.entitlements.id, entitlementId));
      }
    }

    await tx.insert(schema.entitlementEvidence).values({
      entitlementId,
      kind: evidence.kind,
      providerId: evidence.providerId,
      externalRef: evidence.externalRef,
      payload: { ...evidence.payload, active: evidence.active, decision: decision.action },
      observedAt: evidence.observedAt,
    });

    return decision.action === 'create'
      ? 'granted'
      : decision.action === 'extend'
        ? 'extended'
        : 'transitioned';
  });
}

/** Sync a user's entitlements across all connected providers (on-demand refresh). */
export async function refreshUserEntitlements(
  db: Db,
  providers: import('@global-emotes/provider-sdk').ProviderRegistry,
  decryptToken: (enc: string) => string,
  userId: string,
): Promise<ApplyResult> {
  const totals: ApplyResult = { granted: 0, extended: 0, transitioned: 0, ignored: 0 };

  const connections = await db
    .select()
    .from(schema.providerConnections)
    .where(
      and(
        eq(schema.providerConnections.userId, userId),
        eq(schema.providerConnections.status, 'active'),
      ),
    );

  for (const connection of connections) {
    const adapter = providers.get(connection.providerId as never);
    if (!adapter.syncFanEntitlements) continue;

    const tokenRows = await db
      .select()
      .from(schema.providerTokens)
      .where(eq(schema.providerTokens.connectionId, connection.id))
      .limit(1);
    const tokenRow = tokenRows[0];
    if (!tokenRow) continue;

    // All creator accounts on this provider are candidate targets.
    const targets = await db
      .select({
        externalAccountId: schema.externalCreatorAccounts.externalAccountId,
      })
      .from(schema.externalCreatorAccounts)
      .where(eq(schema.externalCreatorAccounts.providerId, connection.providerId));
    if (targets.length === 0) continue;

    const evidence = await adapter.syncFanEntitlements({
      context: { accessToken: decryptToken(tokenRow.accessTokenEnc) },
      externalFanAccountId: connection.externalAccountId,
      targets: targets.map((t) => ({ externalCreatorAccountId: t.externalAccountId })),
    });
    const applied = await applyExternalEvidence(db, userId, evidence);
    totals.granted += applied.granted;
    totals.extended += applied.extended;
    totals.transitioned += applied.transitioned;
    totals.ignored += applied.ignored;
  }
  return totals;
}
