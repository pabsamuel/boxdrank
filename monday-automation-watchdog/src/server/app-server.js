/**
 * The app's server on monday code: the OAuth install flow, the scheduled
 * check, and the board view's files.
 *
 * Every monday detail here was read, not remembered, on 26 Sep 2026 — from
 * `apps/docs/oauth`, `apps/docs/schedule-cron-jobs-in-monday-code`,
 * `api-reference/reference/me`, `api-reference/reference/account`, and
 * monday's own sample app (`mondaycom/welcome-apps`,
 * `apps/quickstart-integrations-ts`), which is where the `process.env.PORT`
 * convention comes from. Where the docs were silent, the code says so.
 *
 * Nothing in this file imports the monday SDK. Storage, secrets, the API client
 * and the check itself are all passed in, so the whole flow runs in tests with
 * no network and no monday account — and so the credential-handling paths,
 * which are the ones a security review will read first, are the ones with the
 * most tests.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { redact } from './redact.js';
import { runLogKey } from './run-check.js';

/** FACT (`apps/docs/oauth`). */
export const AUTHORIZE_URL = 'https://auth.monday.com/oauth2/authorize';
/** FACT (`apps/docs/oauth`): POST, answers `{access_token, token_type, scope}`. */
export const TOKEN_URL = 'https://auth.monday.com/oauth2/token';

/**
 * Read-only, all four, and each one for a reason that is written down.
 *
 * `boards:read` — `activity_logs` lives under `boards`. `users:read` — telling
 * people apart from automations. `me:read` and `account:read` — the token
 * response carries no account id, so the app has to ask who installed it; the
 * `me` reference says it needs `me:read` and the `account` reference says
 * `account:read`. This list was two scopes long until reading those two pages.
 */
export const SCOPES = ['boards:read', 'users:read', 'me:read', 'account:read'];

/**
 * The scheduled route. FACT: cron endpoints must be POST routes under
 * `/mndy-cronjob/`; the CLI is given only the part after the prefix, so the job
 * is created with `-e "check"`.
 */
export const CRON_PATH = '/mndy-cronjob/check';

/**
 * Minimum gap between two scheduled runs.
 *
 * The docs call a cron route "a public monday code endpoint" and do not say
 * whether anything but the scheduler can reach it. So this assumes anyone can,
 * and makes that harmless: a second call inside the window does nothing. Alert
 * state already stops repeated emails; this stops repeated API calls, which is
 * the other thing a stranger with a loop could spend.
 */
export const CRON_MIN_INTERVAL_MS = 20 * 60 * 1000;

/**
 * Where monday sends install and uninstall events. Registered by hand in the
 * Developer Center's Webhooks tab, under "All events".
 */
export const LIFECYCLE_PATH = '/monday/lifecycle';

/**
 * What the board view asks for: whether alerts are set up for its account, and
 * the recent check history, so it can say when the last check ran.
 */
export const STATUS_PATH = '/api/status';

/** A lifecycle event is a few hundred bytes. Anything near this is not one. */
const MAX_BODY_BYTES = 64 * 1024;

const HMAC_ALGORITHMS = { HS256: 'sha256', HS384: 'sha384', HS512: 'sha512' };

/**
 * Verifies a JWT signed with a shared secret, or returns null.
 *
 * FACT (`apps/docs/webhooks-1`): lifecycle requests carry "a JWT in the
 * Authorization header", "signed with the Client Secret". The page does not
 * name the algorithm. A shared secret means HMAC, so the three HMAC variants
 * are accepted — which is also what monday's own sample app accepts, since it
 * hands a string secret to `jsonwebtoken` — and nothing else is. In particular
 * `none` and every public-key algorithm are refused outright: accepting either
 * with a shared secret is the classic way a JWT check gets bypassed.
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

const STATE_COOKIE = 'wd_state';
const STATE_TTL_SECONDS = 600;

const REGISTRY_KEY = 'accounts';
const CRON_KEY = 'cron';
export const accountKey = (accountId) => `account:${accountId}`;

/**
 * Headers on everything.
 *
 * HSTS for a year because monday's security review requires at least that.
 * `no-referrer` because the OAuth callback URL carries a live authorization
 * code, and a page that links anywhere would otherwise hand it to the next site
 * in the Referer header.
 */
