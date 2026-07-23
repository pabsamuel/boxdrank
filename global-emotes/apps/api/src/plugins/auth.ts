import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, isNull, gt } from 'drizzle-orm';
import { schema } from '@global-emotes/database';
import { hashToken, SESSION_COOKIE } from '@global-emotes/auth';
import { forbidden, unauthorized } from '../errors';

export interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
  adminRole: string | null;
  fanPlan: string;
  sessionId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

/**
 * Session resolution from the httpOnly cookie. The cookie carries an opaque
 * token; only its SHA-256 lives in the database, so a DB leak does not leak
 * usable sessions. Guards: requireUser / requireAdmin.
 */
export const authPlugin: FastifyPluginAsync = fp(async (app) => {
  app.decorateRequest('user', null);

  app.addHook('preHandler', async (req) => {
    const raw = req.cookies[SESSION_COOKIE];
    if (!raw) return;
    const rows = await app.ctx.db
      .select({
        sessionId: schema.sessions.id,
        userId: schema.users.id,
        email: schema.users.primaryEmail,
        displayName: schema.users.displayName,
        adminRole: schema.users.adminRole,
        fanPlan: schema.users.fanPlan,
        status: schema.users.status,
      })
      .from(schema.sessions)
      .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
      .where(
        and(
          eq(schema.sessions.tokenHash, hashToken(raw)),
          isNull(schema.sessions.revokedAt),
          gt(schema.sessions.expiresAt, new Date()),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row || row.status !== 'active') return;
    req.user = {
      id: row.userId,
      email: row.email,
      displayName: row.displayName,
      adminRole: row.adminRole,
      fanPlan: row.fanPlan,
      sessionId: row.sessionId,
    };
  });
});

export function requireUser(req: FastifyRequest): SessionUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

export function requireAdmin(req: FastifyRequest): SessionUser {
  const user = requireUser(req);
  if (!user.adminRole) throw forbidden('admin access required');
  return user;
}

export function setSessionCookie(reply: FastifyReply, token: string, secure: boolean): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 3600,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}
