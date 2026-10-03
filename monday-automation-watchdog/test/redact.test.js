import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redact, secretsInUrl, REDACTED, MIN_REDACTABLE_LENGTH } from '../src/server/redact.js';

test('every occurrence of a secret is replaced', () => {
  assert.equal(redact('a TOKEN-value b TOKEN-value', ['TOKEN-value']), `a ${REDACTED} b ${REDACTED}`);
});

test('redacted JSON is still parseable', () => {
  // The API client scrubs response bodies before parsing them, so the marker
  // has to be legal inside a JSON string literal -- no quote, no backslash.
  const token = 'SEKRET_TOKEN_abc123XYZ';
  const body = JSON.stringify({ errors: [{ message: `Bad token: ${token}` }] });
  const parsed = JSON.parse(redact(body, [token]));
  assert.equal(parsed.errors[0].message, `Bad token: ${REDACTED}`);
});

test('a secret containing another leaves no fragment behind', () => {
  // An SMTP URL contains its own password. Replacing the password first would
  // leave the rest of the URL -- host, user, port -- sitting in the text.
  const password = 'p4ssword-long';
  const url = `smtps://apikey:${password}@smtp.example.com:465`;
  const redacted = redact(`failed for ${url}`, [password, url]);

  assert.ok(!redacted.includes(password));
  assert.ok(!redacted.includes('smtp.example.com'), 'the whole URL should go, not just the password');
  assert.equal(redacted, `failed for ${REDACTED}`);
});

test('a secret too short to be one is not used as a needle', () => {
  // A two-character needle would strip unrelated text out of every response and
  // corrupt the JSON it runs over.
  assert.equal(redact('abacus', ['ab']), 'abacus');
  const shortest = 'x'.repeat(MIN_REDACTABLE_LENGTH);
  assert.equal(redact(`a ${shortest} b`, [shortest]), `a ${REDACTED} b`);
});

test('non-strings and empty secret lists pass through untouched', () => {
  assert.equal(redact(undefined, ['a-long-secret']), undefined);
  assert.deepEqual(redact({ a: 1 }, ['a-long-secret']), { a: 1 });
  assert.equal(redact('unchanged', []), 'unchanged');
  assert.equal(redact('unchanged', [null, undefined, '']), 'unchanged');
});

test('a URL yields the whole string and its embedded credentials', () => {
  const secrets = secretsInUrl('smtps://user%40host:p%40ssword-long@smtp.example.com:465');

  // An error may quote the whole connection string, or only the password, or
  // only the user. Redacting the URL alone catches the first and misses the rest.
  assert.ok(secrets.some((s) => s.includes('smtp.example.com')));
  assert.ok(secrets.includes('p@ssword-long'), 'the decoded password');
  assert.ok(secrets.includes('p%40ssword-long'), 'and the encoded form as it appears in the URL');
});

test('a value that is not a URL is still treated as a secret', () => {
  // The safe reading of a value the operator put in a variable named for one.
  assert.deepEqual(secretsInUrl('just-a-long-password'), ['just-a-long-password']);
  assert.deepEqual(secretsInUrl(''), []);
  assert.deepEqual(secretsInUrl(undefined), []);
});
