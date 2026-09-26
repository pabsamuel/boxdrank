import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { connect } from 'node:net';
import {
  maskEmail,
  createAppHandler,
  createSetupHandler,
  LIFECYCLE_PATH,
  STATUS_PATH,
  verifyJwt,
  AUTHORIZE_URL,
  TOKEN_URL,
  SCOPES,
  CRON_PATH,
  CRON_MIN_INTERVAL_MS,
  accountKey,
} from '../src/server/app-server.js';

const CLIENT_SECRET = 'client-secret-value-123';
const TOKEN = 'account-access-token-xyz789';

function memoryStore(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    async get(key) {
      return data.has(key) ? structuredClone(data.get(key)) : null;
    },
    async set(key, value) {
      data.set(key, structuredClone(value));
    },
  };
}

/** Builds the handler with fakes, and a server to drive it over real HTTP. */
async function harness(overrides = {}) {
  const logs = [];
  const tokenRequests = [];
  const checks = [];
  let clock = overrides.startAt ?? 1_000_000_000_000;

  const deps = {
    config: { clientId: 'client-id-1', clientSecret: CLIENT_SECRET, baseUrl: 'https://watchdog.example' },
    secureStorage: memoryStore(),
    makeClient: () => ({
      api: async () => ({ data: { me: { id: 1, email: 'admin@acme.example', account: { id: 123 } } } }),
    }),
    makeStorage: (token) => ({ token }),
    mailer: { async send() {} },
    runCheck: async (args) => {
      checks.push(args);
    },
    fetchImpl: async (url, init) => {
      tokenRequests.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ access_token: TOKEN, token_type: 'Bearer' }) };
    },
    now: () => clock,
    newState: () => 'fixed-state-value-abc',
    sleep: async () => {},
    log: (message) => logs.push(message),
    ...overrides,
  };
  delete deps.startAt;

  const server = createServer(createAppHandler(deps));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  return {
    deps,
    logs,
    tokenRequests,
    checks,
    advance: (ms) => {
      clock += ms;
    },
    request: (path, init = {}) => fetch(`${base}${path}`, { redirect: 'manual', ...init }),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

const withHarness = (overrides, fn) => async () => {
  const h = await harness(overrides);
  try {
    await fn(h);
  } finally {
    await h.close();
  }
};

const cookie = 'wd_state=fixed-state-value-abc';

// ---- install ---------------------------------------------------------------

test('starting an install redirects to monday with the read-only scopes and a state', withHarness({}, async (h) => {
  const res = await h.request('/oauth/start');
  assert.equal(res.status, 302);

  const target = new URL(res.headers.get('location'));
  assert.equal(`${target.origin}${target.pathname}`, AUTHORIZE_URL);
  assert.equal(target.searchParams.get('client_id'), 'client-id-1');
  assert.equal(target.searchParams.get('redirect_uri'), 'https://watchdog.example/oauth/callback');
  assert.equal(target.searchParams.get('scope'), 'boards:read users:read me:read account:read');
  assert.equal(target.searchParams.get('state'), 'fixed-state-value-abc');

  // Nothing that can write: every scope requested ends in :read.
  assert.ok(SCOPES.every((scope) => scope.endsWith(':read')));

  const setCookie = res.headers.get('set-cookie');
  assert.match(setCookie, /^wd_state=fixed-state-value-abc;/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /SameSite=Lax/);
}));

test('a callback whose state does not match the cookie is refused before any exchange', withHarness({}, async (h) => {
  // The login-CSRF case: a link carrying someone else's code and state.
  const res = await h.request('/oauth/callback?code=attacker-code&state=attacker-state', {
    headers: { cookie },
  });
  assert.equal(res.status, 400);
  assert.equal(h.tokenRequests.length, 0, 'the code must never be exchanged');
  assert.equal(h.deps.secureStorage.data.size, 0);
}));

test('a callback with no state cookie at all is refused', withHarness({}, async (h) => {
  const res = await h.request('/oauth/callback?code=c&state=fixed-state-value-abc');
  assert.equal(res.status, 400);
  assert.equal(h.tokenRequests.length, 0);
}));

test('a denied install says so, escaped, and stores nothing', withHarness({}, async (h) => {
  const res = await h.request('/oauth/callback?error=<script>alert(1)</script>', { headers: { cookie } });
  assert.equal(res.status, 400);
  const body = await res.text();
  assert.ok(!body.includes('<script>alert'), 'monday-supplied text must be escaped');
  assert.equal(h.deps.secureStorage.data.size, 0);
}));

test('a completed install exchanges the code, asks monday who installed, and stores the token', withHarness({}, async (h) => {
  const res = await h.request('/oauth/callback?code=real-code&state=fixed-state-value-abc', { headers: { cookie } });
  assert.equal(res.status, 200);

  // The exchange: the documented endpoint, the four documented parameters.
  assert.equal(h.tokenRequests.length, 1);
  const { url, init } = h.tokenRequests[0];
  assert.equal(url, TOKEN_URL);
  assert.equal(init.method, 'POST');
  assert.equal(init.redirect, 'error');
  const form = new URLSearchParams(init.body);
  assert.deepEqual(Object.fromEntries(form), {
    client_id: 'client-id-1',
    client_secret: CLIENT_SECRET,
    redirect_uri: 'https://watchdog.example/oauth/callback',
    code: 'real-code',
  });

  // Keyed by the account monday reported, never by anything in the request.
  const stored = h.deps.secureStorage.data.get(accountKey('123'));
  assert.equal(stored.token, TOKEN);
  assert.equal(stored.recipient, 'admin@acme.example');
  assert.deepEqual(h.deps.secureStorage.data.get('accounts'), { ids: ['123'] });

  const body = await res.text();
  assert.ok(!body.includes(TOKEN), 'the token must never be shown');
  assert.match(body, /ad…@acme\.example/, 'the address is shown masked');
  assert.ok(!body.includes('admin@acme.example'), 'never in full: the edge would rewrite it into a script-only link');
  assert.match(res.headers.get('set-cookie'), /Max-Age=0/, 'the state is single-use');
}));

test('reinstalling replaces the token without duplicating the account', withHarness({}, async (h) => {
  await h.request('/oauth/callback?code=one&state=fixed-state-value-abc', { headers: { cookie } });
  await h.request('/oauth/callback?code=two&state=fixed-state-value-abc', { headers: { cookie } });
  assert.deepEqual(h.deps.secureStorage.data.get('accounts'), { ids: ['123'] });
}));

test('a failed token exchange stores nothing and logs no secret', withHarness({
  fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({}) }),
}, async (h) => {
  const res = await h.request('/oauth/callback?code=secret-code-value&state=fixed-state-value-abc', { headers: { cookie } });
  assert.equal(res.status, 502);
  assert.equal(h.deps.secureStorage.data.size, 0);
  const logged = h.logs.join('\n');
  assert.ok(!logged.includes(CLIENT_SECRET));
  assert.ok(!logged.includes('secret-code-value'));
}));

