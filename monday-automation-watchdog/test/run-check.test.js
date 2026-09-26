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

test('every run is recorded, including ones that sent nothing', async () => {
  const storage = fakeStorage();
  await runCheck({
    monday: fakeMonday(NOW - 10 * 60_000), storage, mailer: fakeMailer(),
    accountId: 'acc1', recipient: 'a@b.c', now: NOW,
  });
  const log = storage.writes.find((write) => write.key === 'watchdog:runs:v1:acc1');
  assert.ok(log, 'a run log entry exists');
  assert.equal(log.value[0].at, NOW);
  assert.equal(log.value[0].sent, false);
  assert.equal(log.value[0].error, null);
});

test('a failed check is recorded too, so silence can be told apart from errors', async () => {
  // A job that stopped and a job that runs and keeps failing look identical
  // from outside and need completely different responses.
  const storage = fakeStorage();
  const broken = { api: async () => ({ errors: [{ message: 'Upstream exploded' }] }) };

  await assert.rejects(() => runCheck({
    monday: broken, storage, mailer: fakeMailer(),
    accountId: 'acc1', recipient: 'a@b.c', now: NOW,
  }));

  const log = storage.writes.find((write) => write.key === 'watchdog:runs:v1:acc1');
  assert.ok(log, 'the failure was still logged');
  assert.match(log.value[0].error, /Upstream exploded/);
  assert.equal(storage.writes.some((w) => w.key === 'watchdog:state:v1:acc1'), false, 'alert state untouched');
});

test('a run log that cannot be written does not take down a working check', async () => {
  // Losing a history entry is survivable. Losing an alert is not.
  const mailer = fakeMailer();
  const storage = {
    writes: [],
    async get(key) { if (key.startsWith('watchdog:runs')) throw new Error('storage down'); return null; },
    async set(key, value) { if (key.startsWith('watchdog:runs')) throw new Error('storage down'); this.writes.push({ key, value }); },
  };

  const result = await runCheck({
    monday: fakeMonday(NOW - 12 * HOUR), storage, mailer,
    accountId: 'acc1', recipient: 'a@b.c', now: NOW,
  });
  assert.equal(result.sent, true);
  assert.equal(mailer.sent.length, 1, 'the alert still went out');
});

test('run history accumulates across checks', async () => {
  const storage = fakeStorage();
  const args = { monday: fakeMonday(NOW - 10 * 60_000), storage, mailer: fakeMailer(), accountId: 'acc1', recipient: 'a@b.c' };
  await runCheck({ ...args, now: NOW });
  await runCheck({ ...args, now: NOW + HOUR });

  const last = [...storage.writes].reverse().find((write) => write.key === 'watchdog:runs:v1:acc1');
  assert.equal(last.value.length, 2);
  assert.equal(last.value[0].at, NOW + HOUR, 'newest first');
});

test('when the account people are known, only non-human actors are watched', async () => {
  // Watching people's manual edits would alert when someone goes on holiday.
  const HUMAN = '117040353';
  const BOT = '9001';
  const monday = {
    api: async (graphql) => {
      if (graphql.includes('users')) return { data: { users: [{ id: HUMAN, name: 'Samet' }] } };
      if (graphql.includes('activity_logs')) {
        const logs = [];
        for (const actor of [HUMAN, BOT]) {
          for (let i = 0; i < 30; i += 1) {
            logs.push({
              id: `${actor}-${i}`, event: 'change_column_value', entity: 'pulse', user_id: actor,
              created_at: new Date(NOW - 12 * HOUR - i * HOUR).toISOString(),
            });
          }
        }
        return { data: { boards: [{ activity_logs: logs }] } };
      }
      return { data: { boards: [{ id: 1, name: 'B' }] } };
    },
  };

  const mailer = fakeMailer();
  const result = await runCheck({
    monday, storage: fakeStorage(), mailer, accountId: 'acc1', recipient: 'a@b.c', now: NOW,
  });

  assert.equal(result.watched, 1, 'only the bot pattern is watched');
  assert.match(mailer.sent[0].text, /9001|Actor 9001/, 'and it is the bot that is reported');
  assert.ok(!mailer.sent[0].text.includes('Samet'), 'the human is not reported as a broken automation');
});

test('when the people cannot be established, everything stays watched', async () => {
  // Losing precision is the right direction for a watchdog; losing coverage is not.
  const monday = {
    api: async (graphql) => {
      if (graphql.includes('users')) return { errors: [{ message: 'Cannot query field "users"' }] };
      if (graphql.includes('activity_logs')) {
        const logs = [];
        for (const actor of ['1', '2']) {
          for (let i = 0; i < 30; i += 1) {
            logs.push({
              id: `${actor}-${i}`, event: 'change_column_value', entity: 'pulse', user_id: actor,
              created_at: new Date(NOW - 12 * HOUR - i * HOUR).toISOString(),
            });
          }
        }
        return { data: { boards: [{ activity_logs: logs }] } };
      }
      return { data: { boards: [{ id: 1, name: 'B' }] } };
    },
  };

  const result = await runCheck({
    monday, storage: fakeStorage(), mailer: fakeMailer(), accountId: 'acc1', recipient: 'a@b.c', now: NOW,
  });
  assert.equal(result.watched, 2, 'both patterns stay watched rather than being guessed at');
});
