import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planNotifications, subjectFor, REMINDER_AFTER_MS, MAX_LISTED } from '../src/core/alerts.js';
import { renderEmail } from '../src/core/email.js';

const DAY = 24 * 3600_000;
const NOW = Date.UTC(2026, 8, 20, 9, 0, 0);

const signal = (key, status, over = {}) => ({
  key,
  label: `${key} does a thing on Board A`,
  status,
  reason: 'Normally every 2 hr, but nothing for 9 hr of working time.',
  ...over,
});

test('a newly silent automation is reported once', () => {
  const plan = planNotifications([signal('a', 'silent')], {}, NOW);
  assert.equal(plan.newlySilent.length, 1);
  assert.equal(plan.shouldSend, true);
  assert.equal(plan.state.a.status, 'silent');
  assert.equal(plan.state.a.silentSince, NOW);
});

test('the same problem on the next run is suppressed', () => {
  // Mailing every run about a known breakage is nagging, and nagging earns a
  // filter rule that takes the next real alert with it.
  const first = planNotifications([signal('a', 'silent')], {}, NOW);
  const second = planNotifications([signal('a', 'silent')], first.state, NOW + 3600_000);

  assert.equal(second.newlySilent.length, 0);
  assert.equal(second.stillSilent.length, 0);
  assert.equal(second.shouldSend, false);
});

test('the reminder clock runs from the last thing actually sent', () => {
  // Suppressed runs must not reset it, or a reminder would never arrive.
  const first = planNotifications([signal('a', 'silent')], {}, NOW);
  let state = first.state;
  for (let hours = 1; hours <= 60; hours += 1) {
    state = planNotifications([signal('a', 'silent')], state, NOW + hours * 3600_000).state;
  }
  const due = planNotifications([signal('a', 'silent')], state, NOW + REMINDER_AFTER_MS);
  assert.equal(due.stillSilent.length, 1, 'a reminder is due three days after the first mail');
  assert.equal(due.stillSilent[0].silentForMs, REMINDER_AFTER_MS);
});

test('a still-broken automation is reminded about, not re-announced', () => {
  const first = planNotifications([signal('a', 'silent')], {}, NOW);
  const later = planNotifications([signal('a', 'silent')], first.state, NOW + REMINDER_AFTER_MS + DAY);
  assert.equal(later.newlySilent.length, 0);
  assert.equal(later.stillSilent.length, 1);
});

test('recovery is announced, and only to someone who was told it broke', () => {
  const broke = planNotifications([signal('a', 'silent')], {}, NOW);
  const fixed = planNotifications([signal('a', 'healthy')], broke.state, NOW + DAY);

  assert.equal(fixed.recovered.length, 1);
  assert.equal(fixed.recovered[0].wasSilentForMs, DAY);
  assert.equal(fixed.shouldSend, true);
  assert.equal(Object.keys(fixed.state).length, 0, 'recovered signals stop being tracked');
});

test('an automation that was never reported broken does not announce recovery', () => {
  const plan = planNotifications([signal('a', 'healthy')], {}, NOW);
  assert.equal(plan.recovered.length, 0);
  assert.equal(plan.shouldSend, false);
});

test('late never triggers an email', () => {
  // Escalating a nudge is crying wolf, and the product dies the first time.
  const plan = planNotifications([signal('a', 'late')], {}, NOW);
  assert.equal(plan.shouldSend, false);
  assert.deepEqual(plan.state, {});
});

test('dormant never triggers an email', () => {
  // Someone switched that off on purpose.
  const plan = planNotifications([signal('a', 'dormant')], {}, NOW);
  assert.equal(plan.shouldSend, false);
});

test('a signal that drops out of the results is pruned from stored state', () => {
  // Otherwise stored state grows forever as boards and automations come and go.
  const first = planNotifications([signal('a', 'silent'), signal('b', 'silent')], {}, NOW);
  assert.equal(Object.keys(first.state).length, 2);

  const second = planNotifications([signal('a', 'silent')], first.state, NOW + 3600_000);
  assert.deepEqual(Object.keys(second.state), ['a']);
});

test('a healthy run with no history sends nothing at all', () => {
  // A watchdog that mails "all fine" daily gets filtered, taking real alerts.
  const plan = planNotifications(
    [signal('a', 'healthy'), signal('b', 'late'), signal('c', 'dormant')],
    {},
    NOW,
  );
  assert.equal(plan.shouldSend, false);
});

test('subjects lead with the number, because previews get skimmed', () => {
  assert.equal(subjectFor({ newlySilent: [1], stillSilent: [], recovered: [] }), '1 monday automation has stopped');
  assert.equal(subjectFor({ newlySilent: [1, 2], stillSilent: [], recovered: [] }), '2 monday automations have stopped');
  assert.equal(subjectFor({ newlySilent: [], stillSilent: [1], recovered: [] }), '1 monday automation has stopped (still)');
  assert.equal(subjectFor({ newlySilent: [], stillSilent: [], recovered: [1] }), '1 monday automation is running again');
  assert.equal(subjectFor({ newlySilent: [], stillSilent: [], recovered: [] }), 'monday automations: nothing to report');
});

test('the email carries the whole message in its first line', () => {
  const plan = planNotifications([signal('a', 'silent')], {}, NOW);
  const { subject, text, html } = renderEmail(plan);
  assert.equal(text.split('\n')[0], subject);
  assert.match(text, /STOPPED/);
  assert.match(text, /does a thing on Board A/);
  assert.match(html, /<h1/);
});

test('email escapes names, which are user-controlled', () => {
  const nasty = signal('x', 'silent', { label: '<script>alert(1)</script> & "co"' });
  const { html, text } = renderEmail(planNotifications([nasty], {}, NOW));
  assert.ok(!html.includes('<script>'), 'no raw script tag survives');
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&amp;'));
  assert.ok(text.includes('<script>'), 'plain text is not HTML and needs no escaping');
});

test('one account-wide outage does not produce a wall of text', () => {
  const many = Array.from({ length: MAX_LISTED + 15 }, (_, i) => signal(`a${i}`, 'silent'));
  const plan = planNotifications(many, {}, NOW);
  const { subject, text } = renderEmail(plan);

  assert.match(subject, new RegExp(`^${MAX_LISTED + 15} monday automations have stopped`), 'the full count still leads');
  assert.match(text, /and 15 more/);
  assert.equal(text.split('•').length - 1, MAX_LISTED, 'only the detail is trimmed');
});

test('a mixed run reports breakages and recoveries in one email', () => {
  const broke = planNotifications([signal('a', 'silent'), signal('b', 'silent')], {}, NOW);
  const mixed = planNotifications([signal('a', 'healthy'), signal('b', 'silent'), signal('c', 'silent')], broke.state, NOW + DAY);

  assert.equal(mixed.recovered.length, 1);
  assert.equal(mixed.newlySilent.length, 1);
  const { text } = renderEmail(mixed);
  assert.match(text, /STOPPED/);
  assert.match(text, /RUNNING AGAIN/);
});
