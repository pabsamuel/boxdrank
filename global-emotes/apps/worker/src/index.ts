import { Worker, Queue } from 'bullmq';
import { loadEnv } from '@global-emotes/config';
import { createDb } from '@global-emotes/database';
import { createProviderRegistry } from '@global-emotes/provider-sdk';
import { S3ObjectStorage } from '@global-emotes/asset-pipeline';
import { createEmailSender } from '@global-emotes/notifications';
import { createLogger } from '@global-emotes/observability';
import {
  handleAssetProcessing,
  handleCleanup,
  handleEntitlementSweep,
  handleTokenRefresh,
  type HandlerDeps,
} from './handlers';
import { TelegramClient, handleTelegramExport, type TelegramExportPayload } from './telegram';
import { handleDataExport } from './data-export';

/**
 * Worker process: BullMQ consumers + repeatable maintenance jobs. Handlers are
 * idempotent; retries use exponential backoff; failures land in BullMQ's
 * failed set for replay from the admin dashboard (queue health endpoint).
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const log = createLogger(env, 'worker');
  const { db } = createDb({ connectionString: env.DATABASE_URL });
  const url = new URL(env.REDIS_URL);
  const connection = { host: url.hostname, port: Number(url.port || 6379) };

  const deps: HandlerDeps = {
    env,
    db,
    storage: new S3ObjectStorage(env),
    providers: createProviderRegistry(env),
    email: createEmailSender(env),
  };

  const workers: Worker[] = [
    new Worker(
      'asset-processing',
      async (job) => {
        const result = await handleAssetProcessing(deps, job.data);
        log.info({ jobId: job.id, result }, 'asset-processing done');
        if (result.status === 'failed') throw new Error(result.reason);
      },
      { connection, concurrency: 4 },
    ),
    new Worker(
      'telegram-export',
      async (job) => {
        const result = await handleTelegramExport(
          { ...deps, telegram: new TelegramClient(env.TELEGRAM_BOT_TOKEN) },
          job.data as TelegramExportPayload,
        );
        log.info({ jobId: job.id, result }, 'telegram-export done');
        if (result.status === 'failed') throw new Error(result.reason);
      },
      { connection, concurrency: 1 },
    ),
    new Worker(
      'data-export',
      async (job) => {
        const result = await handleDataExport(deps, job.data as { requestId: string });
        log.info({ jobId: job.id, result }, 'data-export done');
        if (result.status === 'failed') throw new Error(result.reason);
      },
      { connection, concurrency: 2 },
    ),
    new Worker(
      'maintenance',
      async (job) => {
        switch (job.name) {
          case 'entitlement-sweep':
            log.info(await handleEntitlementSweep(deps), 'entitlement sweep done');
            break;
          case 'token-refresh':
            log.info(await handleTokenRefresh(deps), 'token refresh done');
            break;
          case 'cleanup':
            log.info(await handleCleanup(deps), 'cleanup done');
            break;
        }
      },
      { connection, concurrency: 1 },
    ),
  ];

  // Repeatable schedules.
  const maintenance = new Queue('maintenance', { connection });
  await maintenance.upsertJobScheduler(
    'entitlement-sweep',
    { every: 15 * 60_000 },
    { name: 'entitlement-sweep' },
  );
  await maintenance.upsertJobScheduler(
    'token-refresh',
    { every: 10 * 60_000 },
    { name: 'token-refresh' },
  );
  await maintenance.upsertJobScheduler('cleanup', { every: 60 * 60_000 }, { name: 'cleanup' });

  log.info('worker started');

  const shutdown = async () => {
    log.info('shutting down');
    await Promise.all(workers.map((w) => w.close()));
    await maintenance.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