const BASE_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

/** The app's own pages: no scripts, no frames, nothing cached. */
const PAGE_HEADERS = {
  ...BASE_HEADERS,
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
  'Cache-Control': 'no-store',
};

const escapeHtml = (text) =>
  String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function page(res, status, title, message, extraHeaders = {}) {
  res.writeHead(status, { ...PAGE_HEADERS, ...extraHeaders });
  res.end(
    `<!doctype html><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
      `<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem">` +
      `<h1 style="font-size:1.25rem">${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></body>`,
  );
}

function json(res, status, body) {
  res.writeHead(status, { ...BASE_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readCookie(req, name) {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

/** Equal-length, constant-time comparison; unequal lengths are simply unequal. */
function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a === '' || b === '') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

const stateCookie = (value, maxAge) =>
  `${STATE_COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/oauth; Max-Age=${maxAge}`;

/**
 * @param {object} deps
 * @param {{clientId: string, clientSecret: string, baseUrl: string}} deps.config
 *   `baseUrl` is the app's public https origin; the redirect URI is derived
 *   from it and must match one registered in the Developer Center.
 * @param {{get: Function, set: Function, delete: Function}} deps.secureStorage
 *   App-scoped. Holds each account's token and the account registry.
 * @param {(token: string) => {api: Function}} deps.makeClient
 * @param {(token: string) => {get: Function, set: Function}} deps.makeStorage
 * @param {{send: Function}} deps.mailer
 * @param {Function} deps.runCheck
 * @param {Record<string, {type: string, body: string|Buffer}>} [deps.staticFiles]
 *   Exact paths only. An allowlist, so there is no path to traverse.
 */
export function createAppHandler({
  config,
  secureStorage,
  makeClient,
  makeStorage,
  mailer,
  runCheck,
  staticFiles = {},
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  newState = () => randomBytes(32).toString('base64url'),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log = () => {},
}) {
  const { clientId, clientSecret, baseUrl } = config ?? {};
  if (!clientId || !clientSecret) throw new Error('The monday client id and secret are required.');
  const origin = new URL(baseUrl);
  if (origin.protocol !== 'https:') throw new Error('The app base URL must be https.');
  const redirectUri = new URL('/oauth/callback', origin).toString();

  // ---- install -------------------------------------------------------------

  function startInstall(res) {
    const state = newState();
    const target = new URL(AUTHORIZE_URL);
    target.searchParams.set('client_id', clientId);
    target.searchParams.set('redirect_uri', redirectUri);
    target.searchParams.set('scope', SCOPES.join(' '));
    target.searchParams.set('state', state);
    res.writeHead(302, {
      ...BASE_HEADERS,
      'Cache-Control': 'no-store',
      Location: target.toString(),
      'Set-Cookie': stateCookie(state, STATE_TTL_SECONDS),
    });
    res.end();
  }

  async function exchangeCode(code) {
    // Form-encoded, as RFC 6749 §4.1.3 specifies for the token endpoint. The
    // monday page lists the four parameters but not the encoding — that part
    // is the standard's, not a guess about monday.
    const response = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      }).toString(),
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`token endpoint returned HTTP ${response.status}`);
    let body;
    try {
      body = await response.json();
    } catch {
      throw new Error('token endpoint returned something that is not JSON');
    }
    if (typeof body?.access_token !== 'string' || body.access_token === '') {
      throw new Error('token endpoint returned no access token');
    }
    return body.access_token;
  }

  /**
   * Who installed, and into which account.
   *
   * Asked of monday with the new token, never taken from the request. An
   * account id supplied by the browser would let anyone attach their token to
   * someone else's account and receive that account's alerts.
   */
  async function identify(token) {
    const response = await makeClient(token).api('query { me { email account { id } } }');
    if (response?.errors?.length) throw new Error('monday refused the identity query');
    const me = response?.data?.me;
    const accountId = String(me?.account?.id ?? '');
    if (!/^\d+$/.test(accountId)) throw new Error('monday returned no usable account id');
    return { accountId, email: typeof me?.email === 'string' ? me.email : null };
  }

  /**
   * Adds an account to the list the scheduled check walks.
   *
   * Read, modify, write — so two installs landing together can each read the
   * old list and the second write erases the first. The account that loses is
   * never checked again, and nothing says so: for this product, the worst
   * possible failure. So the write is read back, and retried until it holds.
   * The pause is monday's own limit — secure storage takes one write a second
   * to the same key (FACT, `apps/docs/monday-code-javascript-sdk`).
   */
  async function register(accountId) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const current = (await secureStorage.get(REGISTRY_KEY))?.ids ?? [];
      if (current.includes(accountId)) return true;
      if (attempt > 0) await sleep(1100);
      await secureStorage.set(REGISTRY_KEY, { ids: [...current, accountId] });
    }
    const final = (await secureStorage.get(REGISTRY_KEY))?.ids ?? [];
    if (final.includes(accountId)) return true;
    log(`account ${accountId} could not be added to the registry`);
    return false;
  }

  async function finishInstall(req, res, url) {
    const clearCookie = { 'Set-Cookie': stateCookie('', 0) };

    const denied = url.searchParams.get('error');
    if (denied) {
      return page(res, 400, 'Installation was not completed', `monday reported: ${denied.slice(0, 80)}`, clearCookie);
    }

    // The state has to come back in the query *and* match the cookie set on
    // this browser at the start. Without it, anyone could send a victim a
    // callback link carrying the attacker's own code and bind the victim's
    // browser session to an install they never started.
    if (!sameSecret(url.searchParams.get('state'), readCookie(req, STATE_COOKIE))) {
      return page(res, 400, 'Installation was not completed', 'This link has expired or was not started here. Start the installation again.', clearCookie);
    }

    const code = url.searchParams.get('code');
    if (!code) return page(res, 400, 'Installation was not completed', 'monday sent no authorization code.', clearCookie);

    let token;
    try {
      token = await exchangeCode(code);
      const { accountId, email } = await identify(token);
      await secureStorage.set(accountKey(accountId), { token, recipient: email, installedAt: now() });
      await register(accountId);
      log(`installed for account ${accountId}`);
      return page(
        res,
        200,
        'Automation Watchdog is installed',
        email
          ? `Alerts will go to ${email} when an automation that used to run regularly goes quiet.`
          : 'Alerts are set up. No email address was found for your user, so none will be sent until one is.',
        clearCookie,
      );
    } catch (error) {
      // Status and nothing else. Whatever went wrong, the message may carry
      // the code, the secret or the token, and it is about to be logged.
      log(`install failed: ${redact(error?.message ?? String(error), [token, clientSecret, code])}`);
      return page(res, 502, 'Installation was not completed', 'monday could not be reached to finish the installation. Please try again.', clearCookie);
    }
  }

  // ---- scheduled check -----------------------------------------------------

  async function scheduledCheck(res) {
    const last = (await secureStorage.get(CRON_KEY))?.lastRunAt ?? 0;
    if (now() - last < CRON_MIN_INTERVAL_MS) return json(res, 200, { skipped: true });
    // Claimed before running rather than after, so two overlapping calls
    // cannot both get through while the first one is still working.
    await secureStorage.set(CRON_KEY, { lastRunAt: now() });

    const ids = (await secureStorage.get(REGISTRY_KEY))?.ids ?? [];
    const counts = { accounts: ids.length, ok: 0, failed: 0, missing: 0 };

    // One account at a time. monday allows 12 storage requests a second per
    // token and 7 a second for secure storage; a fan-out across every
    // installed account is how one busy account would starve all the others.
    for (const accountId of ids) {
      const record = await secureStorage.get(accountKey(accountId));
      if (!record?.token) {
        counts.missing += 1;
        continue;
      }
      try {
        await runCheck({
          monday: makeClient(record.token),
          storage: makeStorage(record.token),
          mailer,
          accountId,
          recipient: record.recipient,
        });
        counts.ok += 1;
      } catch (error) {
        // One account failing — uninstalled, rate-limited, a board it cannot
        // read — must never stop the next one from being checked.
        counts.failed += 1;
        log(`check failed for account ${accountId}: ${redact(error?.message ?? String(error), [record.token])}`);
      }
    }
    // Counts only. No board names, no account names, no addresses: this goes
    // to whatever called the route, which may not be the scheduler.
    return json(res, 200, counts);
  }

  // ---- uninstall -----------------------------------------------------------

  /**
   * Forgets an account when it uninstalls.
   *
   * The token dies at uninstall anyway — FACT: tokens are "valid until the
   * user uninstalls your app" — but the record also holds the installer's
   * email address, and keeping someone's address after they removed the app is
   * exactly what a privacy statement should be able to say does not happen.
   *
   * What cannot be deleted: the per-account watchdog state in monday Storage
   * (signal keys, board and actor ids, timestamps — no names, addresses or
   * tokens). Storage needs the account's token, which is dead by now. Whether
   * monday purges it on uninstall is UNKNOWN.
   */
  async function lifecycle(req, res) {
    const claims = verifyJwt(req.headers.authorization, clientSecret, Math.floor(now() / 1000));
    if (!claims) return json(res, 401, { error: 'unauthorized' });

    let event;
    try {
      event = JSON.parse(await readBody(req));
    } catch (error) {
      return json(res, error?.status ?? 400, { error: 'bad request' });
    }

    if (event?.type !== 'uninstall') return json(res, 200, { ok: true });

    const accountId = String(event?.data?.account_id ?? '');
    if (!/^\d+$/.test(accountId)) return json(res, 400, { error: 'bad request' });

    // The body is not what the signature covers. If the signed claims name an
    // account, the body has to agree with them, so a captured request cannot be
    // replayed against a different account inside its lifetime.
    if (claims.accountId !== undefined && String(claims.accountId) !== accountId) {
      return json(res, 401, { error: 'unauthorized' });
    }

    await secureStorage.delete(accountKey(accountId));
    const ids = (await secureStorage.get(REGISTRY_KEY))?.ids ?? [];
    if (ids.includes(accountId)) {
      await secureStorage.set(REGISTRY_KEY, { ids: ids.filter((id) => id !== accountId) });
    }
    log(`uninstalled for account ${accountId}`);
    return json(res, 200, { ok: true });
  }

  // ---- board view status ---------------------------------------------------

  /**
   * The run log, for the account the board view is open in.
   *
   * Without this the board view could not see the scheduled job at all, and it
   * told every user "scheduled checks are not running" while they ran — a
   * false alarm, in a product whose whole job is to not raise false alarms.
   *
   * FACT (`apps/docs/mondayget`): `monday.get('sessionToken')` returns a JWT
   * "signed with your app's client secret", carrying `dat.account_id`. The
   * account comes from those signed claims and nowhere else, so a user can only
   * ever read the account they are signed in to. The docs' example shows `exp`
   * as a date string; monday's own recommended check (`jwt.verify` from
   * jsonwebtoken) rejects a non-numeric `exp`, so the real token must carry a
   * number, and a string is refused here too.
   */
  async function status(req, res) {
    // Session tokens are short-lived by design; one without an expiry would
    // work forever if it ever leaked, so here an expiry is mandatory.
    const claims = verifyJwt(req.headers.authorization, clientSecret, Math.floor(now() / 1000), { requireExp: true });
    const accountId = String(claims?.dat?.account_id ?? '');
    if (!claims || !/^\d+$/.test(accountId)) return json(res, 401, { error: 'unauthorized' });

    const record = await secureStorage.get(accountKey(accountId));
    if (!record?.token) return json(res, 200, { installed: false, runs: [] });

    // Self-healing: an installed account missing from the registry is one the
    // scheduled check silently skips. Opening the board view puts it back.
    const ids = (await secureStorage.get(REGISTRY_KEY))?.ids ?? [];
    if (!ids.includes(accountId)) {
      log(`account ${accountId} was installed but not registered; re-registering`);
      await register(accountId);
    }

    try {
      const runs = (await makeStorage(record.token).get(runLogKey(accountId))) ?? [];
      return json(res, 200, { installed: true, runs: Array.isArray(runs) ? runs : [] });
    } catch (error) {
      // Scrubbed of this account's token, which the outer handler does not know.
      log(`status failed for account ${accountId}: ${redact(error?.message ?? String(error), [record.token])}`);
      return json(res, 502, { error: 'check history unavailable' });
    }
  }

  // ---- routing -------------------------------------------------------------

  return async function handle(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost');
      const route = `${req.method} ${url.pathname}`;

      if (route === 'GET /health') return json(res, 200, { ok: true });
      if (route === 'GET /oauth/start') return startInstall(res);
      if (route === 'GET /oauth/callback') return await finishInstall(req, res, url);
      if (route === `POST ${LIFECYCLE_PATH}`) return await lifecycle(req, res);
      if (route === `GET ${STATUS_PATH}`) return await status(req, res);
      if (route === `POST ${CRON_PATH}`) {
        req.resume();
        return await scheduledCheck(res);
      }

      const file = req.method === 'GET' ? staticFiles[url.pathname] : undefined;
      if (file) {
        // The board view runs inside monday's iframe, so no frame-ancestors
        // restriction here; the app's own pages above do forbid framing.
        res.writeHead(200, { ...BASE_HEADERS, 'Content-Type': file.type, 'Cache-Control': 'no-cache' });
        return res.end(file.body);
      }

      const known =
        ['/health', '/oauth/start', '/oauth/callback', CRON_PATH, LIFECYCLE_PATH, STATUS_PATH].includes(url.pathname) ||
        staticFiles[url.pathname];
      return json(res, known ? 405 : 404, { error: known ? 'method not allowed' : 'not found' });
    } catch (error) {
      log(`request failed: ${redact(error?.message ?? String(error), [clientSecret])}`);
      if (!res.headersSent) json(res, 500, { error: 'internal error' });
      else res.end();
    }
  };
}

/**
 * What the server runs while it is not configured yet.
 *
 * monday code only issues a stable Live URL once a version has been promoted
 * to live (FACT, `apps/docs/manage-monday-code-in-the-developer-center`), and
 * the OAuth redirect URI is built from that URL. So the very first deploy has
 * to boot without it. Refusing to start would make the first deploy fail,
 * which is the one deploy that cannot be skipped.
 *
 * It serves the board view, which needs no server configuration because it
 * authenticates in the browser, and answers everything else with the *names*
 * of the settings still missing — never a value.
 */
export function createSetupHandler(missing, staticFiles = {}) {
  const names = [...missing];
  return function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const file = req.method === 'GET' ? staticFiles[url.pathname] : undefined;
    if (file) {
      res.writeHead(200, { ...BASE_HEADERS, 'Content-Type': file.type, 'Cache-Control': 'no-cache' });
      return res.end(file.body);
    }
    req.resume();
    return json(res, 503, { ok: false, error: 'setup incomplete', missing: names });
  };
}
