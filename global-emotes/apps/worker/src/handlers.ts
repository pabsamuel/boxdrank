import { and, eq, inArray, lt } from 'drizzle-orm';
import { schema, type Db } from '@global-emotes/database';
import {
  generateVariants,
  originalKey,
  validateAsset,
  variantKey,
  type ObjectStorage,
} from '@global-emotes/asset-pipeline';
import { sweepEntitlement, effectiveGraceHours } from '@global-emotes/entitlement-engine';
import { decryptSecret, encryptSecret } from '@global-emotes/auth';
import type { ProviderRegistry } from '@global-emotes/provider-sdk';
import type { AppEnv } from '@global-emotes/config';
import type { EmailSender } from '@global-emotes/notifications';
import { entitlementExpiringEmail } from '@global-emotes/notifications';

/**
 * Job handlers as pure-ish functions over injected dependencies — the BullMQ
 * wiring in index.ts is a thin shell, so every handler is unit-testable
 * without Redis. All handlers are idempotent (spec §22).
 */

export interface HandlerDeps {
  env: AppEnv;
  db: Db;
  storage: ObjectStorage;
  providers: ProviderRegistry;
  email: EmailSender;
  now?: () => Date;
}

// ── Asset processing ─────────────────────────────────────────────────────────

export async function handleAssetProcessing(
  deps: HandlerDeps,
  payload: { emoteId: string; quarantineKey: string; mimeType?: string },
): Promise<{ status: 'succeeded' | 'skipped' | 'failed'; reason?: string }> {
  const { db, storage, env } = deps;
  const emotes = await db
    .select()
    .from(schema.emotes)
    .where(eq(schema.emotes.id, payload.emoteId))
    .limit(1);
  const emote = emotes[0];
  if (!emote) return { status: 'skipped', reason: 'emote missing' };
  if (emote.status === 'active') return { status: 'skipped', reason: 'already processed' };

  const buffer = await storage.get(env.S3_BUCKET_QUARANTINE, payload.quarantineKey);
  if (!buffer) {
    await failEmote(db, emote.id, 'quarantine object missing');
    return { status: 'failed', reason: 'quarantine object missing' };
  }

  try {
    const validated = await validateAsset(buffer);
    // Canonical original + variants are content-addressed → free deduplication.
    await storage.put(
      env.S3_BUCKET_ORIGINALS,
      originalKey(validated.contentHash, validated.format),
      buffer,
      validated.mimeType,
    );
    const variants = await generateVariants(buffer, validated);
    const variantMeta = [] as Array<Record<string, unknown>>;
    for (const variant of variants) {
      const key = variantKey(validated.contentHash, variant.kind);
      await storage.put(env.S3_BUCKET_PROCESSED, key, variant.buffer, variant.mimeType);
      variantMeta.push({
        kind: variant.kind,
        key,
        mimeType: variant.mimeType,
        width: variant.width,
        height: variant.height,
        bytes: variant.buffer.length,
      });
    }
    await db.transaction(async (tx) => {
      await tx.insert(schema.emoteAssetVersions).values({
        emoteId: emote.id,
        version: emote.currentVersion,
        originalKey: originalKey(validated.contentHash, validated.format),
        mimeType: validated.mimeType,
        width: validated.width,
        height: validated.height,
        frameCount: validated.frameCount,
        durationMs: validated.durationMs,
        bytes: validated.bytes,
        contentHash: validated.contentHash,
        variants: variantMeta,
        processingStatus: 'succeeded',
      });
      await tx
        .update(schema.emotes)
        .set({ status: 'active', contentHash: validated.contentHash, animated: validated.animated })
        .where(eq(schema.emotes.id, emote.id));
      await tx
        .update(schema.assetProcessingJobs)
        .set({ status: 'succeeded', finishedAt: new Date() })
        .where(eq(schema.assetProcessingJobs.emoteId, emote.id));
    });
    // Quarantine object no longer needed.
    await storage.delete(env.S3_BUCKET_QUARANTINE, payload.quarantineKey);
    return { status: 'succeeded' };
  } catch (err) {
    await failEmote(db, emote.id, String(err));
    return { status: 'failed', reason: String(err) };
  }
}

async function failEmote(db: Db, emoteId: string, error: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(schema.emotes).set({ status: 'rejected' }).where(eq(schema.emotes.id, emoteId));
    await tx
      .update(schema.assetProcessingJobs)
      .set({ status: 'failed', error, finishedAt: new Date() })
      .where(eq(schema.assetProcessingJobs.emoteId, emoteId));
  });
}

// ── Entitlement reconciliation sweep ─────────────────────────────────────────

/**
 * Time-based sweep: expire lapsed entitlements, end lapsed grace periods, and
 * email fans entering grace. Runs on a schedule; also the provider-outage
 * safety net (grace instead of instant lock).
 */
