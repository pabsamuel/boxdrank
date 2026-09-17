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

/**
 * The backend.
 *
 * Small on purpose: OAuth, a place to keep template snapshots, and the few
 * endpoints the board view calls. The diff engine is pure and lives elsewhere;
 * this file only moves data in and out of it.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}. Copy .env.example to .env.`);
  return value;
}

export interface ServerDeps {
  storage: Storage;
  cipher: TokenCipher;
  oauth: OAuthConfig;
  signingSecret: string;
}

export function createServer(deps: ServerDeps) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

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

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      snapshotSchemaVersion: SNAPSHOT_SCHEMA_VERSION,
      automationsPreview: automationsPreviewEnabled(),
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
        automationsPreviewEnabled: automationsPreviewEnabled(),
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
        automationsPreviewEnabled: automationsPreviewEnabled(),
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
const isMain = process.argv[1]?.endsWith('server/index.ts') || process.argv[1]?.endsWith('server/index.js');
if (isMain) {
  const app = createServer({
    storage: new InMemoryStorage(),
    cipher: new TokenCipher(requireEnv('TOKEN_ENCRYPTION_KEY')),
    signingSecret: requireEnv('MONDAY_SIGNING_SECRET'),
    oauth: {
      clientId: requireEnv('MONDAY_CLIENT_ID'),
      clientSecret: requireEnv('MONDAY_CLIENT_SECRET'),
      redirectUri: requireEnv('MONDAY_REDIRECT_URI'),
    },
  });
  const port = Number(process.env.PORT ?? 8302);
  app.listen(port, () => console.log(`[template-guard] listening on :${port}`));
}
/* c8 ignore stop */
