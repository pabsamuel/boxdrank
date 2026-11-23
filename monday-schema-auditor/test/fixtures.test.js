import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diffBoards } from '../src/core/diff.js';
import { summarize, rankBoards, toCsv } from '../src/core/report.js';
import { scoreBoards } from '../src/core/similarity.js';

const demo = JSON.parse(readFileSync(new URL('../fixtures/demo-boards.json', import.meta.url), 'utf8'));
const reference = demo.boards.find((b) => b.id === demo.referenceBoardId);

// Mirrors what the UI does: score every board, audit the suggested ones.
const scored = scoreBoards(reference, demo.boards);
const selected = scored.filter((entry) => entry.suggested).map((entry) => entry.board);
const results = diffBoards(reference, selected);
const byName = (name) => results.find((r) => r.boardName === name);
const kinds = (name) => byName(name).findings.map((f) => f.kind);

test('the demo fixture has a valid reference board', () => {
  assert.ok(reference, 'referenceBoardId must point at a board in the file');
  assert.ok(!results.some((r) => r.boardId === reference.id), 'the reference is excluded from its own report');
});

test('the demo includes boards the similarity filter should reject', () => {
  // Without these the demo would imply every account is one tidy template
  // family, which is the assumption that made the first version useless.
  const rejected = scored.filter((entry) => !entry.suggested).map((entry) => entry.board.name);
  assert.ok(rejected.includes('HR — Onboarding'), 'an unrelated board must be excluded');
  assert.ok(rejected.includes('Marketing content calendar'), 'a coincidentally-overlapping board must be excluded');
});

test('the fully translated board is excluded and stays visible for manual selection', () => {
  // Documented limitation: on names alone a translated template cannot be told
  // apart from an unrelated board. It must still appear in the list.
  const turkish = scored.find((entry) => entry.board.name === 'Yaşar İnşaat');
  assert.ok(turkish, 'the board is still listed, not dropped');
  assert.equal(turkish.suggested, false);
  assert.equal(turkish.score, 0);
});

test('the demo exercises every finding kind the engine can produce', () => {
  // Guards the fixture as much as the engine: a demo that silently stopped
  // showing type mismatches would make the tool look like it does less.
  const produced = new Set(results.flatMap((r) => r.findings.map((f) => f.kind)));
  for (const kind of ['type_mismatch', 'missing', 'renamed', 'title_variant', 'extra', 'order']) {
    assert.ok(produced.has(kind), `demo data should produce at least one ${kind}`);
  }
});

test('an untouched copy of the template is reported clean', () => {
  assert.deepEqual(byName('Acme Corp').findings, []);
});

test('Budget typed as text is caught as a high-severity mismatch', () => {
  const finding = byName('Northwind Trading').findings.find((f) => f.kind === 'type_mismatch');
  assert.equal(finding.severity, 'high');
  assert.equal(finding.referenceType, 'numbers');
  assert.equal(finding.boardType, 'text');
});

test('"Due Date" against "Due date" is a formatting variant, not a missing column', () => {
  assert.deepEqual(kinds('Globex'), ['title_variant']);
});

test('a translated board, once selected by hand, reports renames not missing columns', () => {
  // Turkish board names are the realistic case for this developer's own market.
  // The similarity filter excludes it by default, but once a user ticks it the
  // position-based rename pass is what keeps the output readable.
  const board = demo.boards.find((b) => b.name === 'Yaşar İnşaat');
  const [result] = diffBoards(reference, [board]);
  const turkish = result.findings.map((f) => f.kind);
  assert.equal(turkish.filter((k) => k === 'renamed').length, 5);
  assert.equal(turkish.filter((k) => k === 'missing').length, 0);
});

test('reordering alone produces a single low-severity finding', () => {
  assert.deepEqual(kinds('Soylent Foods'), ['order']);
});

test('the worst board sorts to the top and the clean one to the bottom', () => {
  const ranked = rankBoards(results).map((r) => r.boardName);
  assert.equal(ranked[0], 'Hooli', 'Hooli has the most high-severity findings');
  assert.equal(ranked.at(-1), 'Acme Corp', 'the clean board sorts last');
});

test('the summary counts add up', () => {
  const summary = summarize(results);
  assert.equal(summary.boardsCompared, selected.length);
  assert.equal(summary.cleanBoards, 1);
  assert.equal(summary.boardsWithFindings + summary.cleanBoards, summary.boardsCompared);
  assert.equal(
    Object.values(summary.bySeverity).reduce((a, b) => a + b, 0),
    summary.totalFindings,
  );
});

test('the CSV has one data row per finding and no undefined cells', () => {
  const csv = toCsv(results, reference.name);
  const rows = csv.split('\r\n');
  assert.equal(rows.length - 1, summarize(results).totalFindings);
  assert.ok(!csv.includes('undefined'));
});
