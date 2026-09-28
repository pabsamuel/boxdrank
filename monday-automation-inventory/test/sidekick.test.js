import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findForSidekick, sidekickAnswer } from '../src/server/sidekick.js';
import { AUTOMATIONS_API_VERSION } from '../src/app/monday-source.js';

const NOW = Date.UTC(2026, 8, 28, 9, 30, 0);

/**
 * Two boards. "Client Projects" has a Slack automation that is on and an older
 * one; "Sales Pipeline" has one switched off, with a warning from monday.
 */
function fakeMonday({ onAutomations } = {}) {
  const byBoard = {
    1: {
      items: [{ id: '11', title: 'When an update is posted, notify #clients in Slack', active: true }],
      legacy_automations: [{ id: 91, boardId: 1, title: 'When status changes to Done move item to group Done' }],
    },
    2: {
      items: [{ id: '21', title: 'When a lead is created, assign an owner', active: false, notice_message: 'The owner of this automation was deactivated' }],
      legacy_automations: null,
    },
  };
  return {
    async api(graphql, { variables, apiVersion } = {}) {
      if (graphql.includes('board_automations')) {
        assert.equal(apiVersion, AUTOMATIONS_API_VERSION);
        onAutomations?.(variables.boardId);
        return { data: { board_automations: { cursor: null, ...byBoard[variables.boardId] } } };
      }
      return { data: { boards: variables?.page > 1 ? [] : [{ id: '1', name: 'Client Projects' }, { id: '2', name: 'Sales Pipeline' }] } };
    },
  };
}

test('with no search, every automation is listed, the flagged one first', async () => {
  const found = await findForSidekick({ monday: fakeMonday() });
  const answer = sidekickAnswer(found, NOW);
  assert.equal(answer.total_count, 3);
  assert.equal(answer.match_count, 3);
  assert.equal(answer.checked_boards, 2);
  assert.match(answer.summary, /listed 3 automations on 2 boards, as monday reported them at 2026-09-28 09:30 UTC/);
  const lines = answer.summary.split('\n');
  assert.match(lines[2], /^- When a lead is created, assign an owner \(board "Sales Pipeline", switched off; monday says: The owner of this automation was deactivated\)$/);
  // Older automations are described like any other, as monday's note asks.
  assert.match(answer.summary, /group Done \(board "Client Projects", monday does not say whether it is on\)/);
  assert.doesNotMatch(answer.summary, /older|legacy/i);
});

test('a search keeps only automations matching every word', async () => {
  const answer = sidekickAnswer(await findForSidekick({ monday: fakeMonday(), search: 'slack clients' }), NOW);
  assert.equal(answer.match_count, 1);
  assert.equal(answer.total_count, 3);
  assert.match(answer.summary, /1 matches "slack clients":\n- When an update is posted, notify #clients in Slack \(board "Client Projects", on\)/);
});

test('a search that finds nothing says so', async () => {
  const answer = sidekickAnswer(await findForSidekick({ monday: fakeMonday(), search: 'invoice' }), NOW);
  assert.equal(answer.match_count, 0);
  assert.match(answer.summary, /None of them match "invoice"\./);
});

test('a board name narrows the read to that board, matched as people type it', async () => {
  const read = [];
  const found = await findForSidekick({ monday: fakeMonday({ onAutomations: (id) => read.push(String(id)) }), boardName: '  sales   PIPELINE ' });
  assert.deepEqual(read, ['2']);
  const answer = sidekickAnswer(found, NOW);
  assert.match(answer.summary, /on the board "Sales Pipeline"/);
  assert.equal(answer.total_count, 1);
});

test('an unknown board name becomes a question, with similar names', async () => {
  const answer = sidekickAnswer(await findForSidekick({ monday: fakeMonday(), boardName: 'Sales board' }), NOW);
  assert.deepEqual(answer, {
    summary: 'Automation Inventory couldn\'t find a board named "Sales board". Boards with similar names: "Sales Pipeline".',
    match_count: 0,
    total_count: 0,
    checked_boards: 0,
  });
});

test('out of time, it answers with what it read and says so', async () => {
  let clock = 0;
  const monday = fakeMonday({ onAutomations: () => { clock += 5000; } });
  const answer = sidekickAnswer(await findForSidekick({ monday, clock: () => clock, budgetMs: 4000 }), NOW);
  assert.equal(answer.checked_boards, 1);
  assert.match(answer.summary, /It had time to read 1 of 2 boards\. Name a board to search it fully/);
});

test('names from monday cannot add lines to the answer', () => {
  const answer = sidekickAnswer({
    rows: [{ title: 'Evil\n- Fake line', board: 'B', active: true, legacy: false, notice: '' }],
    matches: [],
    search: '',
    boardsRead: 1,
    boardsInScope: 1,
    failedBoards: 0,
    scopeNames: null,
  }, NOW);
  assert.equal(answer.summary.split('\n').length, 3);
});
