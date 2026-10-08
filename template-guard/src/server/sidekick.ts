import { MondayClient } from '../api/client.js';
import { BOARD_LIST_PAGE_LIMIT, BOARD_LIST_QUERY } from '../api/queries.js';
import { diffBoards } from '../diff/diff.js';
import type { Finding } from '../diff/types.js';
import { captureBoards } from '../snapshot/capture.js';
import type { TemplateRecord } from '../snapshot/types.js';
import type { Storage } from './storage.js';
import { verifySubscriptionToken } from '../billing/subscription.js';

/**
 * The Sidekick tool: lets monday's AI assistant answer "what did this board
 * lose when it was copied from its template?"
 *
 * Same pattern as Automation Watchdog's tool (platform facts read 28 Sep 2026,
 * `apps/docs/authorization-header`, `integration-authorization`,
 * `workflows-actions`, `error-handling`):
 *  - an action block whose Run URL is this route;
 *  - the request carries a JWT signed with the **Signing Secret**; check `exp`
 *    and that `aud` is this route;
 *  - the JWT holds a `shortLivedToken` (five minutes, the app's scopes) used
 *    for the reads;
 *  - inputs arrive in `payload.inboundFieldValues` (or `payload.inputFields`);
 *  - the answer is `200 { outputFields }`; a real failure is a 4xx with
 *    `severityCode: 4000`, never a fake success.
 *
 * Users talk in names, so boards and templates are matched by name. It reads
 * live and stores nothing new.
 */

export const SIDEKICK_PATH = '/monday/sidekick/compare';

const MAX_LISTED = 8;
const BOARD_PAGES = 5;

export interface SidekickClaims {
  accountId: string;
  shortLivedToken: string;
}

/**
 * Whether a token was issued for this endpoint: the tool's path, on this app's
 * host or another URL of the same monday code service (a deploy also gets a
 * version URL, and which one monday calls is not documented).
 */
export function sidekickAudience(aud: unknown, ownOrigin: string): boolean {
  let target: URL;
  let origin: URL;
  try {
    target = new URL(String(aud));
    origin = new URL(ownOrigin);
  } catch {
    return false;
  }
  if (target.protocol !== 'https:' || target.pathname.replace(/\/+$/, '') !== SIDEKICK_PATH) return false;
  if (target.host === origin.host) return true;
  const service = /-(service-\d+-[a-z0-9]+\.[a-z0-9]+\.monday\.app)$/.exec(origin.host)?.[1];
  return Boolean(service) && target.host.endsWith(`-${service}`);
}

export function verifySidekickRequest(
  authorization: string | undefined,
  signingSecret: string,
  ownOrigin: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): SidekickClaims | null {
  const token = authorization?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  let claims: Record<string, unknown>;
  try {
    claims = verifySubscriptionToken(token, signingSecret);
  } catch {
    return null;
  }
  if (typeof claims.exp !== 'number' || claims.exp < nowSeconds) return null;
  if (!sidekickAudience(claims.aud, ownOrigin)) return null;
  const shortLivedToken = claims.shortLivedToken;
  const accountId = claims.accountId ?? (claims.dat as { account_id?: unknown } | undefined)?.account_id;
  if (typeof shortLivedToken !== 'string' || !shortLivedToken || accountId == null) return null;
  return { accountId: String(accountId), shortLivedToken };
}

