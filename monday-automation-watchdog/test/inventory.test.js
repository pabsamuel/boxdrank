import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInventory, searchInventory } from '../src/core/inventory.js';
import { hostBoardId, fetchAutomations, AUTOMATIONS_API_VERSION } from '../src/app/monday-source.js';

const boards = [{ id: '101', name: 'Client Projects' }, { id: '102', name: 'Sales Pipeline' }];
const automation = (over) => ({ id: '1', title: 'A', description: '', active: true, boardId: '101', createdAt: null, updatedAt: null, notice: '', ...over });

test('the inventory puts what needs attention first, and counts it', () => {
  const { rows, counts } = buildInventory([
    automation({ id: '1', title: 'Notify on done', active: true }),
    automation({ id: '2', title: 'Route leads', active: false, boardId: '102' }),
    automation({ id: '3', title: 'Slack digest', active: false, notice: 'This automation was deactivated' }),
    automation({ id: '4', title: 'Workspace flow', boardId: null }),
  ], boards);
  assert.deepEqual(rows.map((row) => row.id), ['3', '2', '1', '4']);
  assert.equal(rows[1].board, 'Sales Pipeline');
  assert.equal(rows[3].board, 'Not on a board');
  assert.deepEqual(counts, { total: 4, active: 2, off: 2, withNotice: 1, boards: 3 });
});

test('search matches every word, across title, board, notice and state, ignoring case and accents', () => {
  const { rows } = buildInventory([
    automation({ id: '1', title: 'Notify on done' }),
    automation({ id: '2', title: 'Route leads', active: false, boardId: '102' }),
    automation({ id: '3', title: 'Müşteri özeti', notice: 'Deactivated: owner left' }),
  ], boards);
  assert.deepEqual(searchInventory(rows, 'sales').map((row) => row.id), ['2']);
  assert.deepEqual(searchInventory(rows, 'off').map((row) => row.id), ['2']);
  assert.deepEqual(searchInventory(rows, 'musteri').map((row) => row.id), ['3']);
  assert.deepEqual(searchInventory(rows, 'client owner').map((row) => row.id), ['3']);
  assert.equal(searchInventory(rows, '  ').length, 3);
});

test('an unknown board id is shown as an id, never dropped', () => {
  const { rows } = buildInventory([automation({ boardId: '999' })], boards);
  assert.equal(rows[0].board, 'Board 999');
});

test('the host board is read from the plausible shapes and nothing else', () => {
  assert.equal(hostBoardId({ board_id: 5, type: 'board' }), '5');
  assert.equal(hostBoardId('{"boardId":"6"}'), '6');
  assert.equal(hostBoardId({ type: 'board', id: 7 }), '7');
  assert.equal(hostBoardId({ type: 'workspace', id: 8 }), null);
  assert.equal(hostBoardId('not json'), null);
  assert.equal(hostBoardId(null), null);
});

test('fetchAutomations pages through every account automation with the 2026-10 API', async () => {
  const calls = [];
  const monday = {
    async api(graphql, options) {
      calls.push(options);
      const page = options.variables.cursor === null
        ? { cursor: 'next', items: [{ id: 1, title: 'One', active: true, workflow_host_data: { board_id: 101 } }] }
        : { cursor: null, items: [{ id: 2, title: '', active: false, notice_message: 'Needs attention' }] };
      return { data: { board_automations: page } };
    },
  };
  const all = await fetchAutomations(monday);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((options) => options.apiVersion === AUTOMATIONS_API_VERSION && AUTOMATIONS_API_VERSION === '2026-10'));
  assert.deepEqual(all.map((a) => [a.id, a.title, a.active, a.boardId, a.notice]), [
    ['1', 'One', true, '101', ''],
    ['2', 'Untitled automation', false, null, 'Needs attention'],
  ]);
});
