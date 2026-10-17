import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { connect } from 'node:net';
import { createAppHandler, createSetupHandler, verifyJwt, SIDEKICK_PATH } from '../src/server/app-server.js';

// Carried over from Automation Inventory's server tests (from Watchdog's): the
// JWT, audience, severity and setup-mode cases, over real HTTP with a fake
// monday client.

const SIGNING_SECRET = 'signing-secret-value-456';
const CLIENT_SECRET = 'client-secret-value-123';
const SHORT_TOKEN = 'short-lived-token-abc123';
const BASE_URL = 'https://unanswered.example';

function sign(payload, secret = SIGNING_SECRET, alg = 'HS256') {
  const head = Buffer.from(JSON.stringify({ alg, typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hash = { HS256: 'sha256', HS384: 'sha384', HS512: 'sha512' }[alg] ?? 'sha256';
  const signature = createHmac(hash, secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${signature}`;
}

const sidekickJwt = (overrides = {}, secret = SIGNING_SECRET) => sign({
  accountId: 123,
  userId: 7,
  aud: `${BASE_URL}${SIDEKICK_PATH}`,
  exp: 9_999_999_999,
  shortLivedToken: SHORT_TOKEN,
  ...overrides,
}, secret);

const NOW = 1_000_000_000_000;

/**
 * One update by user 7 with no reply, three days old, and a record of the
 * tokens used.
 */
const oneUpdate = (tokens = []) => (token) => ({
  async api(graphql) {
    tokens.push(token);
    if (graphql.includes('app_subscription')) return { data: { app_subscription: [] } };
    return { data: { updates: [{
      id: '1',
      body: '<p>Can you send the invoice?</p>',
      text_body: 'Can you send the invoice?',
      created_at: new Date(NOW - 3 * 86_400_000).toISOString(),
      creator_id: '7',
      creator: { id: '7', name: 'Samet' },
      item: { id: '100', name: 'Invoice March', url: 'https://acme.monday.com/boards/1/pulses/100', board: { id: '1', name: 'Client Projects' } },
      replies: [],
    }] } };
  },
});

async function harness(overrides = {}) {
  const logs = [];
  const deps = {
    config: { baseUrl: BASE_URL, signingSecret: SIGNING_SECRET },
    makeClient: oneUpdate(),
    now: () => NOW,
    log: (message) => logs.push(message),
    ...overrides,
  };
  const server = createServer(createAppHandler(deps));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    logs,
    port: server.address().port,
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

const sidekickCall = (h, token, fields = {}) => h.request(SIDEKICK_PATH, {
  method: 'POST',
  headers: { authorization: token, 'content-type': 'application/json' },
  body: JSON.stringify({ payload: { blockKind: 'action', inboundFieldValues: fields } }),
});

function rawRequest(port, line) {
  return new Promise((resolve) => {
    const socket = connect(port, '127.0.0.1', () => socket.write(`${line}\r\nHost: x\r\nConnection: close\r\n\r\n`));
    let data = '';
    socket.on('data', (chunk) => { data += chunk; });
    socket.on('close', () => resolve(data));
    socket.on('error', () => resolve(data));
  });
}

// ---- Sidekick tool -----------------------------------------------------------

test('the Sidekick tool answers with output fields, reading with the short-lived token', async () => {
  const tokens = [];
  const h = await harness({ makeClient: oneUpdate(tokens) });
  try {
    const res = await sidekickCall(h, sidekickJwt(), { scope: 'mine', days: 2, board_name: '' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(Object.keys(body.outputFields).sort(), ['checked_updates', 'summary', 'unanswered_count']);
    assert.equal(body.outputFields.unanswered_count, 1);
    assert.match(body.outputFields.summary, /- "Can you send the invoice\?", 3 days ago, on "Invoice March" \(board "Client Projects"\)/);
    assert.ok(tokens.length > 0 && tokens.every((token) => token === SHORT_TOKEN));
    assert.ok(!h.logs.join('\n').includes(SHORT_TOKEN));
    assert.ok(!/invoice|Samet/i.test(h.logs.join('\n')), 'names and text stay out of the log');
  } finally {
    await h.close();
  }
});

test('"mine" is the user in the JWT: for another user the same update is not theirs', withHarness({}, async (h) => {
  const other = await (await sidekickCall(h, sidekickJwt({ userId: 8 }), { scope: 'mine' })).json();
  assert.equal(other.outputFields.unanswered_count, 0);
  const all = await (await sidekickCall(h, sidekickJwt({ userId: 8 }), { scope: 'all' })).json();
  assert.equal(all.outputFields.unanswered_count, 1);
  assert.match(all.outputFields.summary, / by Samet, 3 days ago/);
  // A Text field sends the days as a string.
  const days = await (await sidekickCall(h, sidekickJwt(), { scope: 'mine', days: '5' })).json();
  assert.equal(days.outputFields.unanswered_count, 0);
}));

test('the Sidekick tool refuses a token signed with another secret, another audience, or no expiry', withHarness({}, async (h) => {
  // The client secret signs session tokens and lifecycle webhooks; the Sidekick
  // request must be the signing secret's.
  for (const token of [
    '',
    'not-a-jwt',
    sidekickJwt({}, CLIENT_SECRET),
    sidekickJwt({ aud: `https://elsewhere.example${SIDEKICK_PATH}` }),
    sidekickJwt({ aud: `${BASE_URL}/monday/sidekick/other` }),
    sidekickJwt({ exp: undefined }),
    sidekickJwt({ exp: 1 }),
    sidekickJwt({ shortLivedToken: '' }),
  ]) {
    const res = await sidekickCall(h, token);
    assert.equal(res.status, 401, token);
  }
}));

