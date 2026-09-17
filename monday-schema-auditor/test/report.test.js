import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, rankBoards, toCsv } from '../src/core/report.js';

const result = (boardName, findings) => ({
  boardId: boardName.toLowerCase(),
  boardName,
  findings: findings.map((f) => ({ message: `${f.kind} on ${boardName}`, ...f })),
});

const HIGH = { kind: 'missing', severity: 'high' };
const MEDIUM = { kind: 'renamed', severity: 'medium' };
const LOW = { kind: 'extra', severity: 'low' };

test('summarize counts boards, findings, severities and kinds', () => {
  const summary = summarize([
    result('Alpha', [HIGH, LOW]),
    result('Beta', []),
    result('Gamma', [MEDIUM]),
  ]);
  assert.equal(summary.boardsCompared, 3);
  assert.equal(summary.boardsWithFindings, 2);
  assert.equal(summary.cleanBoards, 1);
  assert.equal(summary.totalFindings, 3);
  assert.deepEqual(summary.bySeverity, { high: 1, medium: 1, low: 1 });
  assert.deepEqual(summary.byKind, { missing: 1, extra: 1, renamed: 1 });
});

test('summarize reports zeroes rather than gaps for an empty run', () => {
  const summary = summarize([]);
  assert.equal(summary.totalFindings, 0);
  assert.equal(summary.cleanBoards, 0);
  assert.deepEqual(summary.bySeverity, { high: 0, medium: 0, low: 0 });
});

test('rankBoards puts the most high-severity boards first', () => {
  const ranked = rankBoards([
    result('Low only', [LOW]),
    result('Two high', [HIGH, HIGH]),
    result('One high', [HIGH]),
    result('Medium', [MEDIUM]),
  ]);
  assert.deepEqual(ranked.map((r) => r.boardName), ['Two high', 'One high', 'Medium', 'Low only']);
});

test('rankBoards breaks ties by name so reruns are stable', () => {
  // An admin re-running after a fix should see the list move only where
  // something actually changed.
  const ranked = rankBoards([result('Zulu', [HIGH]), result('Alpha', [HIGH])]);
  assert.deepEqual(ranked.map((r) => r.boardName), ['Alpha', 'Zulu']);
  assert.deepEqual(rankBoards([]).map((r) => r.boardName), []);
});

test('rankBoards does not mutate its input', () => {
  const input = [result('Zulu', [LOW]), result('Alpha', [HIGH])];
  rankBoards(input);
  assert.deepEqual(input.map((r) => r.boardName), ['Zulu', 'Alpha']);
});

test('toCsv emits a header plus one row per finding, omitting clean boards', () => {
  const csv = toCsv([result('Alpha', [HIGH]), result('Clean', [])], 'Template');
  const lines = csv.split('\r\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^reference_board,board,severity,finding,/);
  assert.match(lines[1], /^Template,Alpha,high,missing,/);
});

test('toCsv escapes quotes, commas and newlines', () => {
  const csv = toCsv(
    [result('Acme, Inc.', [{ kind: 'missing', severity: 'high', message: 'He said "hi"\nthen left', columnTitle: 'A,B' }])],
    'Ref',
  );
  assert.ok(csv.includes('"Acme, Inc."'), 'a comma forces quoting');
  assert.ok(csv.includes('"A,B"'));
  assert.ok(csv.includes('"He said ""hi""\nthen left"'), 'quotes double, newline stays inside the cell');
});

test('toCsv leaves absent optional fields empty rather than printing undefined', () => {
  const csv = toCsv([result('Alpha', [{ kind: 'order', severity: 'low', message: 'reordered' }])], 'Ref');
  assert.ok(!csv.includes('undefined'));
  assert.ok(csv.includes('Ref,Alpha,low,order,,,,,reordered'));
});