test('an account id monday did not vouch for is never stored', withHarness({
  makeClient: () => ({ api: async () => ({ data: { me: { email: 'a@b.example', account: { id: '../../x' } } } }) }),
}, async (h) => {
  const res = await h.request('/oauth/callback?code=c&state=fixed-state-value-abc', { headers: { cookie } });
  assert.equal(res.status, 502);
  assert.equal(h.deps.secureStorage.data.size, 0);
}));

test('an email address is escaped on the confirmation page', withHarness({
  makeClient: () => ({ api: async () => ({ data: { me: { email: '<img src=x onerror=alert(1)>', account: { id: 5 } } } }) }),
}, async (h) => {
  const res = await h.request('/oauth/callback?code=c&state=fixed-state-value-abc', { headers: { cookie } });
  const body = await res.text();
  assert.ok(!body.includes('<img'), 'the address must not become markup');
}));

// ---- scheduled check -------------------------------------------------------

const installed = (...ids) =>
  memoryStore({
    accounts: { ids },
    ...Object.fromEntries(ids.map((id) => [accountKey(id), { token: `token-for-${id}-long`, recipient: `${id}@x.example` }])),
  });

test('the scheduled check runs every installed account with its own token', withHarness({
  secureStorage: installed('1', '2'),
}, async (h) => {
  const res = await h.request(CRON_PATH, { method: 'POST' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { accounts: 2, ok: 2, failed: 0, missing: 0 });

  assert.deepEqual(h.checks.map((c) => [c.accountId, c.recipient, c.storage.token]), [
    ['1', '1@x.example', 'token-for-1-long'],
    ['2', '2@x.example', 'token-for-2-long'],
  ]);
}));

test('one account failing does not stop the next, and its token stays out of the log', withHarness({
  secureStorage: installed('1', '2'),
  runCheck: async ({ accountId }) => {
    if (accountId === '1') throw new Error('401 for token-for-1-long');
  },
}, async (h) => {
  const res = await h.request(CRON_PATH, { method: 'POST' });
  assert.deepEqual(await res.json(), { accounts: 2, ok: 1, failed: 1, missing: 0 });
  assert.ok(!h.logs.join('\n').includes('token-for-1-long'));
}));

test('a second call inside the window does nothing, whoever makes it', withHarness({
  secureStorage: installed('1'),
}, async (h) => {
  // The docs do not say the cron route is private, so it is treated as public.
  await h.request(CRON_PATH, { method: 'POST' });
  const again = await h.request(CRON_PATH, { method: 'POST' });
  assert.deepEqual(await again.json(), { skipped: true });
  assert.equal(h.checks.length, 1);

  h.advance(CRON_MIN_INTERVAL_MS);
  await h.request(CRON_PATH, { method: 'POST' });
  assert.equal(h.checks.length, 2, 'the next window runs normally');
}));

test('the scheduled check reports counts and nothing about the accounts', withHarness({
  secureStorage: installed('1'),
}, async (h) => {
  const body = await (await h.request(CRON_PATH, { method: 'POST' })).text();
  assert.ok(!body.includes('x.example'));
  assert.ok(!body.includes('token'));
}));

// ---- routing and headers ---------------------------------------------------

test('the board view is served by exact path and nothing else is', withHarness({
  staticFiles: { '/view/': { type: 'text/html; charset=utf-8', body: '<p>view</p>' } },
}, async (h) => {
  const ok = await h.request('/view/');
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), '<p>view</p>');

  assert.equal((await h.request('/view/../package.json')).status, 404);
  assert.equal((await h.request('/view/%2e%2e/package.json')).status, 404);
  assert.equal((await h.request('/nope')).status, 404);
}));

