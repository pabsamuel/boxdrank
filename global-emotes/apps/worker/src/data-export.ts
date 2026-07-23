import { eq } from 'drizzle-orm';
import { schema, type Db } from '@global-emotes/database';
import type { ObjectStorage } from '@global-emotes/asset-pipeline';
import type { AppEnv } from '@global-emotes/config';

/**
 * GDPR-style data export: assemble everything we hold about a user into one
 * JSON archive in a private bucket, deliver a short-lived signed URL. Provider
 * tokens are deliberately excluded (secrets, not user data).
 */
export async function handleDataExport(
  deps: { db: Db; storage: ObjectStorage; env: AppEnv },
  payload: { requestId: string },
): Promise<{ status: 'succeeded' | 'skipped' | 'failed'; url?: string; reason?: string }> {
  const { db, storage, env } = deps;
  const requests = await db
    .select()
    .from(schema.dataExportRequests)
    .where(eq(schema.dataExportRequests.id, payload.requestId))
    .limit(1);
  const request = requests[0];
  if (!request) return { status: 'skipped', reason: 'request missing' };
  if (request.status === 'ready') return { status: 'skipped', reason: 'already exported' };

  await db
    .update(schema.dataExportRequests)
    .set({ status: 'processing' })
    .where(eq(schema.dataExportRequests.id, request.id));

  try {
    const userId = request.userId;
    const byUser = <T extends { userId: unknown }>(t: { userId: unknown }) =>
      eq(t.userId as never, userId);

    const [users, emails, connections, entitlements, favorites, recents, consents, events] =
      await Promise.all([
        db.select().from(schema.users).where(eq(schema.users.id, userId)),
        db.select().from(schema.userEmails).where(byUser(schema.userEmails)),
        db
          .select({
            providerId: schema.providerConnections.providerId,
            externalAccountId: schema.providerConnections.externalAccountId,
            displayName: schema.providerConnections.displayName,
            status: schema.providerConnections.status,
            createdAt: schema.providerConnections.createdAt,
          })
          .from(schema.providerConnections)
          .where(byUser(schema.providerConnections)),
        db.select().from(schema.entitlements).where(byUser(schema.entitlements)),
        db.select().from(schema.favorites).where(byUser(schema.favorites)),
        db.select().from(schema.recentEmotes).where(byUser(schema.recentEmotes)),
        db.select().from(schema.userConsents).where(byUser(schema.userConsents)),
        db
          .select()
          .from(schema.privacySafeUsageEvents)
          .where(eq(schema.privacySafeUsageEvents.userId, userId))
          .limit(10_000),
      ]);

    const user = users[0];
    if (!user) throw new Error('user missing');
    const archive = {
      exportedAt: new Date().toISOString(),
      format: 'global-emotes-export-v1',
      account: {
        id: user.id,
        email: user.primaryEmail,
        displayName: user.displayName,
        createdAt: user.createdAt,
      },
      emails,
      providerConnections: connections, // tokens intentionally excluded
      entitlements,
      favorites,
      recents,
      consents,
      usageEvents: events,
    };

    const key = `exports/${userId}/${request.id}.json`;
    await storage.put(
      env.S3_BUCKET_QUARANTINE, // private bucket; 7-day lifecycle doubles as link expiry
      key,
      Buffer.from(JSON.stringify(archive, null, 2)),
      'application/json',
    );
    const url = await storage.signedGetUrl(env.S3_BUCKET_QUARANTINE, key, 24 * 3600);
    await db
      .update(schema.dataExportRequests)
      .set({ status: 'ready', objectKey: key, completedAt: new Date() })
      .where(eq(schema.dataExportRequests.id, request.id));
    return { status: 'succeeded', url };
  } catch (err) {
    await db
      .update(schema.dataExportRequests)
      .set({ status: 'failed' })
      .where(eq(schema.dataExportRequests.id, request.id));
    return { status: 'failed', reason: String(err) };
  }
}
