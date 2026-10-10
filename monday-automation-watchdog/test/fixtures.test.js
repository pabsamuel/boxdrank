import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { watch, summarize } from '../src/core/watch.js';

const demo = JSON.parse(readFileSync(new URL('../fixtures/demo-activity.json', import.meta.url), 'utf8'));
const results = watch(demo.entries, demo.now, {
  actorNames: new Map(demo.actors.map((a) => [a.id, a.name])),
  boardNames: new Map(demo.boards.map((b) => [b.id, b.name])),
});
const byActor = (name) => results.find((r) => r.label.includes(name));

test('the demo shows a silent automation, a late one, and a dormant one', () => {
  // Guards the fixture as much as the engine. A demo that quietly stopped
  // producing a silent automation would make the product look like it does less.
  const summary = summarize(results);
  assert.equal(summary.counts.silent, 1);
  assert.equal(summary.counts.late, 1);
  assert.equal(summary.counts.dormant, 1);
  assert.ok(summary.counts.healthy >= 3);
  assert.equal(summary.shouldAlert, true, 'a silent automation must trigger mail');
});

test('the Slack notifier whose token expired is the one reported silent', () => {
  const slack = byActor('Slack Notifier');
  assert.equal(slack.status, 'silent');
  assert.match(slack.reason, /Normally every 3 hr/);
});

test('the overdue reminder is late rather than escalated', () => {
  const invoice = byActor('Invoice Reminder');
  assert.equal(invoice.status, 'late');
  assert.match(invoice.reason, /not yet an alarm/);
});

test('an automation switched off in August reads as dormant, not as an emergency', () => {
  assert.equal(byActor('Campaign Sync').status, 'dormant');
});

test('a signal too rare to have a rhythm is never watched at all', () => {
  // Watching it would mean permanently reporting "insufficient history", which
  // reads as a broken tool rather than as restraint.
  assert.equal(byActor('Quarterly Rollup'), undefined);
});

test('the silent one sorts above everything else', () => {
  assert.equal(results[0].status, 'silent');
});

test('restricting to automation actors excludes the human', () => {
  const automationsOnly = watch(demo.entries, demo.now, {
    automationActors: new Set(demo.automationActorIds),
    actorNames: new Map(demo.actors.map((a) => [a.id, a.name])),
  });
  assert.equal(automationsOnly.some((r) => r.label.includes('Ayşe')), false);
  assert.ok(automationsOnly.every((r) => r.isAutomation));
});

test('the fixture entries are shipped newest-first, as activity logs arrive', () => {
  // If the engine ever assumed sorted input, this fixture would catch it.
  const first = demo.entries[0].at;
  const last = demo.entries[demo.entries.length - 1].at;
  assert.ok(first > last, 'newest first');
});