test('a failing read is a 4xx with severity 4000: logged by monday, not retried, not a fake success', withHarness({
  makeClient: () => ({ api: async () => { throw new Error(`HTTP 500 while holding ${SHORT_TOKEN}`); } }),
}, async (h) => {
  const res = await sidekickCall(h, sidekickJwt());
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.equal(body.severityCode, 4000);
  assert.match(body.runtimeErrorDescription, /could not read your updates just now/);
  assert.equal(body.outputFields, undefined);
  assert.ok(!h.logs.join('\n').includes(SHORT_TOKEN), 'the short-lived token is scrubbed from the log');
}));

test('with billing enforced, an account without a plan gets a 402 with severity 4000', withHarness({
  config: { baseUrl: BASE_URL, signingSecret: SIGNING_SECRET, billing: 'enforce' },
}, async (h) => {
  const res = await sidekickCall(h, sidekickJwt());
  assert.equal(res.status, 402);
  assert.equal((await res.json()).severityCode, 4000);
}));

test('with billing enforced, a failed billing query lets the answer through', withHarness({
  config: { baseUrl: BASE_URL, signingSecret: SIGNING_SECRET, billing: 'enforce' },
  makeClient: (token) => ({
    async api(graphql, options) {
      if (graphql.includes('app_subscription')) return { errors: [{ message: 'boom' }] };
      return oneUpdate()(token).api(graphql, options);
    },
  }),
}, async (h) => {
  assert.equal((await sidekickCall(h, sidekickJwt())).status, 200);
}));

test('a Sidekick token for another URL of this monday code service is accepted; another service is not', async () => {
  const live = 'https://live1-service-36993937-abcd1234.eu.monday.app';
  const h = await harness({ config: { baseUrl: live, signingSecret: SIGNING_SECRET } });
  try {
    const at = (host) => sidekickJwt({ aud: `https://${host}${SIDEKICK_PATH}` });
    assert.equal((await sidekickCall(h, at('live1-service-36993937-abcd1234.eu.monday.app'))).status, 200);
    assert.equal((await sidekickCall(h, at('e875f-service-36993937-abcd1234.eu.monday.app'))).status, 200);
    assert.equal((await sidekickCall(h, at('live1-service-11111111-deadbeef.eu.monday.app'))).status, 401);
    assert.equal((await sidekickCall(h, at(`evil.example/x-service-36993937-abcd1234.eu.monday.app`))).status, 401);
  } finally {
    await h.close();
  }
});

