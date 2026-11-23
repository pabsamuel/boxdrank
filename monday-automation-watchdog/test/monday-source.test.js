import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseActivityTimestamp, fetchBoards, fetchActivity } from '../src/app/monday-source.js';

const TARGET = Date.UTC(2026, 8, 16, 9, 0, 0);

test('the real monday format parses to the right instant', () => {
  // Captured from a live developer account on 21 Sep 2026. monday returns
  // 17-digit values which are 100-nanosecond ticks — 10^-7 seconds, ten
  // thousand times a millisecond.
  //
  // This is the case the first implementation got wrong. It stepped by 1000
  // (seconds, milliseconds, microseconds, nanoseconds), and 10^-7 is not a
  // factor of 1000 from any of them, so it overshot and returned null for every
  // real entry. The app would have reported an empty account rather than a
  // wrong one: the safe direction, and still useless.
  assert.equal(
    new Date(parseActivityTimestamp('17899565625638124')).toISOString(),
    '2026-09-21T02:09:22.564Z',
  );
  assert.equal(
    new Date(parseActivityTimestamp('17899565599500530')).toISOString(),
    '2026-09-21T02:09:19.950Z',
  );
});

test('every plausible timestamp unit resolves to the same instant', () => {
  assert.equal(parseActivityTimestamp('2026-09-16T09:00:00Z'), TARGET, 'ISO 8601');
  assert.equal(parseActivityTimestamp(TARGET), TARGET, 'milliseconds');
  assert.equal(parseActivityTimestamp(Math.floor(TARGET / 1000)), TARGET, 'seconds');
  assert.equal(parseActivityTimestamp(TARGET * 1000), TARGET, 'microseconds');
  assert.equal(parseActivityTimestamp(TARGET * 10_000), TARGET, '100-nanosecond ticks');
  assert.equal(parseActivityTimestamp(TARGET * 1_000_000), TARGET, 'nanoseconds');
  assert.equal(parseActivityTimestamp(String(TARGET * 10_000)), TARGET, 'ticks as a string');
});

test('user_id arrives as a string and stays one', () => {
  // Confirmed against the live account: "user_id": "117040353".
  assert.equal(typeof '117040353', 'string');
});

test('unusable values return null rather than a confident wrong date', () => {
  assert.equal(parseActivityTimestamp(null), null);
  assert.equal(parseActivityTimestamp(undefined), null);
  assert.equal(parseActivityTimestamp(''), null);
  assert.equal(parseActivityTimestamp('not a date'), null);
  assert.equal(parseActivityTimestamp(-5), null);
  assert.equal(parseActivityTimestamp(NaN), null);
});

test('zero is rejected instead of becoming the year 2000', () => {
  // Regression: falling through to Date.parse turned "0" into 2000-01-01.
  assert.equal(parseActivityTimestamp(0), null);
  assert.equal(parseActivityTimestamp('0'), null);
});

const sdk = (handler) => ({ api: async (graphql, options) => handler(graphql, options?.variables ?? {}) });

test('fetchBoards pages until a short page', () => {
  const pages = [];
  const boards = (n, offset) => Array.from({ length: n }, (_, i) => ({ id: offset + i, name: `Board ${offset + i}` }));
  return fetchBoards(
    sdk((_q, vars) => {
      pages.push(vars.page);
      return { data: { boards: vars.page === 1 ? boards(100, 0) : boards(4, 100) } };
    }),
  ).then((result) => {
    assert.equal(result.length, 104);
    assert.deepEqual(pages, [1, 2]);
    assert.equal(typeof result[0].id, 'string');
  });
});

