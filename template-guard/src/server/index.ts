import express, { type NextFunction, type Request, type Response } from 'express';
import { MondayClient } from '../api/client.js';
import { TemplateGuardError } from '../api/errors.js';
import { automationsPreviewEnabled } from '../api/preview/automations.js';
import { captureBoards } from '../snapshot/capture.js';
import { BOARD_LIST_PAGE_LIMIT, BOARD_LIST_QUERY } from '../api/queries.js';
import { diffBoards } from '../diff/diff.js';
import { buildRepairPlan } from '../repair/plan.js';
import { runRepairs } from '../repair/execute.js';
import { canAddTemplate, canUseOneClickRepair } from '../billing/tiers.js';
import { SNAPSHOT_SCHEMA_VERSION } from '../snapshot/types.js';
import {
  authorizeUrl,
  createState,
  exchangeCodeForToken,
  verifySessionToken,
  verifyState,
  type OAuthConfig,
} from './oauth.js';
import { InMemoryStorage, TokenCipher, type Storage } from './storage.js';
import { SqliteStorage } from './sqlite-storage.js';
import { ConsoleNotificationSink, DriftScheduler } from '../drift/scheduler.js';
import { mondayCors, rateLimit, requireHttps, securityHeaders } from './security.js';
import { EnvConfig, MondayCodeConfig, type Config } from './config.js';
import { MondayCodeStorage, type AccountStore, type SecureStore } from './monday-code-storage.js';
import {
  SubscriptionError,
  parseSubscriptionEvent,
  planFromEvent,
  verifySubscriptionToken,
} from '../billing/subscription.js';

/**
 * The backend.
 *
 * Small on purpose: OAuth, a place to keep template snapshots, and the few
 * endpoints the board view calls. The diff engine is pure and lives elsewhere;
 * this file only moves data in and out of it.
 */

export interface ServerDeps {
  storage: Storage;
  cipher: TokenCipher;
  oauth: OAuthConfig;
  signingSecret: string;
  /** Present only when scheduled drift monitoring is switched on. */
  scheduler?: DriftScheduler;
  /**
   * monday plan ids that grant Pro. Empty means "any subscription grants Pro",
   * which is correct until the developer console has pricing configured.
   */
  paidPlanIds?: string[];
  /** Off in tests and local dev, on everywhere a browser will reach this. */
  enforceHttps?: boolean;
  /**
   * Whether the preview automations schema is on. Passed in rather than read
   * from `process.env`, because on monday code it is not there — see ADR-020.
   */
  automationsPreview?: boolean;
  /** Shared secret the monday code scheduler must present. */
  cronSecret?: string;
}

