import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { audit, validateSnapshot } from '../src/audit.js';
import { renderConsole, renderHtml } from '../src/report.js';

const snapshot = JSON.parse(
  readFileSync(new URL('../fixtures/demo-account.json', import.meta.url), 'utf8'),
);

/** Fixed clock: the fixture's dormancy figures are meaningless without one. */
const NOW = Date.parse('2026-09-17T12:00:00Z');

const report = audit(snapshot, { now: NOW });
const find = (rule) => report.findings.find((f) => f.rule === rule);

test('billable seats exclude guests, pending invites and deactivated users', () => {
  // 14 users; u8 deactivated, u12/u13 guests, u14 pending.
  assert.equal(report.totals.users, 14);
  assert.equal(report.totals.billableSeats, 10);
  assert.equal(report.totals.monthlySeatCostUsd, 160);
});

test('dormant seats are found and priced', () => {
  const f = find('dormant-seats');
  assert.ok(f, 'expected a dormant-seats finding');
  assert.equal(f.severity, 'high');
  assert.deepEqual(
    f.subjects.map((s) => s.id).sort(),
    ['u10', 'u4', 'u6', 'u7'],
  );
  assert.equal(f.monthlySavingsUsd, 64);
});

test('a user who never logged in is reported as never active', () => {
  const ravi = find('dormant-seats').subjects.find((s) => s.id === 'u10');
  assert.equal(ravi.note, 'never active');
});

test('dormant seats are listed longest-idle first', () => {
  const ids = find('dormant-seats').subjects.map((s) => s.id);
  assert.equal(ids[0], 'u10', 'never-active sorts above everyone');
  assert.equal(ids[1], 'u6', '120 days idle');
});

test('savings roll up to the report', () => {
  assert.equal(report.monthlySavingsUsd, 64);
  assert.equal(report.annualSavingsUsd, 768);
});

test('boards with no active owner are flagged', () => {
  const f = find('orphaned-boards');
  assert.deepEqual(f.subjects.map((s) => s.id).sort(), ['b10', 'b3']);
  assert.equal(f.subjects.find((s) => s.id === 'b10').note, 'no owner');
  assert.equal(f.subjects.find((s) => s.id === 'b3').note, 'all owners deactivated');
});

test('an archived board is never called orphaned', () => {
  assert.ok(!find('orphaned-boards').subjects.some((s) => s.id === 'b12'));
});

test('owner sprawl is flagged above the threshold, worst first', () => {
  const f = find('over-owned-boards');
  assert.deepEqual(f.subjects.map((s) => s.id), ['b1', 'b9']);
  assert.equal(f.subjects[0].note, '5 owners');
});

test('admin sprawl counts only enabled admins', () => {
  const f = find('admin-sprawl');
  assert.equal(f.subjects.length, 4);
  assert.ok(f.title.startsWith('4 account admins'));
});

test('over-shared guests are flagged, well-behaved ones are not', () => {
  const f = find('guest-exposure');
  assert.deepEqual(f.subjects.map((s) => s.id), ['u12']);
  assert.equal(f.subjects[0].note, 'reaches 6 boards');
});

test('stale boards need items and age, and must be active', () => {
  const ids = find('stale-boards').subjects.map((s) => s.id).sort();
  assert.deepEqual(ids, ['b10', 'b6']);
});

test('unaccepted invitations are reported without claiming savings', () => {
  const f = find('stale-pending-invites');
  assert.deepEqual(f.subjects.map((s) => s.id), ['u14']);
  assert.equal(f.monthlySavingsUsd, undefined);
  assert.equal(f.severity, 'low');
});

test('findings are ordered by severity', () => {
  const order = { high: 0, medium: 1, low: 2 };
  const seq = report.findings.map((f) => order[f.severity]);
  assert.deepEqual(seq, [...seq].sort((a, b) => a - b));
});

test('a clean account produces no findings and no savings', () => {
  const clean = {
    account: { name: 'Clean Co', seatPriceUsd: 16 },
    users: [
      { id: 'a', name: 'A', enabled: true, isGuest: false, isAdmin: true, isViewOnly: false, isPending: false, createdAt: '2026-01-01T00:00:00Z', lastActivity: '2026-09-16T00:00:00Z' },
    ],
    workspaces: [{ id: 'w', name: 'W', kind: 'open', memberIds: [] }],
    boards: [
      { id: 'b', name: 'B', workspaceId: 'w', state: 'active', boardKind: 'public', itemCount: 3, updatedAt: '2026-09-16T00:00:00Z', owners: ['a'], subscribers: [] },
    ],
  };
  const clean_report = audit(clean, { now: NOW });
  assert.deepEqual(clean_report.findings, []);
  assert.equal(clean_report.monthlySavingsUsd, 0);
});

test('thresholds are configurable', () => {
  const strict = audit(snapshot, { now: NOW, dormantDays: 5 });
  const relaxed = audit(snapshot, { now: NOW, dormantDays: 365 });

  const strictIds = strict.findings.find((f) => f.rule === 'dormant-seats').subjects;
  const relaxedIds = relaxed.findings.find((f) => f.rule === 'dormant-seats').subjects;

  assert.ok(strictIds.length > find('dormant-seats').subjects.length);
  // A user who has never logged in is dormant at any threshold, so the relaxed
  // run narrows to exactly that case rather than to nothing.
  assert.deepEqual(relaxedIds.map((s) => s.id), ['u10']);
});

test('a broken snapshot is rejected with a specific reason', () => {
  const broken = structuredClone(snapshot);
  broken.boards[0].workspaceId = 'nope';
  assert.throws(() => audit(broken, { now: NOW }), /unknown workspace nope/);

  assert.deepEqual(validateSnapshot({ account: { name: 'x' }, users: [], boards: [] }), [
    'workspaces must be an array',
  ]);
});

test('an unknown board owner is caught rather than silently ignored', () => {
  const broken = structuredClone(snapshot);
  broken.boards[0].owners = ['ghost'];
  assert.throws(() => audit(broken, { now: NOW }), /unknown owner ghost/);
});

test('the console report leads with the money', () => {
  const text = renderConsole(report);
  assert.match(text, /RECLAIMABLE: \$64\/month/);
  assert.match(text, /\$768\/year/);
  assert.match(text, /\[HIGH\]/);
});

test('the HTML report is self-contained and escapes its input', () => {
  const nasty = structuredClone(snapshot);
  nasty.account.name = '<script>alert(1)</script>';
  const html = renderHtml(audit(nasty, { now: NOW }));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.match(html, /&lt;script&gt;/);
  assert.ok(!html.includes('http://'), 'no external resources');
  assert.match(html, /prefers-color-scheme/, 'dark mode is handled');
});