test('fetchActivity normalises entries and reports unreadable timestamps', async () => {
  // A quiet account and a parsing problem must not look the same.
  const logs = [
    { id: '1', event: 'status_change', entity: 'pulse', user_id: 77, created_at: String(TARGET * 1000) },
    { id: '2', event: 'create_pulse', entity: 'pulse', user_id: null, created_at: '2026-09-16T10:00:00Z' },
    { id: '3', event: 'broken', entity: 'pulse', user_id: 77, created_at: 'nonsense' },
  ];
  const { entries, unparsedTimestamps } = await fetchActivity(
    sdk(() => ({ data: { boards: [{ activity_logs: logs }] } })),
    ['b1'],
    TARGET - 86_400_000,
    TARGET + 86_400_000,
  );

  assert.equal(entries.length, 2);
  assert.equal(unparsedTimestamps, 1);
  assert.deepEqual(entries[0], { boardId: 'b1', actor: '77', event: 'status_change', entity: 'pulse', at: TARGET });
  assert.equal(entries[1].actor, null, 'a null user_id stays null rather than becoming "null"');
});

test('fetchActivity walks every requested board', async () => {
  const seen = [];
  await fetchActivity(
    sdk((_q, vars) => {
      seen.push(...vars.boardIds);
      assert.equal(vars.boardLimit, vars.boardIds.length, 'monday returns 25 boards unless told otherwise');
      return { data: { boards: vars.boardIds.map((id) => ({ id, activity_logs: [] })) } };
    }),
    ['b1', 'b2', 'b3'],
    TARGET - 1000,
    TARGET,
  );
  assert.deepEqual(seen, ['b1', 'b2', 'b3']);
});

// A fake monday holding `logsPerBoard[id]` entries per board, newest first,
// paged the way the activity_logs field pages. Timestamps are in monday's real
// 17-digit format (100-ns ticks), as DERSLER #27 requires of fixtures.
function fakeAccount(logsPerBoard, { ignorePage = false } = {}) {
  const calls = [];
  const monday = sdk((_q, vars) => {
    calls.push({ boardIds: [...vars.boardIds], page: vars.page });
    const page = ignorePage ? 1 : vars.page;
    return {
      data: {
        boards: vars.boardIds.slice(0, vars.boardLimit).map((id) => {
          const count = logsPerBoard[id] ?? 0;
          const first = (page - 1) * vars.limit;
          const logs = [];
          for (let i = first; i < Math.min(count, first + vars.limit); i += 1) {
            logs.push({
              id: `${id}-${i}`,
              event: 'update_column_value',
              entity: 'pulse',
              user_id: '-4',
              created_at: String((TARGET - i * 60_000) * 10_000),
            });
          }
          return { id, activity_logs: logs };
        }),
      },
    };
  });
  return { monday, calls };
}

test('a large account is read in batches, not one call per board (reviewer stall, 23 Nov 2026)', async () => {
  const logsPerBoard = {};
  const ids = [];
  for (let i = 0; i < 2000; i += 1) {
    const id = String(5_000_000_000 + i);
    ids.push(id);
    logsPerBoard[id] = i % 3; // most boards nearly quiet, as on a real account
  }
  logsPerBoard[ids[7]] = 250; // three pages
  logsPerBoard[ids[1500]] = 100; // exactly one full page: asks once more, gets nothing
  const { monday, calls } = fakeAccount(logsPerBoard);
  const progress = [];

  const result = await fetchActivity(monday, ids, TARGET - 60 * 86_400_000, TARGET, (n, read, total) =>
    progress.push([n, read, total]),
  );

  const expected = Object.values(logsPerBoard).reduce((a, b) => a + b, 0);
  assert.equal(result.entries.length, expected);
  assert.equal(result.boardsRead, 2000);
  assert.equal(result.complete, true);
  assert.equal(result.unparsedTimestamps, 0);
  // 80 batches of 25 for page 1, then page 2 for two boards, page 3 for one.
  assert.equal(calls.length, 82);
  assert.ok(calls.every((call) => call.boardIds.length <= 25));
  assert.deepEqual(progress.at(-1).slice(1), [2000, 2000]);
  assert.equal(new Date(result.entries[0].at).toISOString(), new Date(TARGET).toISOString());
});

test('if monday ignored the page argument, a busy board still ends instead of looping', async () => {
  const { monday, calls } = fakeAccount({ busy: 400 }, { ignorePage: true });
  const result = await fetchActivity(monday, ['busy'], 0, TARGET);
  assert.equal(result.entries.length, 100, 'the repeated page is not counted twice');
  assert.equal(calls.length, 2);
});

