import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInventory, searchInventory, filterInventory, boardsIn } from '../src/core/inventory.js';
import { boardNames } from '../src/core/legacy.js';
import { parseLegacyAutomations, fetchAutomations, fetchBoards, safeBoardUrl, AUTOMATIONS_API_VERSION } from '../src/app/monday-source.js';

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

// The answer monday gave for board 5104569213 in Samet's API playground on
// 28 Sep 2026 (API 2026-10), trimmed to the fields the code reads; the
// `note` is monday's own text.
const REAL_LEGACY = {
  note: 'These ARE automations on the user\'s board: always list and describe them for the user together with the other automations — never omit or hide them.',
  automations: [{
    id: 186000595, accountId: 36993937, userId: 117040353,
    config: { 0: { columnId: { boardId: 5104569213, columnId: 'status', columnType: 'color' }, statusColumnValue: { index: 1, invalid: false } }, 2: { groupId: 'group_title' } },
    recipeId: 101638437, RecipeModelId: 101638437, description: null, boardId: 5104569213,
    active: true, state: 'active', noticeMessage: null,
    configUpdatedAt: '2026-09-21T02:49:06.841Z', createdAt: '2026-09-21T02:48:12.763Z', updatedAt: '2026-09-21T02:49:07.425Z',
  }],
  recipes: {
    recipes: [],
    dynamicRecipes: [{
      id: 101638437,
      sentenceParts: [
        { nodeId: '0', sentencePartial: 'When {status,columnId} changes to {something,statusColumnValue}\n' },
        { sentencePartial: ' ' },
        { nodeId: '2', sentencePartial: 'move item to {group, groupId}' },
      ],
      sentence: 'When {status,columnId} changes to {something,statusColumnValue}\n   move item to {group, groupId}',
      parsedSentence: 'When status changes to something\n   move item to group',
    }],
  },
  apps: [{ id: 'monday', name: 'monday.com' }],
};

// The board's names, in the shape `api-reference/reference/status` documents.
const REAL_BOARD = {
  columns: [
    { id: 'name', title: 'Name', settings: {} },
    { id: 'status', title: 'Status', settings: { type: 'status', labels: [{ id: 0, label: 'Working on it', index: 0 }, { id: 1, label: 'Bitir', index: 1 }] } },
  ],
  groups: [{ id: 'topics', title: 'Group One' }, { id: 'group_title', title: 'Group Title' }],
};

test('an older automation in the real shape is kept, named from the board, with its state', () => {
  const [row] = parseLegacyAutomations(REAL_LEGACY, '5104569213', boardNames(REAL_BOARD));
  assert.deepEqual(row, {
    id: '186000595',
    title: 'When Status changes to Bitir move item to Group Title',
    description: '',
    active: true,
    boardId: '5104569213',
    userId: '117040353',
    createdAt: '2026-09-21T02:48:12.763Z',
    updatedAt: '2026-09-21T02:49:07.425Z',
    notice: '',
    legacy: true,
  });
});

test('without the board\'s names it falls back to monday\'s own sentence, never to nothing', () => {
  assert.equal(parseLegacyAutomations(REAL_LEGACY, '5104569213')[0].title, 'When status changes to something move item to group');
  // Names that do not match keep monday's word for that part only.
  const partial = boardNames({ columns: [{ id: 'status', title: 'Status', settings: { labels: [] } }], groups: [] });
  assert.equal(parseLegacyAutomations(REAL_LEGACY, '5104569213', partial)[0].title, 'When Status changes to something move item to group');
  // No recipe at all: still listed.
  const bare = { automations: [{ id: 5, boardId: 1, active: false, state: 'inactive' }] };
  assert.deepEqual(parseLegacyAutomations(bare, '1').map((row) => [row.id, row.title, row.active]), [['5', 'Untitled automation', false]]);
});

test('older automations in other shapes still parse, and junk is skipped', () => {
  const legacy = parseLegacyAutomations([
    { id: 7, name: 'Named instead', is_active: false },
    { id: 8, title: 'With a title', noticeMessage: 'Owner deactivated' },
    { title: 'no id' },
    'noise',
  ], '9');
  assert.deepEqual(legacy.map((a) => [a.id, a.title, a.active, a.notice]), [
    ['7', 'Named instead', false, ''],
    ['8', 'With a title', null, 'Owner deactivated'],
  ]);
  assert.equal(parseLegacyAutomations(JSON.stringify(REAL_LEGACY), '5104569213')[0].active, true);
  assert.deepEqual(parseLegacyAutomations({ error: 'unavailable' }, '9'), []);
  assert.deepEqual(parseLegacyAutomations(null, '9'), []);
});