export async function handleEntitlementSweep(
  deps: HandlerDeps,
): Promise<{ toGrace: number; toExpired: number }> {
  const { db, email, env } = deps;
  const now = deps.now?.() ?? new Date();
  let toGrace = 0;
  let toExpired = 0;

  const candidates = await db
    .select()
    .from(schema.entitlements)
    .where(inArray(schema.entitlements.status, ['active', 'grace']))
    .limit(5000);

  for (const row of candidates) {
    let graceHours = 72;
    if (row.ruleId) {
      const rules = await db
        .select()
        .from(schema.entitlementRules)
        .where(eq(schema.entitlementRules.id, row.ruleId))
        .limit(1);
      if (rules[0]) {
        graceHours = effectiveGraceHours(
          {
            id: rules[0].id,
            packId: rules[0].packId,
            kind: rules[0].kind,
            providerId: rules[0].providerId,
            config: rules[0].config,
            graceHoursOverride: rules[0].graceHoursOverride,
          },
          row.providerId,
        );
      }
    }
    const decision = sweepEntitlement(
      now,
      {
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
      },
      graceHours,
    );
    if (decision.action !== 'transition') continue;

    await db.transaction(async (tx) => {
      await tx
        .update(schema.entitlements)
        .set({
          status: decision.to,
          ...(decision.graceUntil !== undefined ? { graceUntil: decision.graceUntil } : {}),
          updatedAt: now,
        })
        .where(eq(schema.entitlements.id, row.id));
      await tx.insert(schema.entitlementEvidence).values({
        entitlementId: row.id,
        kind: 'api_poll',
        providerId: row.providerId,
        externalRef: `sweep:${now.toISOString()}`,
        payload: { decision: decision.to, reason: decision.reason },
        observedAt: now,
      });
    });

    if (decision.to === 'grace') {
      toGrace++;
      const userRows = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, row.userId))
        .limit(1);
      const packRows = row.packId
        ? await db.select().from(schema.emotePacks).where(eq(schema.emotePacks.id, row.packId)).limit(1)
        : [];
      const creatorRows = await db
        .select()
        .from(schema.creatorProfiles)
        .where(eq(schema.creatorProfiles.id, row.creatorId))
        .limit(1);
      if (userRows[0] && decision.graceUntil) {
        await email.send(
          entitlementExpiringEmail(
            env.BRAND_NAME,
            userRows[0].primaryEmail,
            packRows[0]?.name ?? 'a pack',
            creatorRows[0]?.displayName ?? 'a creator',
            decision.graceUntil,
          ),
        );
      }
    } else if (decision.to === 'expired') {
      toExpired++;
    }
  }
  return { toGrace, toExpired };
}

// ── Provider token refresh ───────────────────────────────────────────────────

export async function handleTokenRefresh(deps: HandlerDeps): Promise<{ refreshed: number; failed: number }> {
  const { db, providers, env } = deps;
  const now = deps.now?.() ?? new Date();
  const soon = new Date(now.getTime() + 30 * 60_000);
  let refreshed = 0;
  let failed = 0;

  const expiring = await db
    .select({
      token: schema.providerTokens,
      connection: schema.providerConnections,
    })
    .from(schema.providerTokens)
    .innerJoin(
      schema.providerConnections,
      eq(schema.providerTokens.connectionId, schema.providerConnections.id),
    )
    .where(
      and(lt(schema.providerTokens.expiresAt, soon), eq(schema.providerConnections.status, 'active')),
    )
    .limit(500);

  for (const { token, connection } of expiring) {
    if (!token.refreshTokenEnc) continue;
    const adapter = providers.get(connection.providerId as never);
    try {
      const next = await adapter.refreshToken({
        refreshToken: decryptSecret(token.refreshTokenEnc, env.TOKEN_ENCRYPTION_KEY),
      });
      await db
        .update(schema.providerTokens)
        .set({
          accessTokenEnc: encryptSecret(next.accessToken, env.TOKEN_ENCRYPTION_KEY),
          refreshTokenEnc: next.refreshToken
            ? encryptSecret(next.refreshToken, env.TOKEN_ENCRYPTION_KEY)
            : token.refreshTokenEnc,
          expiresAt: next.expiresAt,
          updatedAt: now,
        })
        .where(eq(schema.providerTokens.id, token.id));
      refreshed++;
    } catch {
      failed++;
      await db
        .update(schema.providerConnections)
        .set({ status: 'expired', updatedAt: now })
        .where(eq(schema.providerConnections.id, connection.id));
    }
  }
  return { refreshed, failed };
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

export async function handleCleanup(deps: HandlerDeps): Promise<{ expiredGrants: number; expiredTokens: number }> {
  const { db } = deps;
  const now = deps.now?.() ?? new Date();
  const grants = await db
    .update(schema.uploadGrants)
    .set({ status: 'expired' })
    .where(and(eq(schema.uploadGrants.status, 'pending'), lt(schema.uploadGrants.expiresAt, now)))
    .returning({ id: schema.uploadGrants.id });
  const tokens = await db
    .delete(schema.authTokens)
    .where(lt(schema.authTokens.expiresAt, new Date(now.getTime() - 24 * 3_600_000)))
    .returning({ id: schema.authTokens.id });
  return { expiredGrants: grants.length, expiredTokens: tokens.length };
}