test('a deadline returns what was read, says so, and keeps every board newest-first', async () => {
  const ids = Array.from({ length: 100 }, (_, i) => `b${i}`);
  const { monday, calls } = fakeAccount(Object.fromEntries(ids.map((id) => [id, 2])));
  let budget = 2; // two queries allowed
  const result = await fetchActivity(monday, ids, 0, TARGET, undefined, () => budget-- <= 0);
  assert.equal(result.complete, false);
  assert.equal(result.boardsRead, 50);
  assert.equal(result.entries.length, 100);
  assert.equal(calls.length, 2);
});

test('a monday call that never answers becomes an error instead of an endless wait', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { API_TIMEOUT_MS } = await import('../src/app/monday-source.js');
  const hung = { api: () => new Promise(() => {}) };
  const pending = assert.rejects(() => fetchBoards(hung), /did not answer/);
  await Promise.resolve();
  await Promise.resolve();
  t.mock.timers.tick(API_TIMEOUT_MS + 1);
  await pending;
});

test('GraphQL errors are thrown with an explanation, not read as an empty account', async () => {
  const denied = sdk(() => ({ errors: [{ message: 'User unauthorized to perform action' }] }));
  await assert.rejects(() => fetchActivity(denied, ['b1'], 0, 1), (error) => {
    assert.match(error.message, /User unauthorized/);
    assert.match(error.message, /viewers/i);
    return true;
  });
  await assert.rejects(() => fetchBoards(denied), /admin or member/i);
});

test('a rate limit failure says to wait', async () => {
  const limited = sdk(() => ({ errors: [{ message: 'Complexity budget exhausted' }] }));
  await assert.rejects(() => fetchBoards(limited), /Wait a minute/);
});

test('an empty board list yields no entries rather than throwing', async () => {
  const { entries } = await fetchActivity(sdk(() => ({ data: { boards: [] } })), ['b1'], 0, 1);
  assert.deepEqual(entries, []);
});

test('fetchUsers returns the account people when the query works', async () => {
  const monday = sdk(() => ({ data: { users: [{ id: 117040353, name: 'Samet' }, { id: 5, name: 'Ayşe' }] } }));
  const { fetchUsers } = await import('../src/app/monday-source.js');
  const users = await fetchUsers(monday);
  assert.deepEqual(users, [
    { id: '117040353', name: 'Samet' },
    { id: '5', name: 'Ayşe' },
  ]);
});

test('fetchUsers returns null rather than throwing when the query is unavailable', async () => {
  // The field names here were written without being able to read the reference
  // page. Not knowing who the humans are must degrade to watching everything,
  // never to failing the run, so a wrong guess costs precision not correctness.
  const { fetchUsers } = await import('../src/app/monday-source.js');
  assert.equal(await fetchUsers(sdk(() => ({ errors: [{ message: 'Cannot query field "users"' }] }))), null);
  assert.equal(await fetchUsers(sdk(() => ({ data: { users: [] } }))), null);
  assert.equal(await fetchUsers(sdk(() => ({ data: {} }))), null);
  assert.equal(await fetchUsers(sdk(() => { throw new Error('network'); })), null);
});

test('a user name that could forge email structure is flattened', async () => {
  const { fetchUsers } = await import('../src/app/monday-source.js');
  const monday = sdk(() => ({ data: { users: [{ id: 1, name: 'Ops\nSTOPPED\nfake' }] } }));
  const [user] = await fetchUsers(monday);
  assert.equal(/[\r\n]/.test(user.name), false);
});

test('the activity query does not ask for the data field, where item names and values would be', async () => {
  const queries = [];
  const monday = {
    async api(graphql) {
      queries.push(graphql);
      return { data: { boards: [{ activity_logs: [] }] } };
    },
  };
  await fetchActivity(monday, ['1'], 0, 1000);
  assert.equal(queries.length, 1);
  const selection = queries[0].slice(queries[0].indexOf('activity_logs'));
  assert.doesNotMatch(selection, /\bdata\b/);
  assert.match(selection, /\bevent\b/);
});
