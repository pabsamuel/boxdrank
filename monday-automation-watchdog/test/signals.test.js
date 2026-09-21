import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractSignals, MIN_OCCURRENCES } from '../src/core/signals.js';
import { watch, summarize } from '../src/core/watch.js';

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const WED = Date.UTC(2026, 8, 16, 9, 0, 0);

const entry = (at, over = {}) => ({ boardId: 'b1', actor: 'a1', event: 'status_change', entity: 'item', at, ...over });
const run = (count, step, end, over = {}) =>
  Array.from({ length: count }, (_, i) => entry(end - (count - 1 - i) * step, over));

test('entries sharing a signature become one signal', () => {
  const signals = extractSignals(run(10, HOUR, WED));
  assert.equal(signals.length, 1);
  assert.equal(signals[0].timestamps.length, 10);
});

test('the same recipe on two boards stays two signals', () => {
  // A recipe copied onto ten boards fails independently on each, and an alert
  // that cannot name the board is not actionable.
  const signals = extractSignals([...run(8, HOUR, WED), ...run(8, HOUR, WED, { boardId: 'b2' })]);
  assert.equal(signals.length, 2);
  assert.deepEqual(signals.map((s) => s.boardId).sort(), ['b1', 'b2']);
});

test('patterns too rare to have a rhythm are dropped', () => {
  assert.equal(extractSignals(run(MIN_OCCURRENCES - 1, HOUR, WED)).length, 0);
  assert.equal(extractSignals(run(MIN_OCCURRENCES, HOUR, WED)).length, 1);
});

test('entries without a usable timestamp are skipped, not poisoned into the stats', () => {
  // One NaN would silently corrupt every median downstream.
  const entries = [...run(8, HOUR, WED), entry(NaN), entry(undefined), { boardId: 'b1' }];
  const [signal] = extractSignals(entries);
  assert.equal(signal.timestamps.length, 8);
  assert.ok(signal.timestamps.every(Number.isFinite));
});

test('duplicate timestamps from paged requests collapse', () => {
  const base = run(8, HOUR, WED);
  const [signal] = extractSignals([...base, ...base.slice(0, 3)]);
  assert.equal(signal.timestamps.length, 8);
});

test('known automation actors can narrow what is watched', () => {
  const entries = [...run(8, HOUR, WED, { actor: 'bot' }), ...run(8, HOUR, WED, { actor: 'human' })];
  const signals = extractSignals(entries, { automationActors: new Set(['bot']) });
  assert.equal(signals.length, 1);
  assert.equal(signals[0].actor, 'bot');
  assert.equal(signals[0].isAutomation, true);
});

test('with no automation list, every repeating pattern is a candidate', () => {
  // The fallback that makes this work whether or not monday exposes which
  // actions an automation performed.
  const entries = [...run(8, HOUR, WED, { actor: 'bot' }), ...run(8, HOUR, WED, { actor: 'human' })];
  assert.equal(extractSignals(entries).length, 2);
});

test('labels name the board and actor rather than raw ids where known', () => {
  const [signal] = extractSignals(run(8, HOUR, WED), {
    actorNames: new Map([['a1', 'Status Bot']]),
    boardNames: new Map([['b1', 'Client Projects']]),
  });
  assert.equal(signal.label, 'Status Bot status change on Client Projects');
});

test('watch ranks the silent above the healthy', () => {
  const healthy = run(20, HOUR, WED, { boardId: 'ok' });
  const broken = run(20, HOUR, WED - 12 * HOUR, { boardId: 'broken' });
  const results = watch([...healthy, ...broken], WED + 10 * 60_000);

  assert.equal(results[0].boardId, 'broken');
  assert.equal(results[0].status, 'silent');
  assert.equal(results[1].status, 'healthy');
});

test('summarize only asks to send mail when something is actually silent', () => {
  // A watchdog that mails "all fine" each morning gets filtered into a folder
  // nobody reads, taking the real alerts with it.
  const healthy = watch(run(20, HOUR, WED), WED + 10 * 60_000);
  assert.equal(summarize(healthy).shouldAlert, false);

  const broken = watch(run(20, HOUR, WED - 12 * HOUR), WED);
  assert.equal(summarize(broken).shouldAlert, true);
  assert.equal(summarize(broken).counts.silent, 1);
});

test('summarize reports zeroes for every status rather than gaps', () => {
  const summary = summarize([]);
  assert.equal(summary.watched, 0);
  assert.equal(summary.counts.healthy, 0);
  assert.equal(summary.counts.silent, 0);
  assert.equal(summary.shouldAlert, false);
});

test('a dormant signal does not trigger an alert', () => {
  // Someone who switched an automation off last month does not want a daily
  // reminder about it.
  const results = watch(run(20, DAY, WED), WED + 45 * DAY);
  assert.equal(results[0].status, 'dormant');
  assert.equal(summarize(results).shouldAlert, false);
});

test('event names are rendered as prose, with a safe fallback', async () => {
  const { describeEvent } = await import('../src/core/event-labels.js');
  assert.equal(describeEvent('create_pulse'), 'creates an item');
  assert.equal(describeEvent('move_pulse_into_group'), 'moves an item between groups');
  // The event vocabulary was not fully verifiable, so anything unmapped must
  // still read as English rather than break or disappear.
  assert.equal(describeEvent('some_future_event'), 'some future event');
  assert.equal(describeEvent('someCamelEvent'), 'some camel event');
  assert.equal(describeEvent(null), 'does something');
  assert.equal(describeEvent(''), 'does something');
});

test('a monday automation is labelled as one rather than as "Actor -4"', () => {
  // Verified against a live account: automations write under a negative user_id.
  // "An automation moves an item between groups on Client Projects" reads
  // better at 8am than "Actor -4 ...".
  const entries = Array.from({ length: 8 }, (_, i) => ({
    boardId: 'b1', actor: '-4', event: 'move_pulse_from_group', entity: 'pulse', at: WED - i * HOUR,
  }));
  const [signal] = extractSignals(entries, { boardNames: new Map([['b1', 'Client Projects']]) });
  assert.match(signal.label, /^An automation /);
  assert.ok(!signal.label.includes('-4'));
});

test('an explicit actor name still wins over the generic automation label', () => {
  const entries = Array.from({ length: 8 }, (_, i) => ({
    boardId: 'b1', actor: '-4', event: 'create_update', entity: 'pulse', at: WED - i * HOUR,
  }));
  const [signal] = extractSignals(entries, { actorNames: new Map([['-4', 'Slack Notifier']]) });
  assert.match(signal.label, /^Slack Notifier /);
});
