import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyActors } from '../src/core/actors.js';

const entry = (actor) => ({ actor });

test('actors that are not known people are treated as automations', () => {
  const { automationActors, humanActors, unknown } = classifyActors(
    [entry('117040353'), entry('9001'), entry('9002'), entry('117040353')],
    ['117040353'],
  );
  assert.deepEqual([...automationActors].sort(), ['9001', '9002']);
  assert.deepEqual([...humanActors], ['117040353']);
  assert.equal(unknown, false);
});

test('ids are compared as strings whichever way they arrive', () => {
  // monday returns user_id as a string in activity logs and can return numeric
  // ids elsewhere; a type mismatch here would classify every human as a robot.
  const { automationActors } = classifyActors([entry(117040353), entry('9001')], [117040353]);
  assert.deepEqual([...automationActors], ['9001']);
});

test('with no human list, nothing is classified and everything stays watched', () => {
  // Assuming every actor is an automation would start watching people's manual
  // edits and alerting when someone goes on holiday.
  const result = classifyActors([entry('1'), entry('2')], []);
  assert.equal(result.unknown, true);
  assert.equal(result.automationActors.size, 0);
});

test('a missing human list is the same as an empty one', () => {
  assert.equal(classifyActors([entry('1')], undefined).unknown, true);
  assert.equal(classifyActors([entry('1')], null).unknown, true);
});

test('entries without an actor are ignored rather than becoming an actor', () => {
  const { automationActors } = classifyActors([entry(null), entry(undefined), {}, entry('9001')], ['1']);
  assert.deepEqual([...automationActors], ['9001']);
});

test('an account where only people have acted finds no automations', () => {
  // The state of the captured developer account: one actor, who is the owner.
  const { automationActors, unknown } = classifyActors([entry('117040353')], ['117040353']);
  assert.equal(automationActors.size, 0);
  assert.equal(unknown, false);
});

test('an empty log is handled', () => {
  assert.equal(classifyActors([], ['1']).automationActors.size, 0);
  assert.equal(classifyActors(undefined, ['1']).automationActors.size, 0);
});

test('a negative user_id is an automation, verified against a live account', async () => {
  // On 21 Sep 2026 a real automation fired three times on a real board and
  // wrote every one of its actions under user_id "-4", while the person who
  // triggered it appeared as "117040353".
  const { isSystemActor } = await import('../src/core/actors.js');
  assert.equal(isSystemActor('-4'), true);
  assert.equal(isSystemActor(-4), true);
  assert.equal(isSystemActor('117040353'), false);
  assert.equal(isSystemActor('0'), false);
  assert.equal(isSystemActor(null), false);
  assert.equal(isSystemActor('not a number'), false);
});

test('any negative id counts, not just the one that was observed', () => {
  // -4 is certainly not the only internal actor monday uses, and a new one
  // appearing should be watched rather than ignored.
  const { automationActors } = classifyActors([entry('-4'), entry('-1'), entry('-99')], ['117040353']);
  assert.deepEqual([...automationActors].sort(), ['-1', '-4', '-99']);
});

test('automations are recognised even when the account people are unknown', () => {
  // This closes the gap the users query left. A negative id is proof on its
  // own, so the degraded path still watches exactly the right thing.
  const result = classifyActors([entry('-4'), entry('117040353')], []);
  assert.equal(result.unknown, false, 'no longer a total unknown');
  assert.deepEqual([...result.automationActors], ['-4']);
});

test('with neither people nor negative ids, everything stays watched', () => {
  const result = classifyActors([entry('1'), entry('2')], []);
  assert.equal(result.unknown, true);
  assert.equal(result.automationActors.size, 0);
});

test('an app with a positive id is watched alongside real automations', () => {
  // An installed integration can stop working just as quietly.
  const { automationActors, humanActors } = classifyActors(
    [entry('-4'), entry('117040353'), entry('55501')],
    ['117040353'],
  );
  assert.deepEqual([...automationActors].sort(), ['-4', '55501']);
  assert.deepEqual([...humanActors], ['117040353']);
});

test('the real captured response classifies exactly as expected', async () => {
  const { readFileSync } = await import('node:fs');
  const real = JSON.parse(
    readFileSync(new URL('../fixtures/real-automation-response.json', import.meta.url), 'utf8'),
  );
  const entries = real.data.boards[0].activity_logs.map((log) => ({ actor: log.user_id }));

  const { automationActors, humanActors } = classifyActors(entries, ['117040353']);
  assert.deepEqual([...automationActors], ['-4']);
  assert.deepEqual([...humanActors], ['117040353']);
});
