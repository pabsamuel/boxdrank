import { test } from 'node:test';
import assert from 'node:assert/strict';
import { similarity, scoreBoards, SIMILARITY_THRESHOLD } from '../src/core/similarity.js';

const board = (id, name, titles) => ({
  id,
  name,
  columns: titles.map((title, i) => ({ id: `${id}_${i}`, title, type: 'text' })),
});

const TEMPLATE = board('ref', 'Template', ['Owner', 'Status', 'Due date', 'Budget', 'Billable']);

test('an identical board scores 1', () => {
  assert.equal(similarity(TEMPLATE, board('a', 'Copy', ['Owner', 'Status', 'Due date', 'Budget', 'Billable'])), 1);
});

test('title formatting differences still count as matches', () => {
  // Must agree with how the report treats them, or a board would be excluded
  // from the audit for exactly the drift the audit exists to report.
  const variant = board('b', 'Variant', ['owner', 'STATUS', 'Due  Date', 'Budget', 'Billable']);
  assert.equal(similarity(TEMPLATE, variant), 1);
});

test('extra columns lower the score but keep it above the threshold', () => {
  const withExtras = board('c', 'Plus two', ['Owner', 'Status', 'Due date', 'Budget', 'Billable', 'Notes', 'Risk']);
  assert.equal(similarity(TEMPLATE, withExtras), 5 / 7);
  assert.ok(similarity(TEMPLATE, withExtras) >= SIMILARITY_THRESHOLD);
});

test('a board sharing only common column names scores low', () => {
  // Owner, Status and a date are the three names half of monday uses. Sharing
  // them is not evidence of a shared template.
  const unrelated = board('d', 'Marketing calendar', [
    'Owner', 'Status', 'Channel', 'Publish date', 'Copy', 'Asset link', 'Impressions', 'Campaign',
  ]);
  assert.ok(similarity(TEMPLATE, unrelated) < SIMILARITY_THRESHOLD);
});

test('matching column types with different names scores zero', () => {
  // The regression this file exists for. Reusing the diff engine's rename pass
  // scored an unrelated HR board 0.71 against a client template, because both
  // are people/date/status/checkbox shaped.
  const hr = board('e', 'HR onboarding', ['New hire', 'Start date', 'Equipment', 'Contract signed', 'Buddy']);
  assert.equal(similarity(TEMPLATE, hr), 0);
});

test('one board column cannot satisfy two reference columns', () => {
  const reference = board('ref2', 'Dupes', ['Note', 'Note']);
  assert.equal(similarity(reference, board('f', 'One note', ['Note'])), 1 / 2);
  assert.equal(similarity(reference, board('g', 'Two notes', ['Note', 'Note'])), 1);
});

test('an empty reference scores zero rather than dividing by zero', () => {
  assert.equal(similarity({ columns: [] }, TEMPLATE), 0);
  assert.equal(similarity({}, TEMPLATE), 0);
});

test('a board with no columns scores zero', () => {
  assert.equal(similarity(TEMPLATE, { columns: [] }), 0);
  assert.equal(similarity(TEMPLATE, {}), 0);
});

test('scoreBoards excludes the reference and sorts best first', () => {
  const scored = scoreBoards(TEMPLATE, [
    TEMPLATE,
    board('x', 'Unrelated', ['Nothing', 'In', 'Common']),
    board('y', 'Exact', ['Owner', 'Status', 'Due date', 'Budget', 'Billable']),
  ]);
  assert.deepEqual(scored.map((s) => s.board.name), ['Exact', 'Unrelated']);
  assert.equal(scored[0].suggested, true);
  assert.equal(scored[1].suggested, false);
});

test('scoreBoards returns rejected boards rather than dropping them', () => {
  // An audit tool that silently hides boards undermines the one thing it is for.
  const scored = scoreBoards(TEMPLATE, [board('z', 'Nothing alike', ['Alpha', 'Beta'])]);
  assert.equal(scored.length, 1);
  assert.equal(scored[0].suggested, false);
});

test('ties break by name so the list is stable between runs', () => {
  const scored = scoreBoards(TEMPLATE, [
    board('q', 'Zulu', ['Owner', 'Status', 'Due date', 'Budget', 'Billable']),
    board('p', 'Alpha', ['Owner', 'Status', 'Due date', 'Budget', 'Billable']),
  ]);
  assert.deepEqual(scored.map((s) => s.board.name), ['Alpha', 'Zulu']);
});
