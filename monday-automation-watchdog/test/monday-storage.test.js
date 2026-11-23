import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMondayStorage, MAX_KEY_LENGTH, RETENTION_TTL_SECONDS } from '../src/server/monday-storage.js';

/** Stands in for the SDK's Storage, which the real adapter builds on demand. */
function fakeStorage(responses = {}) {
  const calls = [];
  const factory = () => ({
    async get(key) {
      calls.push(['get', key]);
      return responses.get ?? { success: true, value: null };
    },
    async set(key, value) {
      calls.push(['set', key, value]);
      return responses.set ?? { success: true, version: 'v2' };
    },
  });
  return { calls, factory };
}

const build = (factory) => createMondayStorage({ token: 'account-access-token', storageFactory: factory });

test('it presents the same get/set interface runCheck already takes', async () => {
  const { calls, factory } = fakeStorage({ get: { success: true, value: { silentSince: 5 } } });
  const storage = build(factory);

  assert.deepEqual(await storage.get('watchdog:state:v1:acct'), { silentSince: 5 });
  await storage.set('watchdog:state:v1:acct', { silentSince: 6 });

  assert.deepEqual(calls, [
    ['get', 'watchdog:state:v1:acct'],
    ['set', 'watchdog:state:v1:acct', '{"silentSince":6}'],
  ]);
});

/** Behaves like the real service: whatever it is given, it keeps String(value). */
function stringStore() {
  const data = new Map();
  return () => ({
    async get(key) { return { success: true, value: data.get(key) }; },
    async set(key, value) { data.set(key, String(value)); return { success: true, version: '1' }; },
  });
}

test('objects survive a round trip through a store that keeps only strings', async () => {
  // Seen live on 9 Nov 2026: objects were stored as "[object Object]", so the
  // alert state and the run log were lost on every run.
  const storage = build(stringStore());
  const runs = [{ at: 2, watched: 3, silent: 1, sent: true }, { at: 1, watched: 3, silent: 0, sent: false }];
  await storage.set('watchdog:runs:v1:1', runs);
  await storage.set('watchdog:state:v1:1', { 'b:a:e': { silentSince: 5 } });

  assert.deepEqual(await storage.get('watchdog:runs:v1:1'), runs);
  assert.deepEqual(await storage.get('watchdog:state:v1:1'), { 'b:a:e': { silentSince: 5 } });
});

test('a value left by the old adapter reads as no state instead of breaking the check', async () => {
  for (const legacy of ['[object Object]', '[object Object],[,o,b,j,e,c,t, ,O,b,j,e,c,t,],,,[,,,o']) {
    const { factory } = fakeStorage({ get: { success: true, value: legacy } });
    assert.equal(await build(factory).get('k'), null);
  }
});

test('a missing key reads as no state, not as a failure', async () => {
  const { factory } = fakeStorage({ get: { success: true, value: undefined } });
  assert.equal(await build(factory).get('missing'), null);
});

test('a failed read is an error, never an empty state', async () => {
  // The SDK reports a miss as a successful call with no value, so a miss and a
  // failure look alike unless `success` is checked. Treating a failed read as
  // "no state" would re-announce every automation in the account as newly
  // broken -- the exact false alarm this product exists to avoid.
  const { factory } = fakeStorage({ get: { success: false, error: 'rate limited' } });
  await assert.rejects(() => build(factory).get('k'), /Reading watchdog state.*rate limited/);
});

test('a failed write is an error, so state is never silently lost', async () => {
  // runCheck persists state only after mail is accepted. If a swallowed write
  // let the run report success, the same alert would be sent again next time.
  const { factory } = fakeStorage({ set: { success: false, error: 'quota exceeded' } });
  await assert.rejects(() => build(factory).set('k', {}), /Writing watchdog state.*quota exceeded/);
});

test('a key longer than monday allows is refused rather than truncated', async () => {
  // FACT from the SDK docs: keys are capped at 256 characters. A silently
  // truncated key would collide two accounts' state, and a watchdog reporting
  // one account's automations to another is worse than one that does not run.
  const { factory } = fakeStorage();
  const storage = build(factory);
  const tooLong = `watchdog:state:v1:${'9'.repeat(MAX_KEY_LENGTH)}`;

  await assert.rejects(() => storage.get(tooLong), /monday allows 256/);
  await assert.rejects(() => storage.set(tooLong, {}), /monday allows 256/);
  await assert.doesNotReject(() => storage.get('x'.repeat(MAX_KEY_LENGTH)));
});

test('the storage client is built once and reused', async () => {
  let built = 0;
  const factory = () => {
    built += 1;
    return { async get() { return { success: true, value: null }; }, async set() { return { success: true }; } };
  };
  const storage = build(factory);
  await storage.get('a');
  await storage.set('b', {});
  assert.equal(built, 1);
});

test('every write expires within 10 days, so an uninstalled account\'s data deletes itself', async () => {
  // monday's review: End User Data must be deleted within 10 days of an
  // uninstall. The app cannot delete Storage then (the token is revoked), so
  // each write carries a ttl and the daily check keeps refreshing it.
  const options = [];
  const factory = () => ({
    async get() { return { success: true, value: null }; },
    async set(key, value, opts) { options.push(opts); return { success: true }; },
  });
  const storage = build(factory);
  await storage.set('watchdog:state:v1:1', {});
  await storage.set('watchdog:runs:v1:1', []);

  assert.equal(RETENTION_TTL_SECONDS, 9 * 24 * 3600);
  assert.ok(RETENTION_TTL_SECONDS < 10 * 24 * 3600, 'under the 10-day limit');
  assert.ok(RETENTION_TTL_SECONDS <= 30 * 24 * 3600, 'within monday\'s 30-day ttl cap');
  assert.deepEqual(options, [{ ttl: RETENTION_TTL_SECONDS }, { ttl: RETENTION_TTL_SECONDS }]);
});

test('a missing token fails loudly rather than reading nothing', () => {
  assert.throws(() => createMondayStorage({ token: '' }), /access token is required/);
});
