import { loadEnv, resetEnvCache } from '@global-emotes/config';
import { createTestDb, asDb } from '@global-emotes/database/testing';
import { seed } from '@global-emotes/database/seed';
import { createProviderRegistry } from '@global-emotes/provider-sdk';
import {
  MemoryObjectStorage,
  generateVariants,
  validateAsset,
  variantKey,
} from '@global-emotes/asset-pipeline';
import type { EmailMessage } from '@global-emotes/notifications';
import type { BillingProvider } from '@global-emotes/billing';
import { schema } from '@global-emotes/database';
import { eq } from 'drizzle-orm';
import { buildServer, type Server } from './server';
import type { AppContext, JobEnqueuer } from './context';

/**
 * Fully in-memory API for integration tests: PGlite database with real
 * migrations + seed, memory object storage, captured emails, mock providers,
 * and an inline job runner that actually processes assets (so the creator→fan
 * loop is exercised end-to-end without Redis or a worker process).
 */
export interface TestApp {
  app: Server;
  ctx: AppContext;
  seeded: Awaited<ReturnType<typeof seed>>;
  sentEmails: EmailMessage[];
  processedJobs: Array<{ queue: string; payload: Record<string, unknown> }>;
  close: () => Promise<void>;
  /** Sign in via magic-link flow; returns a session cookie header value. */
  login: (email: string) => Promise<string>;
}

export async function createTestApp(): Promise<TestApp> {
  resetEnvCache();
  process.env.NODE_ENV = 'test';
  const env = loadEnv({ NODE_ENV: 'test', EMAIL_PROVIDER: 'console' });
  const { db: rawDb, close } = await createTestDb();
  const db = asDb(rawDb);
  const seeded = await seed(rawDb as never);

  const storage = new MemoryObjectStorage();
  const sentEmails: EmailMessage[] = [];
  const processedJobs: Array<{ queue: string; payload: Record<string, unknown> }> = [];

  const providers = createProviderRegistry(env);
  providers.mock.setFixtures({
    identities: {
      'mock-fan-1': { displayName: 'Mock Fan' },
      'mock-broadcaster-1': { displayName: 'Mock Broadcaster' },
    },
    memberships: { 'mock-fan-1': { 'mock-broadcaster-1': 'tier1' } },
  });

  // Inline job runner: asset-processing runs the real pipeline immediately.
  const jobs: JobEnqueuer = {
    async enqueue(queue, payload) {
      processedJobs.push({ queue, payload });
      if (queue === 'asset-processing') {
        const emoteId = payload['emoteId'] as string;
        const quarantineKey = payload['quarantineKey'] as string;
        const buffer = await storage.get(env.S3_BUCKET_QUARANTINE, quarantineKey);
        if (!buffer) return;
        const validated = await validateAsset(buffer);
        const variants = await generateVariants(buffer, validated);
        for (const variant of variants) {
          await storage.put(
            env.S3_BUCKET_PROCESSED,
            variantKey(validated.contentHash, variant.kind),
            variant.buffer,
            variant.mimeType,
          );
        }
        await db
          .update(schema.emotes)
          .set({ status: 'active' })
          .where(eq(schema.emotes.id, emoteId));
      }
    },
  };

  const billing: BillingProvider = {
    configured: true,
    async createCustomer() {
      return { customerId: `cus_test_${crypto.randomUUID().slice(0, 8)}` };
    },
    async createCheckoutSession() {
      return { url: 'https://checkout.test/session', sessionId: 'cs_test_1' };
    },
    async createPortalSession() {
      return { url: 'https://portal.test/session' };
    },
  };

  const ctx: AppContext = {
    env,
    db,
    providers,
    storage,
    email: {
      async send(message) {
        sentEmails.push(message);
      },
    },
    billing,
    jobs,
  };
  const app = await buildServer(ctx);

  // Each login uses a distinct client IP so the per-IP auth rate limit (which
  // has its own dedicated test) doesn't throttle unrelated test logins.
  let ipCounter = 1;
  const login = async (email: string): Promise<string> => {
    const remoteAddress = `10.1.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;
    await app.inject({
      method: 'POST',
      url: '/v1/auth/magic-link',
      payload: { email },
      remoteAddress,
    });
    const rows = await db
      .select()
      .from(schema.authTokens)
      .where(eq(schema.authTokens.email, email));
    const last = rows[rows.length - 1];
    if (!last) throw new Error('no auth token created');
    // The raw token only exists in the email link; recover it from the capture.
    const mail = [...sentEmails].reverse().find((m) => m.to === email);
    const match = mail?.text.match(/token=([A-Za-z0-9_-]+)/);
    if (!match) throw new Error('no magic link captured');
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/verify',
      payload: { token: match[1] },
      remoteAddress,
    });
    const setCookie = res.headers['set-cookie'];
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    if (!cookie) throw new Error(`login failed: ${res.body}`);
    return cookie.split(';')[0]!;
  };

  return { app, ctx, seeded, sentEmails, processedJobs, close, login };
}