export function createServer(deps: ServerDeps) {
  const app = express();

  // Behind a load balancer, req.protocol and req.ip are only meaningful with
  // this set. Without it the HTTPS redirect below is a no-op and the rate
  // limiter buckets every caller together as the proxy's address.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  if (deps.enforceHttps) app.use(requireHttps());
  app.use(securityHeaders({ hsts: deps.enforceHttps !== false }));
  app.use(mondayCors());

  // 1mb is far more than any request here needs; a board id and a flag is a
  // few hundred bytes. The limit exists so an unbounded body cannot be used
  // to exhaust memory before authentication has even run.
  app.use(express.json({ limit: '1mb' }));

  // Applied to the API surface only. /health must stay answerable by an
  // uptime checker that polls it more often than a person clicks anything.
  app.use('/api', rateLimit({ max: 120, windowMs: 60_000 }));

  /** Resolves the caller's account from monday's signed session token. */
  const authenticate = async (req: Request) => {
    const header = req.header('Authorization') ?? '';
    const token = header.replace(/^Bearer\s+/i, '');
    if (!token) throw new TemplateGuardError('Not signed in.', 'permission_denied');

    const session = verifySessionToken(token, deps.signingSecret);
    const install = await deps.storage.getInstall(session.accountId);
    if (!install) {
      throw new TemplateGuardError(
        'Template Guard is not installed on this account, or its access was revoked. Please reinstall it from the monday marketplace.',
        'permission_denied',
      );
    }

    return {
      session,
      install,
      client: new MondayClient({ token: deps.cipher.decrypt(install.encryptedToken) }),
    };
  };

  const previewOn = deps.automationsPreview ?? automationsPreviewEnabled();

  app.get('/health', (_req, res) => {
    // The scheduler's state belongs here rather than in a log nobody reads: a
    // monitor that has quietly stopped sweeping is this product's own version
    // of the failure it sells against.
    const scheduler = deps.scheduler?.status;
    res.json({
      ok: true,
      snapshotSchemaVersion: SNAPSHOT_SCHEMA_VERSION,
      automationsPreview: previewOn,
      driftScheduler: scheduler
        ? {
            started: scheduler.started,
            sweepInProgress: scheduler.running,
            skippedTicks: scheduler.skippedTicks,
            lastSweepFinishedAt: scheduler.lastSweep?.finishedAt ?? null,
            lastSweepAccountsChecked: scheduler.lastSweep?.accountsChecked ?? null,
            lastSweepErrors: scheduler.lastSweep?.results.flatMap((r) => r.errors) ?? [],
          }
        : { started: false },
    });
  });

  // --- OAuth ---------------------------------------------------------------

  app.get('/auth/install', (_req, res) => {
    const state = createState(deps.signingSecret);
    res.cookie?.('tg_state', state, { httpOnly: true, sameSite: 'lax', secure: true });
    res.redirect(authorizeUrl(deps.oauth, state));
  });

  app.get('/auth/callback', async (req, res, next) => {
    try {
      const { code, state } = req.query as { code?: string; state?: string };
      if (!code) throw new TemplateGuardError('monday did not return an authorization code.', 'permission_denied');
      if (!state || !verifyState(deps.signingSecret, state)) {
        throw new TemplateGuardError('Sign-in could not be verified. Please start the install again.', 'permission_denied');
      }

      const token = await exchangeCodeForToken(deps.oauth, code);
      const client = new MondayClient({ token: token.access_token });

      const { data, errors } = await client.request<{
        me: { account: { id: string; slug: string } };
      }>(`query { me { account { id slug } } }`);

      if (!data?.me?.account) {
        throw new TemplateGuardError(
          errors[0]?.message ?? 'Could not read the monday account this app was installed on.',
          'unexpected_shape',
        );
      }

      await deps.storage.saveInstall({
        accountId: String(data.me.account.id),
        accountSlug: data.me.account.slug,
        encryptedToken: deps.cipher.encrypt(token.access_token),
        installedAt: new Date().toISOString(),
      });

      res.redirect('/installed.html');
    } catch (err) {
      next(err);
    }
  });

  // --- Boards --------------------------------------------------------------

  app.get('/api/boards', async (req, res, next) => {
    try {
      const { client } = await authenticate(req);
      const { data, errors } = await client.request<{
        boards: { id: string; name: string; workspace_id: string | null }[] | null;
      }>(BOARD_LIST_QUERY, { limit: BOARD_LIST_PAGE_LIMIT, page: 1 });

      res.json({
        boards: data?.boards ?? [],
        // Surfaced rather than dropped: a partial board list means the picker
        // is missing options, and the user needs to know why.
        warnings: errors.map((e) => e.message ?? 'monday returned an error while listing boards.'),
      });
    } catch (err) {
      next(err);
    }
  });

  // --- Templates -----------------------------------------------------------

  app.get('/api/templates', async (req, res, next) => {
    try {
      const { session } = await authenticate(req);
      const [templates, plan] = await Promise.all([
        deps.storage.listTemplates(session.accountId),
        deps.storage.getPlan(session.accountId),
      ]);
      res.json({ templates, plan });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/templates', async (req, res, next) => {
    try {
      const { session, client } = await authenticate(req);
      const { boardId, label } = req.body as { boardId?: string; label?: string };
      if (!boardId) throw new TemplateGuardError('No board selected.', 'unexpected_shape');

      const plan = await deps.storage.getPlan(session.accountId);
      const existing = await deps.storage.listTemplates(session.accountId);
      const alreadyTracked = existing.some((t) => t.templateBoardId === boardId);

      if (!alreadyTracked) {
        const gate = canAddTemplate(plan, existing.length);
        if (!gate.allowed) {
          res.status(402).json({ error: gate.reason, upsell: gate.upsell });
          return;
        }
      }

      const [snapshot] = await captureBoards(client, [boardId], {
        automationsPreviewEnabled: previewOn,
      });
      if (!snapshot) throw new TemplateGuardError('Could not read that board.', 'unexpected_shape');

      const now = new Date().toISOString();
      const record = {
        templateBoardId: boardId,
        accountId: session.accountId,
        label: label ?? snapshot.name,
        snapshot,
        linkedBoardIds: existing.find((t) => t.templateBoardId === boardId)?.linkedBoardIds ?? [],
        createdAt: existing.find((t) => t.templateBoardId === boardId)?.createdAt ?? now,
        updatedAt: now,
      };

      await deps.storage.saveTemplate(record);
      res.json({ template: record, failures: snapshot.failures });
    } catch (err) {
      next(err);
    }
  });

  // --- Comparison ----------------------------------------------------------

  app.post('/api/compare', async (req, res, next) => {
    try {
      const { session, install, client } = await authenticate(req);
      const { templateBoardId, copyBoardId, includeCosmetic } = req.body as {
        templateBoardId?: string;
        copyBoardId?: string;
        includeCosmetic?: boolean;
      };
      if (!templateBoardId || !copyBoardId) {
        throw new TemplateGuardError('Pick a template and a board to compare.', 'unexpected_shape');
      }

      const template = await deps.storage.getTemplate(session.accountId, templateBoardId);
      if (!template) throw new TemplateGuardError('That template is no longer saved.', 'unexpected_shape');

      const [copy] = await captureBoards(client, [copyBoardId], {
        automationsPreviewEnabled: previewOn,
      });
      if (!copy) throw new TemplateGuardError('Could not read that board.', 'unexpected_shape');

      const diff = diffBoards(template.snapshot, copy, { includeCosmetic: includeCosmetic ?? false });
      const plan = buildRepairPlan(
        diff.findings,
        { accountSlug: install.accountSlug, boardId: copyBoardId },
        template.snapshot.name,
      );

      // Remember the link so drift monitoring knows to watch this board.
      if (!template.linkedBoardIds.includes(copyBoardId)) {
        await deps.storage.saveTemplate({
          ...template,
          linkedBoardIds: [...template.linkedBoardIds, copyBoardId],
          updatedAt: new Date().toISOString(),
        });
      }

      res.json({ diff, repairPlan: plan, copySnapshotFailures: copy.failures });
    } catch (err) {
      next(err);
    }
  });

  // --- Repair --------------------------------------------------------------

  app.post('/api/repair', async (req, res, next) => {
    try {
      const { session, client } = await authenticate(req);
      const { repairs } = req.body as { repairs?: Parameters<typeof runRepairs>[1] };
      if (!repairs || repairs.length === 0) {
        throw new TemplateGuardError('No fixes were selected.', 'unexpected_shape');
      }

      const plan = await deps.storage.getPlan(session.accountId);
      const gate = canUseOneClickRepair(plan);
      if (!gate.allowed) {
        res.status(402).json({ error: gate.reason, upsell: gate.upsell });
        return;
      }

      const result = await runRepairs(client, repairs);
      // 207 when some succeeded and some did not, so a caller that only checks
      // res.ok cannot mistake a half-applied repair for a clean one.
      res.status(result.failed > 0 ? 207 : 200).json(result);
    } catch (err) {
      next(err);
    }
  });

  // --- Billing -------------------------------------------------------------

  /**
   * monday's marketplace billing webhook.
   *
   * monday takes the payment; this endpoint learns the outcome. It is the only
   * unauthenticated route that writes state, so the signature check is the
   * whole security boundary — an unverifiable payload is rejected before
   * anything is read out of it.
   */
  app.post('/webhooks/subscription', async (req, res) => {
    const body = req.body as { challenge?: string; token?: string };

    // monday verifies a new webhook URL by posting a challenge to echo back.
    if (body?.challenge) {
      res.json({ challenge: body.challenge });
      return;
    }

    try {
      const token = body?.token ?? req.header('Authorization')?.replace(/^Bearer\s+/i, '');
      if (!token) throw new SubscriptionError('Subscription webhook carried no token.', 'unverified');

      const payload = verifySubscriptionToken(token, deps.signingSecret);
      const event = parseSubscriptionEvent(payload);

      if (event.type === 'uninstall') {
        // "Everything is deleted on uninstall" is a listing claim, so it runs
        // here rather than in a cleanup job somebody remembers to write.
        await deps.storage.deleteAccount(event.accountId);
        console.log(`[template-guard] uninstall account=${event.accountId} -> purged`);
        res.json({ ok: true, purged: true });
        return;
      }

      const plan = planFromEvent(event, deps.paidPlanIds ?? []);
      await deps.storage.savePlan(plan);

      console.log(
        `[template-guard] subscription ${event.type} account=${event.accountId} -> ${plan.planId}`,
      );
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof SubscriptionError) {
        // Logged in full and answered with a status monday will retry on for
        // anything that is not an authentication failure. A silently-accepted
        // billing event is an account on the wrong plan.
        console.error(`[template-guard] subscription webhook rejected (${err.reason}): ${err.message}`);
        res.status(err.reason === 'unverified' ? 401 : 400).json({ error: err.message, kind: err.reason });
        return;
      }
      console.error('[template-guard] subscription webhook failed', err);
      res.status(500).json({ error: 'Could not record this subscription change.' });
    }
  });

  // --- monday code scheduler ------------------------------------------------

  /**
   * The endpoint monday code's scheduler invokes.
   *
   * The `/mndy-cronjob` prefix and the POST method are the platform's
   * contract, not ours — the job is registered with
   * `mapps scheduler:create -e "drift"` and monday calls this.
   *
   * It starts a sweep across every paying account, so it is guarded. The
   * platform is trusted to be the caller, but "reachable over the internet"
   * and "only monday calls it" are different claims, and only one of them is
   * enforceable: when `DRIFT_CRON_SECRET` is configured, the header must
   * match. Answering 202 immediately rather than holding the connection open
   * for a sweep keeps a slow account from turning into a timeout that the
   * scheduler retries into a second concurrent sweep.
   */
  app.post('/mndy-cronjob/drift', (req, res) => {
    if (!deps.scheduler) {
      res.status(503).json({ error: 'Drift monitoring is not enabled on this deployment.' });
      return;
    }
    if (deps.cronSecret && req.header('X-Template-Guard-Cron') !== deps.cronSecret) {
      console.warn('[template-guard] rejected a cron invocation with a bad or missing secret');
      res.status(401).json({ error: 'Not authorised.' });
      return;
    }

    const status = deps.scheduler.status;
    if (status.running) {
      // Reported, not silently dropped: the interval being shorter than a
      // sweep is a real operational condition someone has to see.
      console.warn('[template-guard] cron fired while a sweep was still running; skipping');
      res.status(409).json({ ok: false, reason: 'A sweep is already running.' });
      return;
    }

    void deps.scheduler.tick().catch((err: unknown) => {
      console.error('[template-guard] scheduled drift sweep failed', err);
    });
    res.status(202).json({ ok: true, started: true });
  });

  // --- Errors --------------------------------------------------------------

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof TemplateGuardError) {
      const status = err.kind === 'permission_denied' ? 403 : err.kind === 'rate_limited' ? 429 : 400;
      res.status(status).json({ error: err.message, kind: err.kind });
      return;
    }
    // Unexpected errors are logged in full and reported honestly rather than
    // flattened into a generic success-shaped response.
    console.error('[template-guard] unhandled error', err);
    res.status(500).json({
      error: 'Template Guard hit an unexpected problem and stopped rather than show you a partial result.',
      kind: 'unknown',
    });
  });

  return app;
}

