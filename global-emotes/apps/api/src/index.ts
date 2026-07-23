import { loadEnv } from '@global-emotes/config';
import { createDb } from '@global-emotes/database';
import { createProviderRegistry } from '@global-emotes/provider-sdk';
import { S3ObjectStorage } from '@global-emotes/asset-pipeline';
import { createEmailSender } from '@global-emotes/notifications';
import { StripeBillingProvider } from '@global-emotes/billing';
import { buildServer } from './server';
import { createBullEnqueuer } from './jobs';

/** Production/dev entrypoint: real Postgres, Redis-backed queues, S3 storage. */
async function main(): Promise<void> {
  const env = loadEnv();
  const { db } = createDb({ connectionString: env.DATABASE_URL });
  const app = await buildServer({
    env,
    db,
    providers: createProviderRegistry(env),
    storage: new S3ObjectStorage(env),
    email: createEmailSender(env),
    billing: new StripeBillingProvider(env.STRIPE_SECRET_KEY),
    jobs: createBullEnqueuer(env),
  });
  await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
  app.log.info(`API listening on :${env.API_PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
