import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupByFix } from '../src/core/actions.js';

const result = (boardName, findings) => ({ boardId: boardName, boardName, findings });
const f = (kind, severity, extra) => ({ kind, severity, severityRank: { high: 0, medium: 1, low: 2 }[severity], message: kind, ...extra });

test('the same missing column across boards collapses into one job', () => {
  // Twelve boards missing one column is one job, not twelve. This is the whole
  // reason the view exists.
  const groups = groupByFix([
    result('Alpha', [f('missing', 'high', { referenceTitle: 'Billable', referenceType: 'checkbox' })]),
    result('Beta', [f('missing', 'high', { referenceTitle: 'Billable', referenceType: 'checkbox' })]),
    result('Gamma', [f('missing', 'high', { referenceTitle: 'Billable', referenceType: 'checkbox' })]),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, 'Add "Billable" (checkbox)');
  assert.deepEqual(groups[0].boards, ['Alpha', 'Beta', 'Gamma']);
});

test('the same column missing with a different type is a different job', () => {
  const groups = groupByFix([
    result('Alpha', [f('missing', 'high', { referenceTitle: 'Budget', referenceType: 'numbers' })]),
    result('Beta', [f('missing', 'high', { referenceTitle: 'Budget', referenceType: 'text' })]),
  ]);
  assert.equal(groups.length, 2);
});

test('renames group on the reference title and keep every new name', () => {
  // Three boards each inventing a different name for Status is still one job,
  // but the names must survive or the fix is unactionable.
  const groups = groupByFix([
    result('Alpha', [f('renamed', 'medium', { referenceTitle: 'Status', columnTitle: 'Stage' })]),
    result('Beta', [f('renamed', 'medium', { referenceTitle: 'Status', columnTitle: 'Phase' })]),
    result('Gamma', [f('renamed', 'medium', { referenceTitle: 'Status', columnTitle: 'Stage' })]),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, 'Rename back to "Status"');
  assert.deepEqual(groups[0].variants, ['Phase', 'Stage'], 'deduplicated and sorted');
  assert.deepEqual(groups[0].boards, ['Alpha', 'Beta', 'Gamma']);
});

test('type mismatches record what the wrong types actually are', () => {
  const groups = groupByFix([
    result('Alpha', [f('type_mismatch', 'high', { referenceTitle: 'Budget', referenceType: 'numbers', boardType: 'text' })]),
    result('Beta', [f('type_mismatch', 'high', { referenceTitle: 'Budget', referenceType: 'numbers', boardType: 'formula' })]),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, 'Change "Budget" to numbers');
  assert.deepEqual(groups[0].variants, ['formula', 'text']);
});

test('order findings from many boards collapse into a single job', () => {
  const groups = groupByFix([
    result('Alpha', [f('order', 'low', {})]),
    result('Beta', [f('order', 'low', {})]),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].boards.length, 2);
});

test('jobs sort worst first, then by how many boards they touch', () => {
  const groups = groupByFix([
    result('A', [f('extra', 'low', { columnTitle: 'Notes' })]),
    result('B', [f('missing', 'high', { referenceTitle: 'One', referenceType: 'text' })]),
    result('C', [f('missing', 'high', { referenceTitle: 'Two', referenceType: 'text' })]),
    result('D', [f('missing', 'high', { referenceTitle: 'Two', referenceType: 'text' })]),
  ]);
  assert.deepEqual(
    groups.map((g) => g.label),
    ['Add "Two" (text)', 'Add "One" (text)', 'Review extra column "Notes"'],
  );
});

test('a board appearing twice in one group is only listed once', () => {
  const groups = groupByFix([
    result('Alpha', [
      f('extra', 'low', { columnTitle: 'Notes' }),
      f('extra', 'low', { columnTitle: 'Notes' }),
    ]),
  ]);
  assert.deepEqual(groups[0].boards, ['Alpha']);
});

test('an unknown finding kind still reaches the list', () => {
  // A future finding type must not vanish silently from the fix view.
  const groups = groupByFix([result('Alpha', [f('something_new', 'medium', { message: 'Unmapped thing' })])]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, 'Unmapped thing', 'falls back to the finding message');
  assert.deepEqual(groups[0].boards, ['Alpha']);
});

test('no findings produces no jobs', () => {
  assert.deepEqual(groupByFix([result('Clean', [])]), []);
  assert.deepEqual(groupByFix([]), []);
});