/* c8 ignore start — process bootstrap */

/**
 * Picks the platform.
 *
 * **Explicitly, from `TEMPLATE_GUARD_PLATFORM`.** There is no auto-detection,
 * deliberately. monday code does expose a runtime context the SDK reads, but
 * the environment variable that signals it is not something this codebase has
 * verified, and guessing it wrong fails in the worst available direction: the
 * app would quietly fall back to a SQLite file on an ephemeral container and
 * lose every install token on the next deploy, while looking healthy.
 *
 * So the platform is stated, not sniffed. One environment variable, set once,
 * in the same place as everything else. (CLAUDE.md rule 1; ADR-020.)
 *
 * The SDK is imported dynamically so a self-hosted deployment never loads it
 * and the test suite never needs it at all.
 */
async function openMondayCode(): Promise<{
  config: Config;
  secure: SecureStore;
  accountStoreFor: (token: string) => AccountStore;
}> {
  const sdk = (await import('@mondaycom/apps-sdk')) as unknown as {
    SecureStorage: new () => SecureStore;
    Storage: new (token: string) => AccountStore;
    SecretsManager: new () => { get(key: string): unknown };
    EnvironmentVariablesManager: new () => { get(key: string): unknown };
  };

  return {
    config: new MondayCodeConfig(new sdk.SecretsManager(), new sdk.EnvironmentVariablesManager()),
    secure: new sdk.SecureStorage(),
    accountStoreFor: (token: string) => new sdk.Storage(token),
  };
}

