/**
 * The app's server on monday code: the board view's files and the Sidekick
 * tool's Run URL. Nothing else.
 *
 * Cut down from Automation Watchdog's server (live since 26 Sep 2026, three
 * security reviews). What this app does not need is gone rather than switched
 * off: there is no OAuth install, no stored token, no email, no scheduled job
 * and no uninstall clean-up, because nothing here runs without a user present.
 * The board view reads monday from the browser with the user's own session;
 * the Sidekick tool reads with the short-lived token monday sends with each
 * request.
 *
 * Nothing in this file imports the monday SDK. The API client is passed in,
 * so every path runs in tests with no network and no monday account.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { redact } from './redact.js';
import { SIDEKICK_PATH, findForSidekick, sidekickAnswer } from './sidekick.js';
import { APP_NAME } from '../core/brand.js';

export { SIDEKICK_PATH };

/** A Sidekick request is a few hundred bytes. Anything near this is not one. */
const MAX_BODY_BYTES = 64 * 1024;

const HMAC_ALGORITHMS = { HS256: 'sha256', HS384: 'sha384', HS512: 'sha512' };

/**
 * Verifies a JWT signed with a shared secret, or returns null.
 *
 * The three HMAC variants are accepted and nothing else. In particular `none`
 * and every public-key algorithm are refused outright: accepting either with a
 * shared secret is the classic way a JWT check gets bypassed.
 */