test('an oversized Sidekick body is refused', withHarness({}, async (h) => {
  const res = await h.request(SIDEKICK_PATH, {
    method: 'POST',
    headers: { authorization: sidekickJwt(), 'content-type': 'application/json' },
    body: JSON.stringify({ payload: { inboundFieldValues: { scope: 'x'.repeat(70 * 1024) } } }),
  });
  assert.equal(res.status, 413);
}));

// ---- routes and headers ------------------------------------------------------

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

test('a known route with the wrong method is 405', withHarness({}, async (h) => {
  assert.equal((await h.request(SIDEKICK_PATH)).status, 405);
  assert.equal((await h.request('/health', { method: 'POST' })).status, 405);
}));

test('every response carries HSTS, nosniff and no-referrer', withHarness({}, async (h) => {
  for (const [path, init] of [['/health'], ['/nope'], [SIDEKICK_PATH, { method: 'POST' }]]) {
    const res = await h.request(path, init);
    assert.equal(res.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains', path);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', path);
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer', path);
  }
}));

test('health says single words and nothing more', withHarness({}, async (h) => {
  assert.deepEqual(await (await h.request('/health')).json(), { ok: true, billing: 'off', sidekick: 'on' });
}));

test('the JWT check refuses none, public-key algorithms and tampering', () => {
  const now = 1_000;
  const good = sign({ exp: 2_000 });
  assert.ok(verifyJwt(good, SIGNING_SECRET, now));
  assert.ok(verifyJwt(`Bearer ${good}`, SIGNING_SECRET, now), 'a Bearer prefix is tolerated');
  assert.ok(verifyJwt(sign({}, SIGNING_SECRET, 'HS512'), SIGNING_SECRET, now));

  const [head, body] = good.split('.');
  const none = `${Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')}.${body}.`;
  assert.equal(verifyJwt(none, SIGNING_SECRET, now), null, 'alg none');
  const rs = `${Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url')}.${body}.${good.split('.')[2]}`;
  assert.equal(verifyJwt(rs, SIGNING_SECRET, now), null, 'RS256 with a shared secret');

  const tampered = `${head}.${Buffer.from(JSON.stringify({ exp: 2_000, accountId: 9 })).toString('base64url')}.${good.split('.')[2]}`;
  assert.equal(verifyJwt(tampered, SIGNING_SECRET, now), null, 'payload changed after signing');
  assert.equal(verifyJwt(good, SIGNING_SECRET, 3_000), null, 'expired');
  assert.equal(verifyJwt('a.b', SIGNING_SECRET, now), null);
});

test('misconfiguration fails at construction, not on the first request', () => {
  assert.throws(() => createAppHandler({ config: { baseUrl: BASE_URL }, makeClient: () => ({}) }), /signing secret/);
  assert.throws(() => createAppHandler({ config: { baseUrl: 'http://unanswered.example', signingSecret: 's' }, makeClient: () => ({}) }), /https/);
});

test('a malformed request line gets a 404, not a crash', withHarness({}, async (h) => {
  assert.match(await rawRequest(h.port, 'GET // HTTP/1.1'), /^HTTP\/1\.1 404/);
  assert.equal((await h.request('/health')).status, 200);
}));

// ---- setup mode --------------------------------------------------------------

test('before configuration the server names what is missing and serves the view', async () => {
  const server = createServer(
    createSetupHandler(['APP_BASE_URL', 'MONDAY_SIGNING_SECRET'], {
      '/view/': { type: 'text/html; charset=utf-8', body: '<p>view</p>' },
    }),
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 503);
    assert.deepEqual(await health.json(), { ok: false, error: 'setup incomplete', missing: ['APP_BASE_URL', 'MONDAY_SIGNING_SECRET'] });
    assert.equal(health.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains');
    // The board view authenticates in the browser, so it works before setup.
    assert.equal(await (await fetch(`${base}/view/`)).text(), '<p>view</p>');
    assert.equal((await fetch(`${base}${SIDEKICK_PATH}`, { method: 'POST' })).status, 503);
    assert.match(await rawRequest(server.address().port, 'GET // HTTP/1.1'), /^HTTP\/1\.1 503/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
