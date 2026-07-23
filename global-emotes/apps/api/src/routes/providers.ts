import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { schema } from '@global-emotes/database';
import { encryptSecret, generateToken, decryptSecret } from '@global-emotes/auth';
import type { ProviderId } from '@global-emotes/contracts';
import { requireUser } from '../plugins/auth';
import { notFound, validation } from '../errors';
import { refreshUserEntitlements } from '../services/entitlement-service';

const providerIdParam = z.object({
  providerId: z.enum(['mock', 'twitch', 'discord', 'patreon', 'youtube', 'kick']),
});

/**
 * Provider connections: OAuth start/callback with state validation, encrypted
 * token storage, external-account linking, and an immediate entitlement sync.
 * Tokens are never returned to clients.
 */
export const registerProviderRoutes: FastifyPluginAsync = async (app) => {
  const { db, env, providers } = app.ctx;

  app.get('/providers', async () => {
    const rows = await db.select().from(schema.providers);
    return {
      items: rows.map((row) => {
        const adapter = providers.get(row.id as ProviderId);
        const caps = adapter.capabilities();
        return {
          id: row.id,
          name: row.name,
          status: caps.status,
          enabled: row.enabled,
          capabilities: caps,
        };
      }),
    };
  });

  app.get(
    '/providers/:providerId/connect',
    {
      schema: {
        params: providerIdParam,
        querystring: z.object({ role: z.enum(['fan', 'creator']).default('fan') }),
      },
    },
    async (req, reply) => {
      const user = requireUser(req);
      const { providerId } = req.params as { providerId: ProviderId };
      const { role } = req.query as { role: 'fan' | 'creator' };
      const providerRows = await db
        .select()
        .from(schema.providers)
        .where(eq(schema.providers.id, providerId))
        .limit(1);
      if (!providerRows[0]?.enabled) throw validation('provider is not enabled');

      const adapter = providers.get(providerId);
      const state = generateToken();
      // Bind state to the session via a short-lived signed cookie (CSRF defense).
      reply.setCookie(`ge_oauth_${providerId}`, `${state}:${role}:${user.id}`, {
        httpOnly: true,
        sameSite: 'lax',
        signed: true,
        path: '/',
        maxAge: 600,
      });
      const url = await adapter.getAuthorizationUrl({
        redirectUri: `${env.PUBLIC_API_URL}/v1/providers/${providerId}/callback`,
        state,
        role,
      });
      return { url };
    },
  );

  app.get(
    '/providers/:providerId/callback',
    {
      schema: {
        params: providerIdParam,
        querystring: z.object({ code: z.string(), state: z.string() }),
      },
    },
    async (req, reply) => {
      const user = requireUser(req);
      const { providerId } = req.params as { providerId: ProviderId };
      const { code, state } = req.query as { code: string; state: string };

      const cookieRaw = req.cookies[`ge_oauth_${providerId}`];
      const unsigned = cookieRaw ? req.unsignCookie(cookieRaw) : null;
      if (!unsigned?.valid || !unsigned.value) throw validation('missing oauth state');
      const [expectedState, role, cookieUserId] = unsigned.value.split(':');
      if (state !== expectedState || cookieUserId !== user.id) {
        throw validation('oauth state mismatch');
      }
      reply.clearCookie(`ge_oauth_${providerId}`, { path: '/' });

      const adapter = providers.get(providerId);
      const tokens = await adapter.exchangeAuthorizationCode({
        code,
        redirectUri: `${env.PUBLIC_API_URL}/v1/providers/${providerId}/callback`,
      });
      const identity = await adapter.fetchIdentity({ accessToken: tokens.accessToken });

      const connection = await db.transaction(async (tx) => {
        const inserted = await tx
          .insert(schema.providerConnections)
          .values({
            userId: user.id,
            providerId,
            externalAccountId: identity.externalAccountId,
            displayName: identity.displayName,
            scopes: tokens.scopes,
            status: 'active',
          })
          .onConflictDoUpdate({
            target: [
              schema.providerConnections.userId,
              schema.providerConnections.providerId,
              schema.providerConnections.externalAccountId,
            ],
            set: { status: 'active', displayName: identity.displayName, updatedAt: new Date() },
          })
          .returning();
        const conn = inserted[0]!;
        await tx
          .delete(schema.providerTokens)
          .where(eq(schema.providerTokens.connectionId, conn.id));
        await tx.insert(schema.providerTokens).values({
          connectionId: conn.id,
          accessTokenEnc: encryptSecret(tokens.accessToken, env.TOKEN_ENCRYPTION_KEY),
          refreshTokenEnc: tokens.refreshToken
            ? encryptSecret(tokens.refreshToken, env.TOKEN_ENCRYPTION_KEY)
            : null,
          expiresAt: tokens.expiresAt,
        });
        await tx
          .insert(schema.externalFanAccounts)
          .values({
            userId: user.id,
            providerId,
            externalAccountId: identity.externalAccountId,
          })
          .onConflictDoNothing();
        await tx.insert(schema.auditLogs).values({
          actorType: 'user',
          actorId: user.id,
          action: 'provider.connected',
          targetKind: 'provider_connection',
          targetId: conn.id,
          meta: { providerId, role },
        });
        return conn;
      });

      // Immediate sync so the fan sees unlocks right after connecting.
      const sync = await refreshUserEntitlements(
        db,
        providers,
        (enc) => decryptSecret(enc, env.TOKEN_ENCRYPTION_KEY),
        user.id,
      );

      return {
        connectionId: connection.id,
        providerId,
        externalAccountId: identity.externalAccountId,
        displayName: identity.displayName,
        sync,
      };
    },
  );

  app.get('/connections', async (req) => {
    const user = requireUser(req);
    const rows = await db
      .select({
        id: schema.providerConnections.id,
        providerId: schema.providerConnections.providerId,
        externalAccountId: schema.providerConnections.externalAccountId,
        displayName: schema.providerConnections.displayName,
        status: schema.providerConnections.status,
        connectedAt: schema.providerConnections.createdAt,
      })
      .from(schema.providerConnections)
      .where(eq(schema.providerConnections.userId, user.id));
    return {
      items: rows.map((r) => ({ ...r, connectedAt: r.connectedAt.toISOString() })),
    };
  });

  app.delete(
    '/connections/:connectionId',
    { schema: { params: z.object({ connectionId: z.string().uuid() }) } },
    async (req) => {
      const user = requireUser(req);
      const { connectionId } = req.params as { connectionId: string };
      const rows = await db
        .select()
        .from(schema.providerConnections)
        .where(
          and(
            eq(schema.providerConnections.id, connectionId),
            eq(schema.providerConnections.userId, user.id),
          ),
        )
        .limit(1);
      const connection = rows[0];
      if (!connection) throw notFound('connection not found');

      const tokenRows = await db
        .select()
        .from(schema.providerTokens)
        .where(eq(schema.providerTokens.connectionId, connection.id))
        .limit(1);
      const adapter = providers.get(connection.providerId as ProviderId);
      if (tokenRows[0]) {
        try {
          await adapter.revokeConnection({
            accessToken: decryptSecret(tokenRows[0].accessTokenEnc, env.TOKEN_ENCRYPTION_KEY),
          });
        } catch {
          // Provider-side revocation is best-effort; local revocation always happens.
        }
      }
      await db.transaction(async (tx) => {
        await tx
          .delete(schema.providerTokens)
          .where(eq(schema.providerTokens.connectionId, connection.id));
        await tx
          .update(schema.providerConnections)
          .set({ status: 'revoked', updatedAt: new Date() })
          .where(eq(schema.providerConnections.id, connection.id));
        await tx.insert(schema.auditLogs).values({
          actorType: 'user',
          actorId: user.id,
          action: 'provider.disconnected',
          targetKind: 'provider_connection',
          targetId: connection.id,
        });
      });
      return { ok: true };
    },
  );
};