test('a known route with the wrong method is 405, not a run', withHarness({ secureStorage: installed('1') }, async (h) => {
  assert.equal((await h.request(CRON_PATH)).status, 405);
  assert.equal((await h.request('/oauth/start', { method: 'POST' })).status, 405);
  assert.equal(h.checks.length, 0);
}));

test('every response carries HSTS, nosniff and no-referrer', withHarness({}, async (h) => {
  for (const path of ['/health', '/oauth/start', '/oauth/callback', '/nope']) {
    const res = await h.request(path);
    assert.equal(res.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains', path);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', path);
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer', path);
  }
  const page = await h.request('/oauth/callback');
  assert.match(page.headers.get('content-security-policy'), /default-src 'none'/);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
}));

test('misconfiguration fails at construction, not on the first install', () => {
  const base = {
    config: { clientId: 'a', clientSecret: 'b', baseUrl: 'https://x.example' },
    secureStorage: memoryStore(),
  };
  assert.throws(() => createAppHandler({ ...base, config: { ...base.config, clientSecret: '' } }), /client id and secret/);
  assert.throws(() => createAppHandler({ ...base, config: { ...base.config, baseUrl: 'http://x.example' } }), /must be https/);
  assert.throws(() => createAppHandler({ ...base, config: { ...base.config, baseUrl: 'not a url' } }));
});

