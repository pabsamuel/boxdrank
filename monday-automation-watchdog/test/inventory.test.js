import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInventory, searchInventory } from '../src/core/inventory.js';
import { parseLegacyAutomations, fetchAutomations, AUTOMATIONS_API_VERSION } from '../src/app/monday-source.js';

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

test('older automations are read from the JSON monday returns, and nothing is guessed', () => {
  // The live answer on 28 Sep carried an id, a boardId and a title.
  const legacy = parseLegacyAutomations([
    { id: 186000595, boardId: 5104569213, title: 'When Status changes to Bitir move item to Group Title' },
    { id: 7, name: 'Named instead', is_active: false },
    { id: 8 },
    { title: 'no id' },
    'noise',
  ], '5104569213');
  assert.deepEqual(legacy.map((a) => [a.id, a.title, a.active, a.boardId, a.legacy]), [
    ['186000595', 'When Status changes to Bitir move item to Group Title', null, '5104569213', true],
    ['7', 'Named instead', false, '5104569213', true],
  ]);
  assert.deepEqual(parseLegacyAutomations('{"automations":[{"id":1,"title":"T","status":"inactive"}]}', '9')[0].active, false);
  assert.deepEqual(parseLegacyAutomations({ error: 'unavailable' }, '9'), []);
  assert.deepEqual(parseLegacyAutomations(null, '9'), []);
});

test('fetchAutomations asks board by board with the 2026-10 API, pages, and keeps older ones', async () => {
  const calls = [];
  const monday = {
    async api(graphql, options) {
      calls.push(options);
      const { boardId, cursor } = options.variables;
      if (boardId === 'broken') throw new Error('no access');
      if (boardId === '101' && cursor === null) {
        return { data: { board_automations: { cursor: 'next', items: [{ id: 1, title: 'One', active: true }], legacy_automations: [{ id: 99, boardId: 101, title: 'Old one' }] } } };
      }
      if (boardId === '101') {
        return { data: { board_automations: { cursor: null, items: [{ id: 2, title: '', active: false, notice_message: 'Needs attention' }], legacy_automations: [{ id: 99, boardId: 101, title: 'Old one' }] } } };
      }
      return { data: { board_automations: { cursor: null, items: [], legacy_automations: null } } };
    },
  };
  const { automations, failedBoards } = await fetchAutomations(monday, ['101', 'broken', '102']);
  assert.equal(failedBoards, 1);
  assert.ok(calls.every((options) => options.apiVersion === AUTOMATIONS_API_VERSION && AUTOMATIONS_API_VERSION === '2026-10'));
  assert.deepEqual(automations.map((a) => [a.id, a.title, a.active, a.boardId, a.notice, a.legacy]), [
    ['1', 'One', true, '101', '', false],
    ['99', 'Old one', null, '101', '', true],
    ['2', 'Untitled automation', false, '101', 'Needs attention', false],
  ]);
});