export function verifyJwt(token, secret, nowSeconds, { requireExp = false } = {}) {
  const parts = String(token ?? '').replace(/^Bearer\s+/i, '').split('.');
  if (parts.length !== 3) return null;
  const [head, body, signature] = parts;

  let header;
  let payload;
  try {
    header = JSON.parse(Buffer.from(head, 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  const algorithm = HMAC_ALGORITHMS[header?.alg];
  if (!algorithm || typeof payload !== 'object' || payload === null) return null;

  const expected = createHmac(algorithm, secret).update(`${head}.${body}`).digest();
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  if (payload.exp === undefined) return requireExp ? null : payload;
  if (!(typeof payload.exp === 'number' && payload.exp > nowSeconds)) return null;
  return payload;
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('body too large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Headers on everything. HSTS for a year because monday's security review
 * requires at least that; monday code's edge replaces it with 180 days, which
 * is monday's to set (Watchdog, verified 26 Sep 2026).
 */
const BASE_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

/**
 * The path of a request, or null if it is not a usable one. `new URL('//', base)`
 * throws; on Watchdog one request line, `GET // HTTP/1.1`, once killed the process.
 */
function parseRequestUrl(req) {
  try {
    return new URL(req.url, 'http://localhost');
  } catch {
    return null;
  }
}

function json(res, status, body) {
  res.writeHead(status, { ...BASE_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function serveFile(res, file) {
  // The board view runs inside monday's iframe, so no frame-ancestors
  // restriction on it.
  res.writeHead(200, { ...BASE_HEADERS, 'Content-Type': file.type, 'Cache-Control': 'no-cache' });
  return res.end(file.body);
}

/**
 * @param {object} deps
 * @param {{baseUrl: string, signingSecret: string, billing?: 'enforce'|'off'}} deps.config
 *   `baseUrl` is the app's Live URL; the Sidekick token's `aud` must point at
 *   it. `billing` decides whether the Sidekick tool needs a plan.
 * @param {(token: string) => {api: Function}} deps.makeClient
 * @param {Record<string, {type: string, body: string|Buffer}>} [deps.staticFiles]
 *   Exact paths only. An allowlist, so there is no path to traverse.
 */
export function createAppHandler({
  config,
  makeClient,
  staticFiles = {},
  now = () => Date.now(),
  clock = () => Date.now(),
  log = () => {},
}) {
  const { baseUrl, signingSecret } = config ?? {};
  if (!signingSecret) throw new Error('The signing secret is required.');
  const enforceBilling = config.billing === 'enforce';
  const origin = new URL(baseUrl);
  if (origin.protocol !== 'https:') throw new Error('The app base URL must be https.');

  /**
   * Whether the account has a plan for this app: 'active', 'none' or 'unknown'.
   *
   * FACT (`apps/docs/implementing-monetization`, read 27 Sep 2026): "monday.com
   * does not automatically restrict access when a subscription expires or
   * changes. You are responsible for enforcing plan entitlements". The board
   * view is blocked by monday itself once a trial ends (`plans-and-pricing`);
   * the Sidekick tool is not, so it is gated here. FACT
   * (`api-reference/reference/app-subscription`): `app_subscription` "returns
   * an array containing the current app and account subscription details based
   * on the token used"; an empty array is read as no plan. 'unknown' covers
   * errors, and the caller lets those through: refusing a paying account over a
   * failed billing query is the worse mistake.
   */
  async function subscriptionState(token) {
    try {
      const response = await makeClient(token).api('query { app_subscription { plan_id is_trial days_left } }');
      const subscriptions = response?.data?.app_subscription;
      if (response?.errors?.length || !Array.isArray(subscriptions)) return 'unknown';
      return subscriptions.length > 0 ? 'active' : 'none';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Whether a token was issued for this endpoint. The path must be the tool's,
   * and the host this app's: its Live URL, or another URL of the same monday
   * code service — a deploy also gets a version URL (`<id>-service-<app>…`,
   * seen on Watchdog on 28 Sep), and which one monday calls is not documented.
   */
  function sidekickAudience(aud) {
    let target;
    try {
      target = new URL(String(aud));
    } catch {
      return false;
    }
    if (target.protocol !== 'https:' || target.pathname.replace(/\/+$/, '') !== SIDEKICK_PATH) return false;
    if (target.host === origin.host) return true;
    const service = /-(service-\d+-[a-z0-9]+\.[a-z0-9]+\.monday\.app)$/.exec(origin.host)?.[1];
    return Boolean(service) && target.host.endsWith(`-${service}`);
  }

  /**
   * The Run URL of the Sidekick tool's action block.
   *
   * FACT (`apps/docs/authorization-header`, read 28 Sep 2026): the request
   * carries a JWT "signed by your app's Signing Secret" — not the client secret
   * — and "be sure to: Check that the aud field matches your integration app's
   * endpoint. Verify the exp field". FACT (`integration-authorization`): it
   * holds a `shortLivedToken`, "valid for five minutes", with the app's scopes.
   * FACT (`workflows-actions`): the answer is `{ outputFields }` with a 200.
   * FACT (`error-handling`, read 28 Sep 2026): a run URL is retried for 30
   * minutes "unless 4xx/severity code", and a severity code puts the error in
   * the automation's activity log and notifies its creator. So a failure is a
   * 4xx with severity 4000 ("can run again if addressed"), not a fake success.
   */
  async function sidekickTool(req, res) {
    const claims = verifyJwt(req.headers.authorization, signingSecret, Math.floor(now() / 1000), { requireExp: true });
    const token = claims?.shortLivedToken;
    if (!claims || !sidekickAudience(claims.aud) || typeof token !== 'string' || token === '') {
      req.resume();
      return json(res, 401, { error: 'unauthorized' });
    }

    let boardName = '';
    let search = '';
    try {
      const body = JSON.parse((await readBody(req)) || '{}');
      const fields = body?.payload?.inboundFieldValues ?? body?.payload?.inputFields ?? {};
      if (typeof fields.board_name === 'string') boardName = fields.board_name.slice(0, 200);
      if (typeof fields.search === 'string') search = fields.search.slice(0, 200);
    } catch (error) {
      return json(res, error?.status ?? 400, { error: 'bad request' });
    }

    const fail = (status, title, description) =>
      json(res, status, {
        severityCode: 4000,
        notificationErrorTitle: title,
        notificationErrorDescription: description,
        runtimeErrorDescription: description,
      });
    try {
      if (enforceBilling && (await subscriptionState(token)) === 'none') {
        return fail(
          402,
          `${APP_NAME} needs a plan`,
          `${APP_NAME} needs an active plan for this account. An admin can choose one from the app's page in the monday.com marketplace.`,
        );
      }
      const found = await findForSidekick({ monday: makeClient(token), boardName, search, clock });
      const answer = sidekickAnswer(found, now());
      // Counts only; board and automation names stay out of the log.
      log(`sidekick find for account ${String(claims.accountId ?? 'unknown')}: ${answer.match_count} of ${answer.total_count}, ${answer.checked_boards} boards`);
      return json(res, 200, { outputFields: answer });
    } catch (error) {
      log(`sidekick find failed: ${redact(error?.message ?? String(error), [token, signingSecret])}`);
      return fail(
        422,
        `${APP_NAME} could not read your boards`,
        `${APP_NAME} could not read your boards just now. Try again in a minute; if it keeps failing, open the ${APP_NAME} board view, which shows the error.`,
      );
    }
  }

  return async function handle(req, res) {
    try {
      const url = parseRequestUrl(req);
      if (!url) return json(res, 404, { error: 'not found' });
      const route = `${req.method} ${url.pathname}`;

      if (route === 'GET /health') {
        // Single words, so a deploy can be checked from outside without anyone
        // reading a secret back.
        return json(res, 200, { ok: true, billing: enforceBilling ? 'enforce' : 'off', sidekick: 'on' });
      }
      if (route === `POST ${SIDEKICK_PATH}`) return await sidekickTool(req, res);

      const file = req.method === 'GET' ? staticFiles[url.pathname] : undefined;
      if (file) return serveFile(res, file);

      const known = ['/health', SIDEKICK_PATH].includes(url.pathname) || staticFiles[url.pathname];
      req.resume();
      return json(res, known ? 405 : 404, { error: known ? 'method not allowed' : 'not found' });
    } catch (error) {
      log(`request failed: ${redact(error?.message ?? String(error), [signingSecret])}`);
      if (!res.headersSent) json(res, 500, { error: 'internal error' });
      else res.end();
    }
  };
}

/**
 * What the server runs while it is not configured yet.
 *
 * monday code only issues a Live URL once a version has been promoted to live
 * (FACT, `apps/docs/manage-monday-code-in-the-developer-center`), so the very
 * first deploy has to boot without it. It serves the board view, which needs
 * no server configuration, and answers everything else with the *names* of the
 * settings still missing — never a value.
 */
export function createSetupHandler(missing, staticFiles = {}) {
  const names = [...missing];
  return function handle(req, res) {
    const url = parseRequestUrl(req);
    const file = url && req.method === 'GET' ? staticFiles[url.pathname] : undefined;
    if (file) return serveFile(res, file);
    req.resume();
    return json(res, 503, { ok: false, error: 'setup incomplete', missing: names });
  };
}
