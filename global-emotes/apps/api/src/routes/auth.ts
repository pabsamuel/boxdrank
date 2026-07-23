import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { schema } from '@global-emotes/database';
import { generateToken, hashToken, magicLinkExpiry, sessionExpiry } from '@global-emotes/auth';
import { magicLinkEmail } from '@global-emotes/notifications';
import { clearSessionCookie, requireUser, setSessionCookie } from '../plugins/auth';
import { validation } from '../errors';

/**
 * Magic-link auth: request → single-use token emailed → verify → session.
 * Anti-abuse: tight per-IP rate limit on the request endpoint, single-use
 * tokens (15 min TTL), constant response regardless of account existence.
 */
export const registerAuthRoutes: FastifyPluginAsync = async (app) => {
  const { db, env, email } = app.ctx;

  app.post(
    '/auth/magic-link',
    {
      config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
      schema: { body: z.object({ email: z.string().email().toLowerCase() }) },
    },
    async (req) => {
      const { email: address } = req.body as { email: string };
      const token = generateToken();
      await db.insert(schema.authTokens).values({
        email: address,
        tokenHash: hashToken(token),
        purpose: 'magic_link',
        expiresAt: magicLinkExpiry(),
      });
      const link = `${env.PUBLIC_WEB_URL}/auth/verify?token=${token}`;
      await email.send(magicLinkEmail(env.BRAND_NAME, address, link));
      // Same response whether or not an account exists (no user enumeration).
      return { sent: true };
    },
  );

  app.post(
    '/auth/verify',
    {
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
      schema: { body: z.object({ token: z.string().min(10) }) },
    },
    async (req, reply) => {
      const { token } = req.body as { token: string };
      const result = await db.transaction(async (tx) => {
        const rows = await tx
          .select()
          .from(schema.authTokens)
          .where(
            and(
              eq(schema.authTokens.tokenHash, hashToken(token)),
              isNull(schema.authTokens.consumedAt),
            ),
          )
          .limit(1);
        const authToken = rows[0];
        if (!authToken || authToken.expiresAt < new Date()) return null;
        await tx
          .update(schema.authTokens)
          .set({ consumedAt: new Date() })
          .where(eq(schema.authTokens.id, authToken.id));

        let userRows = await tx
          .select()
          .from(schema.users)
          .where(eq(schema.users.primaryEmail, authToken.email))
          .limit(1);
        let user = userRows[0];
        if (!user) {
          const inserted = await tx
            .insert(schema.users)
            .values({ primaryEmail: authToken.email })
            .returning();
          user = inserted[0]!;
          await tx.insert(schema.userEmails).values({
            userId: user.id,
            email: authToken.email,
            isPrimary: true,
            verifiedAt: new Date(),
          });
          await tx.insert(schema.auditLogs).values({
            actorType: 'user',
            actorId: user.id,
            action: 'user.created',
            targetKind: 'user',
            targetId: user.id,
          });
        }
        if (user.status !== 'active') return null;

        const sessionToken = generateToken();
        await tx.insert(schema.sessions).values({
          userId: user.id,
          tokenHash: hashToken(sessionToken),
          expiresAt: sessionExpiry(),
          ip: req.ip,
          userAgent: req.headers['user-agent'] ?? null,
        });
        return { user, sessionToken };
      });

      if (!result) throw validation('invalid or expired token');
      setSessionCookie(reply, result.sessionToken, env.NODE_ENV === 'production');
      return {
        user: {
          id: result.user.id,
          email: result.user.primaryEmail,
          displayName: result.user.displayName,
        },
      };
    },
  );

  app.post('/auth/logout', async (req, reply) => {
    const user = requireUser(req);
    await db
      .update(schema.sessions)
      .set({ revokedAt: new Date() })
      .where(eq(schema.sessions.id, user.sessionId));
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get('/me', async (req) => {
    const user = requireUser(req);
    const creators = await db
      .select({
        id: schema.creatorProfiles.id,
        handle: schema.creatorProfiles.handle,
        displayName: schema.creatorProfiles.displayName,
        plan: schema.creatorProfiles.plan,
      })
      .from(schema.creatorProfiles)
      .where(
        and(eq(schema.creatorProfiles.userId, user.id), isNull(schema.creatorProfiles.deletedAt)),
      );
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      fanPlan: user.fanPlan,
      isAdmin: user.adminRole !== null,
      creatorProfiles: creators,
    };
  });
};