const isMain =
  process.argv[1]?.endsWith('server/index.ts') || process.argv[1]?.endsWith('server/index.js');

if (isMain) {
  // Read from the process environment, because the thing that says which
  // config source to use cannot itself come from that config source.
  const onMondayCode = process.env.TEMPLATE_GUARD_PLATFORM === 'monday-code';
  const platform = onMondayCode ? await openMondayCode() : null;
  const config: Config = platform?.config ?? new EnvConfig();

  const cipher = new TokenCipher(config.require('TOKEN_ENCRYPTION_KEY'));

  let storage: Storage;
  if (platform) {
    console.log('[template-guard] running on monday code: Secure Storage + per-account Storage');
    storage = new MondayCodeStorage(platform.secure, platform.accountStoreFor, (t) =>
      cipher.decrypt(t),
    );
  } else {
    // Durable by default. `InMemoryStorage` is only reachable by explicitly
    // setting DATABASE_FILE to :memory:, and it says so on the way up — losing
    // every install token on restart means every customer has to reinstall,
    // and that is not something to discover in production.
    const databaseFile = config.get('DATABASE_FILE') ?? './data/template-guard.db';
    if (databaseFile === ':memory:' || databaseFile === '') {
      console.warn(
        '[template-guard] DATABASE_FILE is :memory: — every install token and template snapshot is lost on restart. Do not run this way in production.',
      );
      storage = new InMemoryStorage();
    } else {
      storage = new SqliteStorage(databaseFile);
    }
  }

  const automationsPreview = config.flag('FEATURE_AUTOMATIONS_PREVIEW');

  /**
   * On monday code the sweep is driven by the platform scheduler calling
   * `/mndy-cronjob/drift`, so the in-process timer stays off — two schedulers
   * for one job is how an app ends up sweeping twice and getting throttled.
   */
  const scheduler = config.flag('DRIFT_SCHEDULER_ENABLED')
    ? new DriftScheduler(storage, cipher, new ConsoleNotificationSink(), {
        intervalMs: Number(config.get('DRIFT_INTERVAL_MS') ?? 6 * 60 * 60 * 1000),
        automationsPreviewEnabled: automationsPreview,
      })
    : undefined;

  const app = createServer({
    storage,
    cipher,
    scheduler,
    automationsPreview,
    cronSecret: config.get('DRIFT_CRON_SECRET') ?? undefined,
    enforceHttps: platform !== null || config.flag('ENFORCE_HTTPS'),
    paidPlanIds: (config.get('MONDAY_PAID_PLAN_IDS') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    signingSecret: config.require('MONDAY_SIGNING_SECRET'),
    oauth: {
      clientId: config.require('MONDAY_CLIENT_ID'),
      clientSecret: config.require('MONDAY_CLIENT_SECRET'),
      redirectUri: config.require('MONDAY_REDIRECT_URI'),
    },
  });

  if (scheduler && !platform) {
    scheduler.start();
    console.log('[template-guard] in-process drift scheduler started');
  } else if (scheduler) {
    console.log('[template-guard] drift sweeps are driven by the monday code scheduler');
  }

  const port = Number(config.get('PORT') ?? 8302);
  app.listen(port, () => console.log(`[template-guard] listening on :${port}`));
}
/* c8 ignore stop */
