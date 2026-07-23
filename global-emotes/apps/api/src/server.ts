import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { ZodError } from 'zod';
import { createLogger, newRequestId } from '@global-emotes/observability';
import { ErrorCodes } from '@global-emotes/contracts';
import { AssetValidationError } from '@global-emotes/asset-pipeline';
import { PlanLimitError, WebhookVerificationError } from '@global-emotes/billing';
import { ProviderError } from '@global-emotes/provider-sdk';
import type { AppContext } from './context';
import { ApiHttpError } from './errors';
import { authPlugin } from './plugins/auth';
import { registerAuthRoutes } from './routes/auth';
import { registerCreatorRoutes } from './routes/creators';
import { registerPackRoutes } from './routes/packs';
import { registerUploadRoutes } from './routes/uploads';
import { registerEntitlementRoutes } from './routes/entitlements';
import { registerProviderRoutes } from './routes/providers';
import { registerSyncRoutes } from './routes/sync';
import { registerLibraryRoutes } from './routes/library';
import { registerBillingRoutes } from './routes/billing';
import { registerAnalyticsRoutes } from './routes/analytics';
import { registerAdminRoutes } from './routes/admin';
import { registerWebhookRoutes } from './routes/webhooks';
import { registerPublicRoutes } from './routes/public';

export type Server = FastifyInstance;

export async function buildServer(ctx: AppContext): Promise<Server> {
  const app = Fastify({
    // pino major in this workspace is newer than fastify's bundled logger types;
    // runtime contract is identical.
    loggerInstance: createLogger(ctx.env, 'api') as unknown as import('fastify').FastifyBaseLogger,
    genReqId: () => newRequestId(),
    disableRequestLogging: ctx.env.NODE_ENV === 'test',
    bodyLimit: 4 * 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorate('ctx', ctx);

  await app.register(cookie, { secret: ctx.env.SESSION_SECRET });
  await app.register(cors, {
    origin: [ctx.env.PUBLIC_WEB_URL],
    credentials: true,
  });
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
  });
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: `${ctx.env.BRAND_NAME} API`,
        version: '1.0.0',
        description: 'Versioned REST API. Cursor pagination, consistent error envelope.',
      },
      servers: [{ url: ctx.env.PUBLIC_API_URL }],
    },
    transform: jsonSchemaTransform,
  });

  // Security headers on every response (API-appropriate subset).
  app.addHook('onSend', async (_req, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('x-request-id', _req.id);
  });

  // Consistent error envelope (master spec §21).
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ApiHttpError) {
      return reply.status(err.statusCode).send({
        error: { code: err.code, message: err.message, requestId: req.id, details: err.details },
      });
    }
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: ErrorCodes.VALIDATION,
          message: 'invalid request',
          requestId: req.id,
          details: err.issues,
        },
      });
    }
    if (err instanceof WebhookVerificationError) {
      return reply.status(400).send({
        error: { code: ErrorCodes.VALIDATION, message: 'invalid webhook signature', requestId: req.id },
      });
    }
    if (err instanceof PlanLimitError) {
      return reply.status(402).send({
        error: { code: ErrorCodes.PLAN_LIMIT, message: err.message, requestId: req.id },
      });
    }
    if (err instanceof AssetValidationError) {
      return reply.status(400).send({
        error: { code: ErrorCodes.VALIDATION, message: err.message, requestId: req.id, details: { asset: err.code } },
      });
    }
    if (err instanceof ProviderError) {
      const status = err.kind === 'rate_limited' ? 429 : err.kind === 'not_configured' ? 503 : 502;
      return reply.status(status).send({
        error: { code: ErrorCodes.PROVIDER_ERROR, message: err.message, requestId: req.id },
      });
    }
    const fastifyErr = err as { statusCode?: number; validation?: unknown; message?: string };
    if (fastifyErr.statusCode === 429) {
      return reply.status(429).send({
        error: { code: ErrorCodes.RATE_LIMITED, message: 'rate limit exceeded', requestId: req.id },
      });
    }
    if (fastifyErr.validation) {
      return reply.status(400).send({
        error: {
          code: ErrorCodes.VALIDATION,
          message: fastifyErr.message ?? 'invalid request',
          requestId: req.id,
        },
      });
    }
    req.log.error({ err }, 'unhandled error');
    return reply.status(500).send({
      error: { code: ErrorCodes.INTERNAL, message: 'internal error', requestId: req.id },
    });
  });

  await app.register(authPlugin);

  app.get('/v1/health', async () => ({
    ok: true,
    service: ctx.env.BRAND_NAME,
    time: new Date().toISOString(),
  }));
  app.get('/v1/openapi.json', async () => app.swagger());

  await app.register(registerAuthRoutes, { prefix: '/v1' });
  await app.register(registerCreatorRoutes, { prefix: '/v1' });
  await app.register(registerPackRoutes, { prefix: '/v1' });
  await app.register(registerUploadRoutes, { prefix: '/v1' });
  await app.register(registerEntitlementRoutes, { prefix: '/v1' });
  await app.register(registerProviderRoutes, { prefix: '/v1' });
  await app.register(registerSyncRoutes, { prefix: '/v1' });
  await app.register(registerLibraryRoutes, { prefix: '/v1' });
  await app.register(registerBillingRoutes, { prefix: '/v1' });
  await app.register(registerAnalyticsRoutes, { prefix: '/v1' });
  await app.register(registerAdminRoutes, { prefix: '/v1' });
  await app.register(registerWebhookRoutes, { prefix: '/v1' });
  await app.register(registerPublicRoutes, { prefix: '/v1' });

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    ctx: AppContext;
  }
}