// ---- uninstall -------------------------------------------------------------

function sign(payload, secret = CLIENT_SECRET, alg = 'HS256') {
  const head = Buffer.from(JSON.stringify({ alg, typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hash = { HS256: 'sha256', HS384: 'sha384', HS512: 'sha512' }[alg] ?? 'sha256';
  const signature = createHmac(hash, secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${signature}`;
}

const withDelete = (store) => Object.assign(store, { async delete(key) { store.data.delete(key); } });
const uninstallBody = (accountId) => JSON.stringify({ type: 'uninstall', data: { account_id: accountId } });

/** A monday client whose token has been revoked, as it is after a real uninstall. */
const revoked = () => ({
  api: async () => {
    throw Object.assign(new Error('monday API returned HTTP 401'), { status: 401 });
  },
});

test('a signed uninstall forgets the account: token, address and registry entry', withHarness({
  secureStorage: withDelete(installed('1', '2')),
  makeClient: revoked,
}, async (h) => {
  const res = await h.request(LIFECYCLE_PATH, {
    method: 'POST',
    headers: { authorization: sign({ exp: 9_999_999_999 }) },
    body: uninstallBody(1),
  });
  assert.equal(res.status, 200);
  assert.equal(h.deps.secureStorage.data.has(accountKey('1')), false, 'token and address are gone');
  assert.deepEqual(h.deps.secureStorage.data.get('accounts'), { ids: ['2'] });
  assert.ok(h.deps.secureStorage.data.has(accountKey('2')), 'other accounts are untouched');
}));

test('an uninstall without a valid signature changes nothing', withHarness({
  secureStorage: withDelete(installed('1')),
}, async (h) => {
  // Otherwise anyone could uninstall any account by posting its id.
  for (const authorization of [undefined, 'garbage', sign({}, 'wrong-secret'), sign({ exp: 1 })]) {
    const res = await h.request(LIFECYCLE_PATH, {
      method: 'POST',
      headers: authorization ? { authorization } : {},
      body: uninstallBody(1),
    });
    assert.equal(res.status, 401, String(authorization));
  }
  assert.ok(h.deps.secureStorage.data.has(accountKey('1')));
}));

test('signed claims naming one account cannot uninstall another', withHarness({
  secureStorage: withDelete(installed('1', '2')),
}, async (h) => {
  const res = await h.request(LIFECYCLE_PATH, {
    method: 'POST',
    headers: { authorization: sign({ accountId: 2, exp: 9_999_999_999 }) },
    body: uninstallBody(1),
  });
  assert.equal(res.status, 401);
  assert.ok(h.deps.secureStorage.data.has(accountKey('1')));
}));

test('other lifecycle events are acknowledged and ignored', withHarness({
  secureStorage: withDelete(installed('1')),
}, async (h) => {
  const res = await h.request(LIFECYCLE_PATH, {
    method: 'POST',
    headers: { authorization: sign({ exp: 9_999_999_999 }) },
    body: JSON.stringify({ type: 'install', data: { account_id: 1 } }),
  });
  assert.equal(res.status, 200);
  assert.ok(h.deps.secureStorage.data.has(accountKey('1')));
}));

test('an oversized lifecycle body is refused', withHarness({
  secureStorage: withDelete(installed('1')),
}, async (h) => {
  const res = await h.request(LIFECYCLE_PATH, {
    method: 'POST',
    headers: { authorization: sign({ exp: 9_999_999_999 }) },
    body: 'x'.repeat(70 * 1024),
  });
  assert.equal(res.status, 413);
}));

test('the JWT check refuses none, public-key algorithms and tampering', () => {
  const now = 1_000;
  const good = sign({ exp: 2_000 });
  assert.ok(verifyJwt(good, CLIENT_SECRET, now));
  assert.ok(verifyJwt(`Bearer ${good}`, CLIENT_SECRET, now), 'a Bearer prefix is tolerated');
  assert.ok(verifyJwt(sign({}, CLIENT_SECRET, 'HS512'), CLIENT_SECRET, now));

  const [head, body] = good.split('.');
  const none = `${Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')}.${body}.`;
  assert.equal(verifyJwt(none, CLIENT_SECRET, now), null, 'alg none');
  const rs = `${Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url')}.${body}.${good.split('.')[2]}`;
  assert.equal(verifyJwt(rs, CLIENT_SECRET, now), null, 'RS256 with a shared secret');

  const tampered = `${head}.${Buffer.from(JSON.stringify({ exp: 2_000, accountId: 9 })).toString('base64url')}.${good.split('.')[2]}`;
  assert.equal(verifyJwt(tampered, CLIENT_SECRET, now), null, 'payload changed after signing');
  assert.equal(verifyJwt(good, CLIENT_SECRET, 3_000), null, 'expired');
  assert.equal(verifyJwt('a.b', CLIENT_SECRET, now), null);
});

// ---- setup mode ------------------------------------------------------------


test('before configuration the server names what is missing and serves the view', async () => {
  const server = createServer(
    createSetupHandler(['WATCHDOG_BASE_URL', 'SMTP_URL'], {
      '/view/': { type: 'text/html; charset=utf-8', body: '<p>view</p>' },
    }),
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 503);
    assert.deepEqual(await health.json(), { ok: false, error: 'setup incomplete', missing: ['WATCHDOG_BASE_URL', 'SMTP_URL'] });
    assert.equal(health.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains');

    // The board view authenticates in the browser, so it works before setup.
    assert.equal(await (await fetch(`${base}/view/`)).text(), '<p>view</p>');

    const cron = await fetch(`${base}${CRON_PATH}`, { method: 'POST' });
    assert.equal(cron.status, 503);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

// ---- board view status -----------------------------------------------------

const session = (accountId, exp = 9_999_999_999) => sign({ exp, dat: { account_id: accountId, user_id: 7 } });

test('the board view gets its own account\'s check history', withHarness({
  secureStorage: installed('1'),
  makeStorage: (token) => ({
    async get(key) {
      return key === 'watchdog:runs:v1:1' && token === 'token-for-1-long' ? [{ at: 5, watched: 3, silent: 0, sent: false }] : null;
    },
  }),
}, async (h) => {
  const res = await h.request(STATUS_PATH, { headers: { authorization: session(1) } });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { installed: true, runs: [{ at: 5, watched: 3, silent: 0, sent: false }] });
}));

test('an account that never installed is told so, which is what shows the setup link', withHarness({
  secureStorage: installed('1'),
}, async (h) => {
  const res = await h.request(STATUS_PATH, { headers: { authorization: session(2) } });
  assert.deepEqual(await res.json(), { installed: false, runs: [] });
}));

test('status needs a session token monday signed, and only ever reveals that account', withHarness({
  secureStorage: installed('1'),
  makeStorage: () => ({ async get() { return [{ at: 1, watched: 1, silent: 1, sent: true }]; } }),
}, async (h) => {
  for (const authorization of [undefined, 'garbage', sign({ exp: 9_999_999_999, dat: { account_id: 1 } }, 'wrong-secret'), session(1, 1), sign({ exp: 9_999_999_999 })]) {
    const res = await h.request(STATUS_PATH, { headers: authorization ? { authorization } : {} });
    assert.equal(res.status, 401, String(authorization));
  }
}));

// ---- hardening -------------------------------------------------------------

test('an install whose registry write is overwritten retries until it holds', withHarness({}, async (h) => {
  // Simulates a concurrent install: the first write to the registry is
  // clobbered by another account's write before it can be read back.
  const store = h.deps.secureStorage;
  const realSet = store.set.bind(store);
  let clobbered = false;
  store.set = async (key, value) => {
    await realSet(key, value);
    if (key === 'accounts' && !clobbered) {
      clobbered = true;
      await realSet('accounts', { ids: ['999'] });
    }
  };
  const res = await h.request('/oauth/callback?code=c&state=fixed-state-value-abc', { headers: { cookie } });
  assert.equal(res.status, 200);
  assert.deepEqual(store.data.get('accounts').ids.sort(), ['123', '999'], 'neither account is lost');
}));

test('opening the board view re-registers an installed account the check had lost', withHarness({
  secureStorage: memoryStore({
    accounts: { ids: [] },
    [accountKey('1')]: { token: 'token-for-1-long', recipient: 'a@x.example' },
  }),
  makeStorage: () => ({ async get() { return []; } }),
}, async (h) => {
  const res = await h.request(STATUS_PATH, { headers: { authorization: session(1) } });
  assert.equal(res.status, 200);
  assert.deepEqual(h.deps.secureStorage.data.get('accounts'), { ids: ['1'] });
}));

test('a session token with no expiry is refused by the status endpoint', withHarness({
  secureStorage: installed('1'),
}, async (h) => {
  const forever = sign({ dat: { account_id: 1 } });
  assert.equal((await h.request(STATUS_PATH, { headers: { authorization: forever } })).status, 401);
}));

test('a storage failure on status keeps the account token out of the log', withHarness({
  secureStorage: installed('1'),
  makeStorage: () => ({ async get() { throw new Error('storage said no to token-for-1-long'); } }),
}, async (h) => {
  const res = await h.request(STATUS_PATH, { headers: { authorization: session(1) } });
  assert.equal(res.status, 502);
  assert.ok(!h.logs.join('\n').includes('token-for-1-long'));
}));

// ---- review findings, 26 Sep ------------------------------------------------

test('a board-view session token cannot uninstall another account', withHarness({
  secureStorage: withDelete(installed('1', '2')),
  // Account 1's token is alive: it has not uninstalled anything.
  makeClient: () => ({ api: async () => ({ data: { me: { id: 7 } } }) }),
}, async (h) => {
  // The reviewer's attack: account 2's user copies the session token their
  // board view sends to /api/status, and names account 1 in the body.
  const attackerSession = session(2);
  const res = await h.request(LIFECYCLE_PATH, {
    method: 'POST',
    headers: { authorization: attackerSession },
    body: uninstallBody(1),
  });
  assert.notEqual(res.status, 500);
  assert.ok(h.deps.secureStorage.data.has(accountKey('1')), 'the victim is still installed');
  assert.deepEqual(h.deps.secureStorage.data.get('accounts').ids, ['1', '2']);
}));

test('a signed uninstall for a live install changes nothing', withHarness({
  secureStorage: withDelete(installed('1')),
  makeClient: () => ({ api: async () => ({ data: { me: { id: 7 } } }) }),
}, async (h) => {
  const res = await h.request(LIFECYCLE_PATH, {
    method: 'POST',
    headers: { authorization: sign({ exp: 9_999_999_999 }) },
    body: uninstallBody(1),
  });
  assert.equal(res.status, 200);
  assert.ok(h.deps.secureStorage.data.has(accountKey('1')));
}));

test('an uninstall that cannot be confirmed keeps the record and asks to be retried', withHarness({
  secureStorage: withDelete(installed('1')),
  makeClient: () => ({ api: async () => { throw new Error('ECONNRESET'); } }),
}, async (h) => {
  const res = await h.request(LIFECYCLE_PATH, {
    method: 'POST',
    headers: { authorization: sign({ exp: 9_999_999_999 }) },
    body: uninstallBody(1),
  });
  assert.equal(res.status, 503);
  assert.ok(h.deps.secureStorage.data.has(accountKey('1')));
}));

test('calls to the cron route inside the window never touch secure storage', withHarness({
  secureStorage: installed('1'),
}, async (h) => {
  await h.request(CRON_PATH, { method: 'POST' });
  const store = h.deps.secureStorage;
  let reads = 0;
  const realGet = store.get.bind(store);
  store.get = async (key) => {
    reads += 1;
    return realGet(key);
  };
  // A stranger's flood: before, each of these spent one of the app's seven
  // secure-storage requests a second, and the real scheduler's call failed.
  await Promise.all(Array.from({ length: 20 }, () => h.request(CRON_PATH, { method: 'POST' })));
  assert.equal(reads, 0);
}));

test('an outsider can trigger at most one run per window, not one every 20 minutes', withHarness({
  secureStorage: installed('1'),
}, async (h) => {
  await h.request(CRON_PATH, { method: 'POST' });
  h.advance(20 * 60 * 1000);
  await h.request(CRON_PATH, { method: 'POST' });
  assert.equal(h.checks.length, 1);
}));

test('one unreadable account record costs that account, not every account after it', withHarness({
  secureStorage: installed('1', '2', '3'),
}, async (h) => {
  const store = h.deps.secureStorage;
  const realGet = store.get.bind(store);
  store.get = async (key) => {
    if (key === accountKey('2')) throw new Error('rate limited');
    return realGet(key);
  };
  const res = await h.request(CRON_PATH, { method: 'POST' });
  assert.deepEqual(await res.json(), { accounts: 3, ok: 2, failed: 1, missing: 0 });
  assert.deepEqual(h.checks.map((c) => c.accountId), ['1', '3']);
}));

test('a run that stops before checking anyone releases the window', withHarness({
  secureStorage: installed('1'),
}, async (h) => {
  const store = h.deps.secureStorage;
  const realGet = store.get.bind(store);
  let failRegistry = true;
  store.get = async (key) => {
    if (key === 'accounts' && failRegistry) throw new Error('rate limited');
    return realGet(key);
  };
  const first = await h.request(CRON_PATH, { method: 'POST' });
  assert.equal(first.status, 500);

  // The scheduler's retry must run, not be turned away as "skipped".
  failRegistry = false;
  const retry = await h.request(CRON_PATH, { method: 'POST' });
  assert.deepEqual(await retry.json(), { accounts: 1, ok: 1, failed: 0, missing: 0 });
}));


function rawRequest(port, line) {
  return new Promise((resolve) => {
    const socket = connect(port, '127.0.0.1', () => socket.write(`${line}\r\nHost: x\r\nConnection: close\r\n\r\n`));
    let data = '';
    socket.on('data', (chunk) => { data += chunk; });
    socket.on('close', () => resolve(data));
    socket.on('error', () => resolve(data));
  });
}

test('a malformed request line cannot crash the server in setup mode', async () => {
  const server = createServer(createSetupHandler(['SMTP_URL']));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const reply = await rawRequest(port, 'GET // HTTP/1.1');
    assert.match(reply, /^HTTP\/1\.1 503/);
    // Still serving afterwards: the process did not die.
    assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status, 503);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('a malformed request line gets a 404 from the configured server, not a 500', withHarness({}, async (h) => {
  const port = Number(new URL((await h.request('/health')).url).port);
  const reply = await rawRequest(port, 'GET // HTTP/1.1');
  assert.match(reply, /^HTTP\/1\.1 404/);
}));

const identity = (id, isAdmin, email) => () => ({
  api: async () => ({ data: { me: { id, is_admin: isAdmin, email, account: { id: 123 } } } }),
});

test('a second, non-admin user cannot take over an account\'s alerts', async () => {
  const store = memoryStore();
  const first = await harness({ secureStorage: store, makeClient: identity(1, false, 'owner@acme.example') });
  await first.request('/oauth/callback?code=a&state=fixed-state-value-abc', { headers: { cookie } });
  await first.close();

  const member = await harness({ secureStorage: store, makeClient: identity(2, false, 'member@elsewhere.example') });
  try {
    const res = await member.request('/oauth/callback?code=b&state=fixed-state-value-abc', { headers: { cookie } });
    assert.equal(res.status, 409);
    assert.equal(store.data.get(accountKey('123')).recipient, 'owner@acme.example', 'alerts still go to the owner');
  } finally {
    await member.close();
  }
});

test('the original installer can reinstall, and an admin can take over', async () => {
  const store = memoryStore();
  const run = async (client, code) => {
    const h = await harness({ secureStorage: store, makeClient: client });
    const res = await h.request(`/oauth/callback?code=${code}&state=fixed-state-value-abc`, { headers: { cookie } });
    await h.close();
    return res.status;
  };
  assert.equal(await run(identity(1, false, 'owner@acme.example'), 'a'), 200);
  assert.equal(await run(identity(1, false, 'owner@acme.example'), 'b'), 200, 'same user');
  assert.equal(await run(identity(9, true, 'admin@acme.example'), 'c'), 200, 'an admin, e.g. after the owner left');
  assert.equal(store.data.get(accountKey('123')).recipient, 'admin@acme.example');
});

test('an installer monday returns no id for cannot replace anyone', async () => {
  const store = memoryStore();
  const run = async (client) => {
    const h = await harness({ secureStorage: store, makeClient: client });
    const res = await h.request('/oauth/callback?code=x&state=fixed-state-value-abc', { headers: { cookie } });
    await h.close();
    return res.status;
  };
  assert.equal(await run(identity(null, false, 'first@acme.example')), 200);
  assert.equal(await run(identity(null, false, 'second@elsewhere.example')), 409, 'two missing ids are not the same person');
  assert.equal(store.data.get(accountKey('123')).recipient, 'first@acme.example');
});

test('under a flood, the one real run still checks every account', async () => {
  // Secure storage throttled as monday documents it: 7 requests a second. The
  // limiter runs on a virtual clock that the server's own back-off advances,
  // so a retry after the documented pause is seen by the limiter as later.
  let virtual = 0;
  let stamps = [];
  const inner = installed('1', '2', '3', '4', '5');
  const throttled = (fn) => async (...args) => {
    stamps = stamps.filter((t) => virtual - t < 1000);
    if (stamps.length >= 7) throw new Error('request limit exceeded');
    stamps.push(virtual);
    return fn(...args);
  };
  const store = { data: inner.data, get: throttled(inner.get.bind(inner)), set: throttled(inner.set.bind(inner)) };

  const h = await harness({ secureStorage: store, sleep: async (ms) => { virtual += ms; } });
  try {
    const bodies = await Promise.all(
      Array.from({ length: 40 }, async () => (await h.request(CRON_PATH, { method: 'POST' })).json()),
    );
    const ran = bodies.filter((b) => !b.skipped);
    assert.equal(ran.length, 1, 'exactly one run');
    assert.deepEqual(ran[0], { accounts: 5, ok: 5, failed: 0, missing: 0 });
  } finally {
    await h.close();
  }
});

test('health reports mail as one word and nothing more', withHarness({ mailStatus: () => 'failed' }, async (h) => {
  const res = await h.request('/health');
  assert.deepEqual(await res.json(), { ok: true, mail: 'failed' });
}));

test('addresses are masked so the edge cannot rewrite them', () => {
  assert.equal(maskEmail('sametatesen2@gmail.com'), 'sa…@gmail.com');
  assert.equal(maskEmail('a@b.co'), 'a…@b.co');
  assert.equal(maskEmail('<img src=x onerror=alert(1)>'), 'the address on your monday profile');
  assert.equal(maskEmail('@nolocal.com'), 'the address on your monday profile');
  assert.equal(maskEmail('trailing@'), 'the address on your monday profile');
});
