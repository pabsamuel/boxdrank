import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCheck, stateKey } from '../src/server/run-check.js';

const HOUR = 3600_000;
const NOW = Date.UTC(2026, 8, 17, 11, 0, 0); // a Thursday

/** A fake monday SDK returning one board and a signal with the given last-fired time. */
const fakeMonday = (lastFiredAt, count = 30) => ({
  api: async (graphql) => {
    if (graphql.includes('activity_logs')) {
      const logs = Array.from({ length: count }, (_, i) => ({
        id: String(i),
        event: 'change_column_value',
        entity: 'pulse',
        user_id: 9001,
        created_at: new Date(lastFiredAt - (count - 1 - i) * HOUR).toISOString(),
      }));
      return { data: { boards: [{ activity_logs: logs }] } };
    }
    return { data: { boards: [{ id: 1, name: 'Client Projects' }] } };
  },
});

const fakeStorage = (initial = {}) => {
  const store = new Map(Object.entries(initial));
  return {
    writes: [],
    async get(key) { return store.get(key) ?? null; },
    async set(key, value) { store.set(key, value); this.writes.push({ key, value }); },
  };
};

const fakeMailer = () => ({ sent: [], async send(message) { this.sent.push(message); } });

test('a healthy account sends no mail but still records a run', async () => {
  const mailer = fakeMailer();
  const result = await runCheck({
    monday: fakeMonday(NOW - 10 * 60_000),
    storage: fakeStorage(),
    mailer,
    accountId: 'acc1',
    recipient: 'admin@example.com',
    now: NOW,
  });

  assert.equal(result.sent, false);
  assert.equal(mailer.sent.length, 0);
  assert.equal(result.counts.healthy, 1);
});

test('a stopped automation produces one email to the right recipient', async () => {
  const mailer = fakeMailer();
  const result = await runCheck({
    monday: fakeMonday(NOW - 12 * HOUR),
    storage: fakeStorage(),
    mailer,
    accountId: 'acc1',
    recipient: 'admin@example.com',
    now: NOW,
  });

  assert.equal(result.sent, true);
  assert.equal(mailer.sent.length, 1);
  assert.equal(mailer.sent[0].to, 'admin@example.com');
  assert.match(mailer.sent[0].subject, /1 monday automation has stopped/);
  assert.ok(mailer.sent[0].text.length > 0 && mailer.sent[0].html.length > 0);
});

test('running twice in a row sends once', async () => {
  const storage = fakeStorage();
  const mailer = fakeMailer();
  const args = { monday: fakeMonday(NOW - 12 * HOUR), storage, mailer, accountId: 'acc1', recipient: 'a@b.c' };

  await runCheck({ ...args, now: NOW });
  await runCheck({ ...args, now: NOW + HOUR });

  assert.equal(mailer.sent.length, 1, 'the second run is suppressed');
});

test('state is namespaced per account so two accounts cannot collide', async () => {
  const storage = fakeStorage();
  const mailer = fakeMailer();
  await runCheck({
    monday: fakeMonday(NOW - 12 * HOUR), storage, mailer,
    accountId: 'acc-42', recipient: 'a@b.c', now: NOW,
  });
  assert.equal(storage.writes[0].key, stateKey('acc-42'));
  assert.match(storage.writes[0].key, /^watchdog:state:v1:acc-42$/);
});

test('state is written only after the mail is accepted', async () => {
  // A write that lands while the send fails would record the alert as delivered
  // and swallow it. A watchdog that loses alerts is worse than none, because it
  // is trusted. Repeating an alert is survivable; losing one is not.
  const storage = fakeStorage();
  const failing = { sent: [], async send() { throw new Error('SMTP down'); } };

  await assert.rejects(
    () => runCheck({
      monday: fakeMonday(NOW - 12 * HOUR), storage, mailer: failing,
      accountId: 'acc1', recipient: 'a@b.c', now: NOW,
    }),
    /SMTP down/,
  );
  assert.equal(storage.writes.length, 0, 'nothing persisted, so the next run retries');
});

test('after a failed send the next run still alerts', async () => {
  const storage = fakeStorage();
  const failing = { async send() { throw new Error('SMTP down'); } };
  const working = fakeMailer();
  const args = { monday: fakeMonday(NOW - 12 * HOUR), storage, accountId: 'acc1', recipient: 'a@b.c' };

  await assert.rejects(() => runCheck({ ...args, mailer: failing, now: NOW }));
  await runCheck({ ...args, mailer: working, now: NOW + HOUR });

  assert.equal(working.sent.length, 1, 'the alert was not lost');
});

test('recovery after a reported breakage sends a second email', async () => {
  const storage = fakeStorage();
  const mailer = fakeMailer();

  await runCheck({
    monday: fakeMonday(NOW - 12 * HOUR), storage, mailer,
    accountId: 'acc1', recipient: 'a@b.c', now: NOW,
  });
  await runCheck({
    monday: fakeMonday(NOW + 24 * HOUR - 10 * 60_000), storage, mailer,
    accountId: 'acc1', recipient: 'a@b.c', now: NOW + 24 * HOUR,
  });

  assert.equal(mailer.sent.length, 2);
  assert.match(mailer.sent[1].subject, /running again/);
});

test('unreadable timestamps are reported back to the caller', async () => {
  const monday = {
    api: async (graphql) => {
      if (graphql.includes('activity_logs')) {
        return { data: { boards: [{ activity_logs: [{ id: '1', event: 'x', user_id: 1, created_at: 'nonsense' }] }] } };
      }
      return { data: { boards: [{ id: 1, name: 'B' }] } };
    },
  };
  const result = await runCheck({
    monday, storage: fakeStorage(), mailer: fakeMailer(),
    accountId: 'acc1', recipient: 'a@b.c', now: NOW,
  });
  assert.equal(result.unparsedTimestamps, 1);
});
