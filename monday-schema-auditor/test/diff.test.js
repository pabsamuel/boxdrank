import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffBoard, diffBoards } from '../src/core/diff.js';

/** Builds a board from ["Title:type", ...] shorthand. */
const board = (id, name, columns) => ({
  id,
  name,
  columns: columns.map((spec, i) => {
    const [title, type] = spec.split(':');
    return { id: `${id}_c${i}`, title, type };
  }),
});

const REFERENCE = board('ref', 'Client Template', [
  'Owner:people',
  'Status:status',
  'Due date:date',
  'Budget:numbers',
]);

const kinds = (result) => result.findings.map((f) => f.kind);
const only = (result, kind) => result.findings.filter((f) => f.kind === kind);

test('an identical board produces no findings', () => {
  const result = diffBoard(REFERENCE, board('b1', 'Acme Corp', [
    'Owner:people',
    'Status:status',
    'Due date:date',
    'Budget:numbers',
  ]));
  assert.deepEqual(result.findings, []);
  assert.equal(result.boardName, 'Acme Corp');
});

test('a column present in the reference but absent is reported missing', () => {
  const result = diffBoard(REFERENCE, board('b2', 'Beta Ltd', [
    'Owner:people',
    'Status:status',
    'Due date:date',
  ]));
  const missing = only(result, 'missing');
  assert.equal(missing.length, 1);
  assert.equal(missing[0].referenceTitle, 'Budget');
  assert.equal(missing[0].severity, 'high');
});

test('a same-name column with a different type is a high-severity mismatch', () => {
  // The case the whole tool exists for: a dashboard summing Budget gets a
  // silently wrong total, with no error shown anywhere in monday.
  const result = diffBoard(REFERENCE, board('b3', 'Gamma GmbH', [
    'Owner:people',
    'Status:status',
    'Due date:date',
    'Budget:text',
  ]));
  const mismatches = only(result, 'type_mismatch');
  assert.equal(mismatches.length, 1);
  assert.equal(mismatches[0].boardType, 'text');
  assert.equal(mismatches[0].referenceType, 'numbers');
  assert.equal(mismatches[0].severity, 'high');
});

test('a cosmetic title difference is a variant, not a missing plus an extra', () => {
  const result = diffBoard(REFERENCE, board('b4', 'Delta SA', [
    'Owner:people',
    'Status:status',
    'Due Date:date',
    'Budget:numbers',
  ]));
  assert.deepEqual(kinds(result), ['title_variant']);
  assert.equal(only(result, 'title_variant')[0].referenceTitle, 'Due date');
});

test('a same-type column near the same position is reported as a rename', () => {
  const result = diffBoard(REFERENCE, board('b5', 'Epsilon Oy', [
    'Owner:people',
    'Stage:status',
    'Due date:date',
    'Budget:numbers',
  ]));
  const renamed = only(result, 'renamed');
  assert.equal(renamed.length, 1);
  assert.equal(renamed[0].referenceTitle, 'Status');
  assert.equal(renamed[0].columnTitle, 'Stage');
  assert.equal(renamed[0].severity, 'medium');
});

test('a renamed column that also changed type reports both problems', () => {
  // Two separate fixes for whoever picks this up, so two separate findings.
  const result = diffBoard(REFERENCE, board('b6', 'Zeta Inc', [
    'Owner:people',
    'Status:status',
    'Due date:date',
    'Cost:text',
  ]));
  assert.equal(only(result, 'renamed').length, 0, 'different type blocks a rename match');
  assert.equal(only(result, 'missing').length, 1);
  assert.equal(only(result, 'extra').length, 1);
});

test('a same-type rename beyond the position window is not guessed at', () => {
  // Conservative by design: a missed rename degrades into missing + extra,
  // which is noisy but true. A false rename actively misleads.
  const reference = board('ref2', 'Template', ['A:text', 'B:status', 'C:status', 'D:status', 'E:status', 'F:text']);
  const drifted = board('b7', 'Far', ['A:text', 'B:status', 'C:status', 'D:status', 'E:status', 'Renamed:text']);
  const result = diffBoard(reference, drifted);
  assert.equal(only(result, 'renamed').length, 1, 'position 5 to 5 is within the window');

  const farther = board('b8', 'Farther', ['Renamed:text', 'B:status', 'C:status', 'D:status', 'E:status', 'F:text']);
  const result2 = diffBoard(reference, farther);
  // "A" at 0 and "Renamed" at 0 match by position; "F" survives at index 5.
  assert.equal(only(result2, 'renamed')[0]?.referenceTitle, 'A');
});

test('a column not in the reference is low-severity extra', () => {
  const result = diffBoard(REFERENCE, board('b9', 'Eta AB', [
    'Owner:people',
    'Status:status',
    'Due date:date',
    'Budget:numbers',
    'Internal notes:long-text',
  ]));
  assert.deepEqual(kinds(result), ['extra']);
  assert.equal(only(result, 'extra')[0].severity, 'low');
});

test('reordered shared columns produce exactly one order finding', () => {
  const result = diffBoard(REFERENCE, board('b10', 'Theta Ltd', [
    'Budget:numbers',
    'Owner:people',
    'Status:status',
    'Due date:date',
  ]));
  assert.equal(only(result, 'order').length, 1, 'one per board, never one per column');
  assert.equal(only(result, 'missing').length, 0);
});

test('findings are sorted worst first', () => {
  const result = diffBoard(REFERENCE, board('b11', 'Iota Co', [
    'Owner:people',
    'Stage:status',
    'Due Date:date',
    'Budget:text',
    'Extra:text',
  ]));
  const ranks = result.findings.map((f) => f.severityRank);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
  assert.equal(result.findings[0].severity, 'high');
});

test('duplicate titles on one board each match a distinct reference column', () => {
  // monday permits two columns with the same title; neither may be double-matched.
  const reference = board('ref3', 'Dupes', ['Note:text', 'Note:text']);
  const result = diffBoard(reference, board('b12', 'Also dupes', ['Note:text', 'Note:text']));
  assert.deepEqual(result.findings, []);

  const oneShort = diffBoard(reference, board('b13', 'One short', ['Note:text']));
  assert.equal(only(oneShort, 'missing').length, 1);
  assert.equal(only(oneShort, 'extra').length, 0);
});

test('an empty board reports every reference column as missing', () => {
  const result = diffBoard(REFERENCE, board('b14', 'Empty', []));
  assert.equal(only(result, 'missing').length, 4);
});

test('an empty reference reports every column as extra', () => {
  const result = diffBoard(board('ref4', 'Empty ref', []), board('b15', 'Full', ['A:text', 'B:text']));
  assert.equal(only(result, 'extra').length, 2);
});

test('a board with a missing columns array is treated as empty, not crashed on', () => {
  // The API returns what it returns; a malformed board should not take the run down.
  const result = diffBoard(REFERENCE, { id: 'b16', name: 'Broken' });
  assert.equal(only(result, 'missing').length, 4);
});

test('diffBoards skips the reference board itself', () => {
  const other = board('b17', 'Other', ['Owner:people']);
  const results = diffBoards(REFERENCE, [REFERENCE, other]);
  assert.equal(results.length, 1);
  assert.equal(results[0].boardId, 'b17');
});

test('diffBoards returns clean boards with an empty findings array', () => {
  const clean = board('b18', 'Clean', ['Owner:people', 'Status:status', 'Due date:date', 'Budget:numbers']);
  const results = diffBoards(REFERENCE, [clean]);
  assert.equal(results.length, 1, 'clean boards are kept so counts stay honest');
  assert.deepEqual(results[0].findings, []);
});
