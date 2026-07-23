import type { AppEnv } from '@global-emotes/config';
import type { Db } from '@global-emotes/database';
import type { ProviderRegistry } from '@global-emotes/provider-sdk';
import type { ObjectStorage } from '@global-emotes/asset-pipeline';
import type { EmailSender } from '@global-emotes/notifications';
import type { BillingProvider } from '@global-emotes/billing';

/** Background work the API enqueues; the worker (or an inline test runner) executes it. */
export interface JobEnqueuer {
  enqueue(
    queue: 'asset-processing' | 'entitlement-sync' | 'email' | 'telegram-export',
    payload: Record<string, unknown>,
  ): Promise<void>;
}

/** Everything the HTTP layer needs, injected so tests run fully in-memory. */
export interface AppContext {
  env: AppEnv;
  db: Db;
  providers: ProviderRegistry;
  storage: ObjectStorage;
  email: EmailSender;
  billing: BillingProvider;
  jobs: JobEnqueuer;
}
