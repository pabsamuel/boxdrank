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
function fakeMonday({ onActivity } = {}) {
  const series = (actor, lastAt) =>
    Array.from({ length: 40 }, (_, i) => ({
      id: `${actor}-${i}`,
      event: 'create_update',
      entity: 'pulse',
      user_id: actor,
      created_at: new Date(lastAt - (39 - i) * HOUR).toISOString(),
    }));
  return {
    async api(graphql, { variables } = {}) {
      if (graphql.includes('activity_logs')) {
        onActivity?.(variables.boardId);
        if (variables.page > 1) return { data: { boards: [{ activity_logs: [] }] } };
        const logs = String(variables.boardId) === '1' ? series(9002, NOW - 72 * HOUR) : series(9003, NOW - HOUR / 2);
        return { data: { boards: [{ activity_logs: logs }] } };
      }
      if (graphql.includes('users')) return { data: { users: [{ id: '1', name: 'Ada' }, { id: '2', name: 'Bo' }] } };
      return { data: { boards: variables?.page > 1 ? [] : [{ id: '1', name: 'Client Projects' }, { id: '2', name: 'Sales Pipeline' }] } };
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
  const check = await checkForSidekick({ monday: fakeMonday({ onActivity: (id) => read.push(String(id)) }), boardName: '  sales   PIPELINE ', now: NOW });
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
  let clock = 0;
  const monday = fakeMonday({ onActivity: () => { clock += 5000; } });
  const check = await checkForSidekick({ monday, now: NOW, clock: () => clock, budgetMs: 4000 });
  const answer = sidekickAnswer(check, NOW);
  assert.equal(answer.checked_boards, 1);
  assert.match(answer.summary, /It had time to read 1 of 2 boards\. Name a board to check it fully/);
});

test('an account with nothing recurring says what it needs', () => {
  const answer = sidekickAnswer({ results: [], boardsChecked: 3, boardsInScope: 3, scopeNames: null }, NOW);
  assert.match(answer.summary, /needs about seven runs in 60 days/);
  assert.equal(answer.stopped_count, 0);
});
