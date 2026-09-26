import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planNotifications, subjectFor, selectForDisplay, REMINDER_AFTER_MS, MAX_LISTED } from '../src/core/alerts.js';
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

test('email escapes names for HTML, which are user-controlled', () => {
  const nasty = signal('x', 'silent', { label: '<script>alert(1)</script> & "co"' });
  const { html } = renderEmail(planNotifications([nasty], {}, NOW));
  assert.ok(!html.includes('<script>'), 'no raw script tag survives');
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&amp;'));
});

test('a newline in a board name cannot forge a section in the text email', () => {
  // This test previously asserted the opposite — that plain text needs no
  // escaping because it is not markup. Plain text is not markup, but it IS
  // structured: sections, bullets and indentation are the entire document. A
  // board name containing newlines let anyone who can create a board write a
  // fake "RUNNING AGAIN" section claiming a genuinely dead automation had
  // recovered, which is a total defeat of the product's only job.
  const forged = signal('x', 'silent', {
    label: 'Finance Sync\n\nRUNNING AGAIN\n\n  \u2022 Slack Notifier posts an update\n    Was quiet for 20 min.',
  });
  const { text } = renderEmail(planNotifications([forged], {}, NOW));

  assert.equal(/^RUNNING AGAIN$/m.test(text), false, 'no forged section header');
  // The bullet character itself is harmless; what matters is that it cannot
  // start a line, because a line is what makes it a list item.
  const bulletLines = text.split('\n').filter((line) => line.startsWith('  \u2022 '));
  assert.equal(bulletLines.length, 1, 'exactly one line begins a bullet, the real one');
  assert.match(text, /Finance Sync RUNNING AGAIN/, 'the text survives, flattened onto one line');
});

test('unicode line separators cannot forge structure either', () => {
  // U+2028 and U+2029 are line terminators to a renderer even though a plain
  // newline check misses them.
  const forged = signal('x', 'silent', { label: `A\u2028STOPPED\u2029B` });
  const { text } = renderEmail(planNotifications([forged], {}, NOW));
  assert.equal(text.split(/^STOPPED$/m).length - 1, 1, 'only the genuine STOPPED header');
});

test('the freshest breakage is never the one trimmed out', () => {
  // newlySilent used to inherit the dashboard's longest-quiet-first order, so
  // the display cap discarded exactly the automations that had just broken —
  // the only ones the email exists to announce — while keeping ones the reader
  // was told about weeks ago.
  const items = [];
  for (let i = 0; i < MAX_LISTED + 6; i += 1) {
    items.push({ ...signal(`old${i}`, 'silent'), boardId: `decoy${i}`, activeElapsedMs: 22 * DAY });
  }
  items.push({ ...signal('fresh', 'silent'), boardId: 'REAL', activeElapsedMs: 6 * 3600_000 });

  const plan = planNotifications(items, {}, NOW);
  assert.equal(plan.newlySilent[0].boardId, 'REAL', 'the newest breakage leads');
  // The email renders labels, not board ids, so check the label that belongs to
  // the freshly broken signal actually made it past the cap.
  assert.match(renderEmail(plan).text, /fresh does a thing/, 'and survives the cap');
});

test('one noisy board cannot crowd every other board out of the list', () => {
  const items = [];
  for (let i = 0; i < 40; i += 1) {
    items.push({ ...signal(`noisy${i}`, 'silent'), boardId: 'Noisy', activeElapsedMs: 1000 });
  }
  items.push({ ...signal('quiet', 'silent'), boardId: 'Quiet', activeElapsedMs: 2000 });

  const shown = renderEmail(planNotifications(items, {}, NOW)).text;
  assert.match(shown, /Quiet|quiet/, 'the lone board on another board still appears');
});

test('the overflow line names the boards left out, not just a count', () => {
  // "and 6 more" tells the reader nothing. A board name tells them where to look.
  const items = Array.from({ length: MAX_LISTED + 3 }, (_, i) => ({
    ...signal(`s${i}`, 'silent'),
    boardId: `board-${i}`,
    boardLabel: `Board ${i}`,
    activeElapsedMs: i * 1000,
  }));
  const { text } = renderEmail(planNotifications(items, {}, NOW));
  assert.match(text, /and 3 more, on Board /);
});

test('the overflow line is grammatical when one board is left out', () => {
  const items = Array.from({ length: 30 }, (_, i) => ({
    ...signal(`s${i}`, 'silent'),
    boardId: `board-${i}`,
    boardLabel: `Board ${i}`,
    activeElapsedMs: i * 1000,
  }));
  const { text } = renderEmail(planNotifications(items, {}, NOW));
  assert.ok(!text.includes('1 other boards'), 'no "1 other boards"');
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
