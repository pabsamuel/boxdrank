import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { schema } from '@global-emotes/database';
import type { ProviderId } from '@global-emotes/contracts';
import { registerStripeWebhook } from './billing';
import { applyExternalEvidence } from '../services/entitlement-service';

/**
 * Provider webhooks: adapter-verified signatures, inbox idempotency
 * (provider_events unique on external event id), then evidence → engine.
 * Raw body preserved for signature verification.
 */
export const registerWebhookRoutes: FastifyPluginAsync = async (app) => {
  await app.register(registerStripeWebhook);
  await app.register(async (scope) => {
    const { db, providers } = scope.ctx;

    scope.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) =>
      done(null, body),
    );

    scope.post(
      '/webhooks/providers/:providerId',
      { schema: { params: z.object({ providerId: z.string() }) } },
      async (req, reply) => {
        const { providerId } = req.params as { providerId: ProviderId };
        const adapter = providers.get(providerId);
        if (!adapter.handleWebhook) {
          return reply.status(404).send({ error: { code: 'not_found', message: 'no webhook support' } });
        }

        const events = await adapter.handleWebhook({
          headers: req.headers as Record<string, string | undefined>,
          rawBody: req.body as string,
        });

        for (const event of events) {
          if (event.control?.kind === 'challenge_response') {
            return reply.status(200).header('content-type', 'text/plain').send(event.control.body);
          }

          const inserted = await db
            .insert(schema.providerEvents)
            .values({
              providerId,
              externalEventId: event.externalEventId,
              topic: event.topic,
              payload: (event.entitlement ?? {}) as Record<string, unknown>,
            })
            .onConflictDoNothing()
            .returning({ id: schema.providerEvents.id });
          if (inserted.length === 0) continue; // duplicate delivery

          if (event.entitlement) {
            // Map external fan account → user; unknown fans are stored for later reconciliation.
            const fanRows = await db
              .select()
              .from(schema.externalFanAccounts)
              .where(
                and(
                  eq(schema.externalFanAccounts.providerId, providerId),
                  eq(
                    schema.externalFanAccounts.externalAccountId,
                    event.entitlement.externalFanAccountId,
                  ),
                ),
              )
              .limit(1);
            if (fanRows[0]) {
              await applyExternalEvidence(db, fanRows[0].userId, [event.entitlement]);
            }
          }
          await db
            .update(schema.providerEvents)
            .set({ status: 'processed', processedAt: new Date() })
            .where(eq(schema.providerEvents.id, inserted[0]!.id));
        }
        return reply.send({ received: true });
      },
    );
  });
};
