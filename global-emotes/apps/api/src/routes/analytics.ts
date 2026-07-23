import type { FastifyPluginAsync } from 'fastify';
import { schema } from '@global-emotes/database';
import { sanitizeBatch } from '@global-emotes/analytics';

/**
 * Privacy-safe event ingestion. Anonymous events allowed (pre-signup funnel);
 * the strict allowlist in @global-emotes/analytics is the trust boundary —
 * message contents or unknown props never reach the database.
 */
export const registerAnalyticsRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app.ctx;

  app.post(
    '/analytics/events',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req) => {
      const { accepted, rejected } = sanitizeBatch(req.body);
      if (accepted.length > 0) {
        await db.insert(schema.privacySafeUsageEvents).values(
          accepted.map((event) => ({
            userId: req.user?.id ?? null,
            installId: event.installId ?? null,
            name: event.name,
            props: event.props as Record<string, unknown>,
            occurredAt: event.occurredAt ? new Date(event.occurredAt) : new Date(),
          })),
        );
      }
      return { accepted: accepted.length, rejected };
    },
  );
};
