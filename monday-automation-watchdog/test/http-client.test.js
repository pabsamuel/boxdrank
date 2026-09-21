import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHttpClient, DEFAULT_ENDPOINT } from '../src/server/http-client.js';

const okResponse = (body) => ({ ok: true, status: 200, json: async () => body });

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

test('the endpoint can be overridden, because the default is unverified', async () => {
  let url;
  const client = createHttpClient({
    token: 't',
    endpoint: 'https://example.test/graphql',
    fetchImpl: async (u) => {
      url = u;
      return okResponse({});
    },
  });
  await client.api('query {}');
  assert.equal(url, 'https://example.test/graphql');
});

test('an HTTP failure reports the status and never echoes the body', async () => {
  // A response body could contain anything, including a reflected token. The
  // status is what the caller can act on.
  const client = createHttpClient({
    token: 'secret-token',
    fetchImpl: async () => ({ ok: false, status: 401, text: async () => 'token secret-token rejected' }),
  });

  await assert.rejects(() => client.api('query {}'), (error) => {
    assert.match(error.message, /HTTP 401/);
    assert.ok(!error.message.includes('secret-token'), 'the token must not reach the message');
    return true;
  });
});

test('a missing token fails loudly at construction', () => {
  assert.throws(() => createHttpClient({ token: '' }), /token is required/);
  assert.throws(() => createHttpClient({ token: 't', fetchImpl: null }), /fetch implementation/);
});
