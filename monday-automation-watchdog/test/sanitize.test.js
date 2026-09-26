import { test } from 'node:test';
import assert from 'node:assert/strict';
import { singleLine, MAX_NAME_LENGTH } from '../src/core/sanitize.js';
import { describeEvent } from '../src/core/event-labels.js';
import { selectForDisplay } from '../src/core/alerts.js';

const BREAKS = new RegExp('[\\u0000-\\u001f\\u007f\\u0085\\u2028\\u2029]');

test('singleLine removes every kind of line break', () => {
  for (const breaker of ['\n', '\r\n', ' ', ' ', '\u0085', '\u0000', '\u007f']) {
    const out = singleLine(`before${breaker}after`);
    assert.equal(BREAKS.test(out), false, `not neutralised: ${JSON.stringify(breaker)}`);
    assert.match(out, /before after/);
  }
});

test('singleLine collapses runs of whitespace and trims', () => {
  assert.equal(singleLine('  a   \t  b  '), 'a b');
});

test('singleLine caps length so one name cannot fill a screen', () => {
  const out = singleLine('x'.repeat(500));
  assert.equal(out.length, MAX_NAME_LENGTH);
  assert.ok(out.endsWith('…'));
  assert.equal(singleLine('short'), 'short', 'short names are untouched');
});

test('singleLine handles missing input', () => {
  assert.equal(singleLine(null), '');
  assert.equal(singleLine(undefined), '');
  assert.equal(singleLine(42), '42');
});

test('an event named after an Object member does not leak native code', () => {
  // A bare lookup returned the Object constructor, rendering the label as
  // "function Object() { [native code] }".
  assert.equal(describeEvent('constructor'), 'constructor');
  assert.equal(describeEvent('__proto__'), 'proto');
  assert.equal(describeEvent('toString'), 'to string');
});

test('an unmapped event name cannot carry a line break through', () => {
  assert.equal(BREAKS.test(describeEvent('x\nSTOPPED\ny')), false);
});

test('selectForDisplay returns everything when it fits', () => {
  const items = [{ boardId: 'a' }, { boardId: 'b' }];
  const result = selectForDisplay(items, 5);
  assert.deepEqual(result.shown, items);
  assert.equal(result.hiddenCount, 0);
});

test('selectForDisplay takes round-robin so one board cannot crowd out others', () => {
  const items = [
    ...Array.from({ length: 10 }, (_, i) => ({ boardId: 'noisy', n: i })),
    { boardId: 'quiet', n: 99 },
  ];
  const { shown } = selectForDisplay(items, 4);
  assert.equal(shown.length, 4);
  assert.ok(shown.some((item) => item.boardId === 'quiet'), 'the lone board gets a slot');
});

test('selectForDisplay preserves order within a board', () => {
  const items = Array.from({ length: 6 }, (_, i) => ({ boardId: 'one', n: i }));
  const { shown } = selectForDisplay(items, 3);
  assert.deepEqual(shown.map((item) => item.n), [0, 1, 2]);
});

test('selectForDisplay reports which boards were dropped', () => {
  const items = [
    { boardId: 'a', boardLabel: 'Alpha' },
    { boardId: 'b', boardLabel: 'Beta' },
    { boardId: 'c', boardLabel: 'Gamma' },
  ];
  const result = selectForDisplay(items, 1);
  assert.equal(result.hiddenCount, 2);
  assert.deepEqual(result.hiddenBoards.sort(), ['Beta', 'Gamma']);
});
