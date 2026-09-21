import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHttpClient, DEFAULT_ENDPOINT, REDACTED } from '../src/server/http-client.js';

/** A 200 carrying a JSON object, the way a cooperative monday would answer. */
const okResponse = (body) => ({
  ok: true,
  status: 200,
  headers: new Map([['content-type', 'application/json']]),
  text: async () => JSON.stringify(body),
});

/** A 200 carrying whatever text the server felt like sending. */
const rawResponse = (text, contentType = 'application/json') => ({
  ok: true,
  status: 200,
  headers: { get: () => contentType },
  text: async () => text,
});

test('the client sends the query and variables as monday expects', async () => {
  let seen;
  const client = createHttpClient({
    token: 'secret-token',
    fetchImpl: async (url, init) => {
      seen = { url, init };
      return okResponse({ data: { boards: [] } });
    },
  });

  await client.api('query { boards { id } }', { variables: { limit: 5 } });

  assert.equal(seen.url, DEFAULT_ENDPOINT);
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers.Authorization, 'secret-token');
  assert.deepEqual(JSON.parse(seen.init.body), {
    query: 'query { boards { id } }',
    variables: { limit: 5 },
  });
});

test('an API version is only sent when one is configured', async () => {
  let headers;
  const make = (apiVersion) =>
    createHttpClient({
      token: 't',
      apiVersion,
      fetchImpl: async (_url, init) => {
        headers = init.headers;
        return okResponse({});
      },
    });

  await make(undefined).api('query {}');
  assert.equal('API-Version' in headers, false);

  await make('2026-01').api('query {}');
  assert.equal(headers['API-Version'], '2026-01');
});

test('the endpoint can still be overridden, as long as it is monday over https', async () => {
  // The default is unverified, so the override has to survive. What it may not
  // do any more is point the token at an arbitrary host.
  let url;
  const client = createHttpClient({
    token: 'a-long-enough-token',
    endpoint: 'https://api-eu.monday.com/v2',
    fetchImpl: async (u) => {
      url = u;
      return okResponse({});
    },
  });
  await client.api('query {}');
  assert.equal(url, 'https://api-eu.monday.com/v2');
});

test('the token is never sent to a host that is not monday, or over plain http', () => {
  const build = (endpoint) => () => createHttpClient({ token: 'a-long-enough-token', endpoint, fetchImpl: async () => okResponse({}) });

  // The token is attached to the first request before any response is seen, so
  // a wrong endpoint is not recoverable. It fails closed at construction.
  assert.throws(build('https://collector.attacker.example/v2'), /Refusing to send/);
  assert.throws(build('http://api.monday.com/v2'), /Use https/);
  assert.throws(build('https://monday.com.attacker.example/v2'), /Refusing to send/);
  assert.throws(build('https://notmonday.com/v2'), /Refusing to send/);
  assert.throws(build('not a url'), /not a valid URL/);

  // And the escape hatch exists, because the CLI tests drive a local stub.
  assert.doesNotThrow(() =>
    createHttpClient({
      token: 'a-long-enough-token',
      endpoint: 'http://127.0.0.1:1234',
      allowInsecureEndpoint: true,
      fetchImpl: async () => okResponse({}),
    }),
  );
});

test('a token reflected in a 200 response never reaches the caller', async () => {
  // The non-2xx path refused to echo bodies from the start. GraphQL reports
  // errors in a 200, so that protection did not cover the case that matters:
  // the error message is read as data and travels on to stderr and to disk.
  // Reproduced against a stub that echoes the Authorization header back.
  const token = 'SEKRET_TOKEN_abc123XYZ';
  const client = createHttpClient({
    token,
    fetchImpl: async () => rawResponse(JSON.stringify({ errors: [{ message: `Bad token: ${token}` }] })),
  });

  const result = await client.api('query {}');
  const asText = JSON.stringify(result);
  assert.ok(!asText.includes(token), 'the token must not survive into the parsed response');
  assert.match(result.errors[0].message, new RegExp(REDACTED.replace(/[[\]]/g, '\\$&')));
});

test('the whole body is scrubbed, not only the fields read today', async () => {
  // Scrubbing just `errors[].message` would leave the next field that happens
  // to carry it. A board name is chosen by anyone who can share a board.
  const token = 'SEKRET_TOKEN_abc123XYZ';
  const client = createHttpClient({
    token,
    fetchImpl: async () => rawResponse(JSON.stringify({ data: { boards: [{ id: '1', name: `x ${token} y` }] } })),
  });

  const result = await client.api('query {}');
  assert.ok(!JSON.stringify(result).includes(token));
  assert.equal(result.data.boards[0].name, `x ${REDACTED} y`);
});

test('a short token is not used as a needle, because it would shred the response', async () => {
  // Redacting a two-character token would strip unrelated text out of every
  // response and corrupt it. No real monday token is this short.
  const client = createHttpClient({
    token: 'ab',
    allowInsecureEndpoint: true,
    fetchImpl: async () => rawResponse(JSON.stringify({ data: { boards: [{ name: 'abacus' }] } })),
  });
  const result = await client.api('query {}');
  assert.equal(result.data.boards[0].name, 'abacus');
});

test('a non-JSON 200 reports what it was, not what it said', async () => {
  // Node's JSON parse error quotes the first bytes of the input -- which is the
  // body this client refuses to echo. The content type is the diagnostic that
  // actually helps: it is how you learn the endpoint served a login page.
  const token = 'SEKRET_TOKEN_abc123XYZ';
  const client = createHttpClient({
    token,
    fetchImpl: async () => rawResponse(`<html>error for token ${token}</html>`, 'text/html'),
  });

  await assert.rejects(() => client.api('query {}'), (error) => {
    assert.ok(!error.message.includes(token), 'the token must not reach the message');
    assert.ok(!error.message.includes('<html>'), 'the body must not be echoed');
    assert.match(error.message, /non-JSON response/);
    assert.match(error.message, /text\/html/);
    return true;
  });
});

test('a GraphQL POST is never followed to a redirect', async () => {
  let init;
  const client = createHttpClient({
    token: 'a-long-enough-token',
    fetchImpl: async (_u, i) => {
      init = i;
      return okResponse({});
    },
  });
  await client.api('query {}');
  assert.equal(init.redirect, 'error');
});

test('an HTTP failure reports the status and never echoes the body', async () => {
  // A response body could contain anything, including a reflected token. The
  // status is what the caller can act on.
  const client = createHttpClient({
    token: 'secret-token-that-is-long',
    fetchImpl: async () => ({ ok: false, status: 401, text: async () => 'token secret-token-that-is-long rejected' }),
  });

  await assert.rejects(() => client.api('query {}'), (error) => {
    assert.match(error.message, /HTTP 401/);
    assert.ok(!error.message.includes('secret-token-that-is-long'), 'the token must not reach the message');
    return true;
  });
});

test('a missing token fails loudly at construction', () => {
  assert.throws(() => createHttpClient({ token: '' }), /token is required/);
  assert.throws(() => createHttpClient({ token: 't', fetchImpl: null }), /fetch implementation/);
});