export function readInputs(body: unknown): { boardName: string; templateName: string } {
  const payload = (body as { payload?: Record<string, unknown> } | undefined)?.payload ?? {};
  const fields = (payload.inboundFieldValues ?? payload.inputFields ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' ? v.slice(0, 200) : '');
  return { boardName: text(fields.board_name), templateName: text(fields.template_name) };
}

const normalise = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

function pickByName<T>(items: T[], name: string, nameOf: (t: T) => string): T[] {
  const wanted = normalise(name);
  const exact = items.filter((t) => normalise(nameOf(t)) === wanted);
  if (exact.length > 0) return exact;
  return items.filter((t) => normalise(nameOf(t)).includes(wanted));
}

function describe(f: Finding): string {
  return `[${f.severity}] ${f.what} Fix: ${f.howToFix}`;
}

export interface SidekickAnswer {
  summary: string;
  findings_count: number;
  board_name: string;
  template_name: string;
}

export async function answerSidekick(opts: {
  client: MondayClient;
  storage: Storage;
  accountId: string;
  boardName: string;
  templateName: string;
  automationsPreviewEnabled?: boolean;
}): Promise<SidekickAnswer> {
  const { client, storage, accountId, boardName, templateName } = opts;
  const reply = (summary: string, extra: Partial<SidekickAnswer> = {}): SidekickAnswer => ({
    summary,
    findings_count: 0,
    board_name: '',
    template_name: '',
    ...extra,
  });

  const templates = await storage.listTemplates(accountId);
  if (templates.length === 0) {
    return reply(
      'No template is saved on this account yet. Open the Template Guard board view on your best board and click "Use this board as a template", then ask again.',
    );
  }
  if (!boardName) {
    return reply(`Which board should I check? Saved templates: ${templates.map((t) => t.snapshot.name).join(', ')}.`);
  }

  const boards: { id: string; name: string }[] = [];
  for (let page = 1; page <= BOARD_PAGES; page += 1) {
    const { data } = await client.request<{ boards: { id: string; name: string }[] | null }>(BOARD_LIST_QUERY, {
      limit: BOARD_LIST_PAGE_LIMIT,
      page,
    });
    const batch = data?.boards ?? [];
    boards.push(...batch);
    if (batch.length < BOARD_LIST_PAGE_LIMIT) break;
  }

  const matches = pickByName(boards, boardName, (b) => b.name);
  if (matches.length === 0) {
    return reply(`I could not find a board called "${boardName}". Check the name and ask again.`);
  }
  if (matches.length > 1) {
    return reply(
      `Several boards match "${boardName}": ${matches.slice(0, MAX_LISTED).map((b) => b.name).join(', ')}. Which one did you mean?`,
    );
  }
  const board = matches[0]!;

  if (templates.some((t) => t.templateBoardId === board.id)) {
    return reply(`"${board.name}" is itself a saved template. Ask about one of its copies instead.`, {
      board_name: board.name,
    });
  }

  let template: TemplateRecord | undefined;
  if (templateName) {
    const named = pickByName(templates, templateName, (t) => t.snapshot.name);
    if (named.length !== 1) {
      return reply(
        `I could not pick a template called "${templateName}". Saved templates: ${templates.map((t) => t.snapshot.name).join(', ')}.`,
        { board_name: board.name },
      );
    }
    template = named[0]!;
  } else {
    template = templates.find((t) => t.linkedBoardIds.includes(board.id)) ?? (templates.length === 1 ? templates[0] : undefined);
    if (!template) {
      return reply(
        `Which template should "${board.name}" be compared against? Saved templates: ${templates.map((t) => t.snapshot.name).join(', ')}.`,
        { board_name: board.name },
      );
    }
  }

  const [copy] = await captureBoards(client, [board.id], {
    automationsPreviewEnabled: opts.automationsPreviewEnabled ?? false,
  });
  if (!copy) throw new Error('Could not read that board.');

  const diff = diffBoards(template.snapshot, copy, { includeCosmetic: false });
  const findings = diff.findings;
  const source = `Checked live against the template "${template.snapshot.name}" saved on ${template.updatedAt.slice(0, 10)}.`;

  if (findings.length === 0) {
    return reply(`"${board.name}" matches its template: no missing, miswired or altered configuration. ${source}`, {
      board_name: board.name,
      template_name: template.snapshot.name,
    });
  }

  const listed = findings.slice(0, MAX_LISTED).map(describe).join(' ');
  const more = findings.length > MAX_LISTED ? ` …and ${findings.length - MAX_LISTED} more in the Template Guard board view.` : '';
  return reply(
    `"${board.name}" differs from its template in ${findings.length} way${findings.length === 1 ? '' : 's'}, most serious first: ${listed}${more} ${source}`,
    { findings_count: findings.length, board_name: board.name, template_name: template.snapshot.name },
  );
}