test('the board\'s names are read only for boards with older automations, and their failure is not fatal', async () => {
  const asked = [];
  const monday = {
    async api(graphql, options) {
      const { boardId } = options.variables;
      if (graphql.includes('board_automations')) {
        // The same older automation, as if it lived on boards 1 and 3.
        const legacy = boardId === '1' || boardId === '3'
          ? { ...REAL_LEGACY, automations: [{ ...REAL_LEGACY.automations[0], id: Number(boardId), boardId: Number(boardId) }] }
          : null;
        return { data: { board_automations: { cursor: null, items: [{ id: Number(boardId) * 10, title: 'New one', active: true }], legacy_automations: legacy } } };
      }
      asked.push(boardId);
      assert.equal(options.apiVersion, AUTOMATIONS_API_VERSION);
      if (boardId === '3') throw new Error('no access to columns');
      return { data: { boards: [REAL_BOARD] } };
    },
  };
  const { automations, failedBoards } = await fetchAutomations(monday, ['1', '2', '3']);
  assert.deepEqual(asked, ['1', '3']);
  assert.equal(failedBoards, 0);
  assert.deepEqual(automations.filter((a) => a.legacy).map((a) => [a.boardId, a.title]), [
    ['1', 'When Status changes to Bitir move item to Group Title'],
    ['3', 'When status changes to something move item to group'],
  ]);
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

test('filters are exact states, and can narrow to one board', () => {
  const { rows } = buildInventory([
    automation({ id: '1', title: 'Office hours reminder', active: true }),
    automation({ id: '2', title: 'Route leads', active: false, boardId: '102' }),
    automation({ id: '3', title: 'Old mover', active: null, legacy: true }),
    automation({ id: '4', title: 'Broken sync', notice: 'Owner lost access', boardId: '102' }),
  ], boards);
  const ids = (list) => list.map((row) => row.id).sort();
  assert.deepEqual(ids(filterInventory(rows, { show: 'off' })), ['2']);
  // The search's "off" also finds "Office"; the filter does not.
  assert.deepEqual(ids(searchInventory(rows, 'off')), ['1', '2']);
  assert.deepEqual(ids(filterInventory(rows, { show: 'notice' })), ['4']);
  assert.deepEqual(ids(filterInventory(rows, { board: 'Sales Pipeline' })), ['2', '4']);
  assert.deepEqual(ids(filterInventory(rows, { show: 'off', board: 'Client Projects' })), []);
  assert.deepEqual(ids(filterInventory(rows)), ['1', '2', '3', '4']);
  assert.deepEqual(boardsIn(rows), ['Client Projects', 'Sales Pipeline']);
});

test('fetchAutomations stops before the next board when told to, and says how far it got', async () => {
  let calls = 0;
  const monday = {
    async api() {
      calls += 1;
      return { data: { board_automations: { cursor: null, items: [{ id: String(calls), title: `T${calls}`, active: true }], legacy_automations: null } } };
    },
  };
  const result = await fetchAutomations(monday, ['1', '2', '3'], undefined, () => calls >= 2);
  assert.equal(result.boardsRead, 2);
  assert.equal(result.automations.length, 2);
  assert.equal(result.failedBoards, 0);
});

test('only https monday.com board URLs are kept, so a link cannot lead elsewhere', () => {
  assert.equal(safeBoardUrl('https://acme.monday.com/boards/123'), 'https://acme.monday.com/boards/123');
  assert.equal(safeBoardUrl('https://monday.com/boards/1'), 'https://monday.com/boards/1');
  for (const bad of [
    'http://acme.monday.com/boards/1',
    'javascript:alert(1)',
    'https://evil.example/boards/1',
    'https://monday.com.evil.example/x',
    'https://notmonday.com/x',
    'https://user:pw@acme.monday.com/boards/1',
    '',
    null,
  ]) {
    assert.equal(safeBoardUrl(bad), null, String(bad));
  }
});

test('boards carry their checked URL, and rows carry their board\'s URL', async () => {
  const monday = {
    async api() {
      return { data: { boards: [
        { id: 101, name: 'Client Projects', url: 'https://acme.monday.com/boards/101' },
        { id: 102, name: 'Sales Pipeline', url: 'javascript:alert(1)' },
      ] } };
    },
  };
  const fetched = await fetchBoards(monday);
  assert.deepEqual(fetched.map((board) => board.url), ['https://acme.monday.com/boards/101', null]);
  const { rows } = buildInventory([automation({ id: '1' }), automation({ id: '2', boardId: '102' }), automation({ id: '3', boardId: null })], fetched);
  assert.deepEqual(rows.map((row) => [row.id, row.boardUrl]).sort(), [['1', 'https://acme.monday.com/boards/101'], ['2', null], ['3', null]]);
});
