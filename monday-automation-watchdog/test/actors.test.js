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
