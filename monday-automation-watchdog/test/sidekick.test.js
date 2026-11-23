import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkForSidekick, sidekickAnswer } from '../src/server/sidekick.js';

const HOUR = 3600_000;
const NOW = Date.UTC(2026, 8, 17, 11, 0, 0); // a Thursday

/**
 * Two boards. On "Client Projects" automation 9002 acted every hour and
 * stopped three days ago; on "Sales Pipeline" automation 9003 still acts
 * every hour. Users are people 1 and 2, so 9002 and 9003 are automations.
 */
function fakeMonday({ onActivity, quietBoards = 0 } = {}) {
  // monday's real activity-log timestamp: 17 digits of 100-ns ticks (DERSLER #27).
  const series = (actor, lastAt) =>
    Array.from({ length: 40 }, (_, i) => ({
      id: `${actor}-${i}`,
      event: 'create_update',
      entity: 'pulse',
      user_id: actor,
      created_at: String((lastAt - (39 - i) * HOUR) * 10_000),
    }));
  const boards = [{ id: '1', name: 'Client Projects' }, { id: '2', name: 'Sales Pipeline' }];
  for (let i = 0; i < quietBoards; i += 1) boards.push({ id: String(100 + i), name: `Quiet ${i}` });
  return {
    async api(graphql, { variables } = {}) {
      if (graphql.includes('activity_logs')) {
        onActivity?.(variables.boardIds);
        return {
          data: {
            boards: variables.boardIds.slice(0, variables.boardLimit).map((id) => {
              if (variables.page > 1) return { id, activity_logs: [] };
              if (String(id) === '1') return { id, activity_logs: series(9002, NOW - 72 * HOUR) };
              if (String(id) === '2') return { id, activity_logs: series(9003, NOW - HOUR / 2) };
              return { id, activity_logs: [] };
            }),
          },
        };
      }
      if (graphql.includes('users')) return { data: { users: [{ id: '1', name: 'Ada' }, { id: '2', name: 'Bo' }] } };
      return { data: { boards: variables?.page > 1 ? [] : boards } };
    },
  };
}

test('across every board, the stopped automation is named in words', async () => {
  const check = await checkForSidekick({ monday: fakeMonday(), now: NOW });
  const answer = sidekickAnswer(check, NOW);
  assert.equal(answer.stopped_count, 1);
  assert.equal(answer.checked_boards, 2);
  assert.match(answer.summary, /checked 2 boards against the last 60 days of activity, at 2026-09-17 11:00 UTC/);
  assert.match(answer.summary, /1 automation has stopped:\n- .*Client Projects: /);
  assert.match(answer.summary, /Automations page/);
  assert.doesNotMatch(answer.summary, /Sales Pipeline:/, 'the healthy one is not listed as stopped');
});

test('a board name narrows the read to that board, matched as people type it', async () => {
  const read = [];
  const check = await checkForSidekick({ monday: fakeMonday({ onActivity: (ids) => read.push(...ids.map(String)) }), boardName: '  sales   PIPELINE ', now: NOW });
  assert.deepEqual([...new Set(read)], ['2']);
  const answer = sidekickAnswer(check, NOW);
  assert.equal(answer.stopped_count, 0);
  assert.match(answer.summary, /the board "Sales Pipeline"/);
  assert.match(answer.summary, /None of the 1 recurring automations it watches has stopped/);
});

test('an unknown board name becomes a question, with similar names', async () => {
  const check = await checkForSidekick({ monday: fakeMonday(), boardName: 'Sales board', now: NOW });
  const answer = sidekickAnswer(check, NOW);
  assert.deepEqual(answer, {
    summary: 'Automation Watchdog couldn\'t find a board named "Sales board". Boards with similar names: "Sales Pipeline".',
    stopped_count: 0,
    checked_boards: 0,
  });
});

test('out of time, it answers with what it read and says so', async () => {
  // Boards are read 25 to a query, so the cut-off falls after the first batch.
  let clock = 0;
  const monday = fakeMonday({ quietBoards: 28, onActivity: () => { clock += 5000; } });
  const check = await checkForSidekick({ monday, now: NOW, clock: () => clock, budgetMs: 4000 });
  const answer = sidekickAnswer(check, NOW);
  assert.equal(answer.checked_boards, 25);
  assert.equal(answer.stopped_count, 1, 'the first batch held the stopped automation');
  assert.match(answer.summary, /It had time to read 25 of 30 boards\. Name a board to check it fully/);
});

test('an account with nothing recurring says what it needs', () => {
  const answer = sidekickAnswer({ results: [], boardsChecked: 3, boardsInScope: 3, scopeNames: null }, NOW);
  assert.match(answer.summary, /needs about seven runs in 60 days/);
  assert.equal(answer.stopped_count, 0);
});
