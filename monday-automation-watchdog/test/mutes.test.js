import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMute, isMuteActive, pruneMutes, describeMute, MUTE_PRESETS } from '../src/core/mutes.js';
import { planNotifications } from '../src/core/alerts.js';
import { renderEmail } from '../src/core/email.js';

const DAY = 24 * 3600_000;
const NOW = Date.UTC(2026, 8, 20, 9, 0, 0);

const signal = (key, status) => ({
  key,
  label: `${key} does a thing on Board A`,
  status,
  reason: 'Normally every 2 hr, but nothing for 9 hr.',
  activeElapsedMs: 9 * 3600_000,
});

test('the longest offered mute is 90 days, not forever', () => {
  // Mute forever plus forget equals a watchdog that silently stops watching,
  // which is the exact failure this product exists to catch.
  const timed = MUTE_PRESETS.filter((preset) => preset.ms !== null);
  assert.ok(timed.length >= 3);
  assert.equal(Math.max(...timed.map((preset) => preset.ms)), 90 * DAY);
  assert.ok(!MUTE_PRESETS.some((preset) => /forever|permanent/i.test(preset.label)));
});

test('a timed mute expires on the clock', () => {
  const mute = createMute('1d', NOW);
  assert.equal(isMuteActive(mute, NOW + 23 * 3600_000, 'silent'), true);
  assert.equal(isMuteActive(mute, NOW + DAY + 1, 'silent'), false);
});

test('until-it-works-again is cleared by recovery, not by time', () => {
  const mute = createMute('until_recovered', NOW);
  assert.equal(isMuteActive(mute, NOW + 400 * DAY, 'silent'), true, 'time alone never clears it');
  assert.equal(isMuteActive(mute, NOW + 60_000, 'healthy'), false, 'recovery does');
});

test('a mute with no status stays active, which is the safe direction', () => {
  // A stale mute is noticed by a reader. An alert sent to someone who asked for
  // silence teaches them to filter the sender.
  assert.equal(isMuteActive(createMute('until_recovered', NOW), NOW + DAY, undefined), true);
});

test('createMute rejects an unknown duration rather than muting forever', () => {
  assert.throws(() => createMute('nonsense', NOW), /Unknown mute duration/);
});

test('pruneMutes drops lapsed records so state cannot grow without limit', () => {
  const mutes = { a: createMute('1d', NOW), b: createMute('1w', NOW) };
  const kept = pruneMutes(mutes, NOW + 2 * DAY, new Map([['a', 'silent'], ['b', 'silent']]));
  assert.deepEqual(Object.keys(kept), ['b']);
  assert.deepEqual(pruneMutes(undefined, NOW), {});
});

test('a muted breakage sends no email but is still counted', () => {
  const plan = planNotifications([signal('a', 'silent')], {}, NOW, { a: createMute('1w', NOW) });
  assert.equal(plan.shouldSend, false);
  assert.equal(plan.mutedCount, 1);
  assert.equal(plan.newlySilent.length, 0);
});

test('a mute silences the notification, not the state machine', () => {
  // When the mute lapses, the signal must alert — not be treated as already
  // reported and stay silent forever.
  const muted = planNotifications([signal('a', 'silent')], {}, NOW, { a: createMute('1d', NOW) });
  assert.equal(muted.shouldSend, false);

  const afterExpiry = planNotifications([signal('a', 'silent')], muted.state, NOW + 2 * DAY, muted.mutes);
  assert.equal(afterExpiry.shouldSend, true, 'it alerts once the mute lapses');
});

test('muting does not announce a recovery nobody asked about', () => {
  const broke = planNotifications([signal('a', 'silent')], {}, NOW);
  assert.equal(broke.shouldSend, true);

  const fixed = planNotifications([signal('a', 'healthy')], broke.state, NOW + DAY, { a: createMute('1w', NOW) });
  assert.equal(fixed.recovered.length, 0);
  assert.equal(fixed.shouldSend, false);
});

test('an until-recovered mute clears itself once the signal recovers', () => {
  const mutes = { a: createMute('until_recovered', NOW) };
  const plan = planNotifications([signal('a', 'healthy')], {}, NOW + DAY, mutes);
  assert.deepEqual(plan.mutes, {}, 'the mute is gone, so the next failure is announced');
});

test('the muted count rides on mail that was going out anyway', () => {
  // One line, so a blind spot cannot quietly become permanent.
  const plan = planNotifications(
    [signal('loud', 'silent'), signal('quiet', 'silent')],
    {},
    NOW,
    { quiet: createMute('1w', NOW) },
  );
  const { text, html } = renderEmail(plan);
  assert.equal(plan.mutedCount, 1);
  assert.match(text, /1 other automation is muted and not listed above/);
  assert.match(html, /1 other automation is muted/);
});

test('a muted count never causes an email on its own', () => {
  const plan = planNotifications([signal('a', 'silent')], {}, NOW, { a: createMute('1w', NOW) });
  assert.equal(plan.shouldSend, false, 'nothing actionable is unmuted');
});

test('describeMute reads as plain English', () => {
  assert.equal(describeMute(createMute('until_recovered', NOW), NOW), 'muted until it works again');
  assert.equal(describeMute(createMute('1w', NOW), NOW), 'muted for 7 more days');
  assert.equal(describeMute(createMute('1d', NOW), NOW + 23 * 3600_000), 'muted for 1 more hour');
  assert.equal(describeMute(createMute('1d', NOW), NOW + 2 * DAY), 'mute expired');
  assert.equal(describeMute(null, NOW), '');
});

test('a mute cannot outlive itself by faking a notification', () => {
  // The first version recorded notifiedAt while muted, so a muted signal looked
  // like one already reported. When the mute lapsed the reminder window
  // suppressed it for another three days — the mute quietly outliving itself,
  // which is the blind spot this whole feature exists not to create.
  const muted = planNotifications([signal('a', 'silent')], {}, NOW, { a: createMute('1d', NOW) });
  assert.equal(muted.state.a.notifiedAt, null, 'nothing was sent, so nothing was notified');

  const justAfter = planNotifications([signal('a', 'silent')], muted.state, NOW + DAY + 60_000, muted.mutes);
  assert.equal(justAfter.newlySilent.length, 1, 'announced as new the moment the mute lapses');
  assert.equal(justAfter.stillSilent.length, 0, 'not swallowed by the reminder window');
});

test('a mute applied after an alert keeps the reminder clock honest', () => {
  // The opposite direction: something already announced, then muted, then
  // unmuted must not re-announce as if brand new.
  const announced = planNotifications([signal('a', 'silent')], {}, NOW);
  assert.equal(announced.newlySilent.length, 1);

  const silencedRun = planNotifications([signal('a', 'silent')], announced.state, NOW + 3600_000, {
    a: createMute('1d', NOW + 3600_000),
  });
  assert.equal(silencedRun.state.a.notifiedAt, announced.state.a.notifiedAt, 'the original send time survives');

  const afterMute = planNotifications([signal('a', 'silent')], silencedRun.state, NOW + DAY + 2 * 3600_000, {});
  assert.equal(afterMute.newlySilent.length, 0, 'not re-announced as new');
  assert.equal(afterMute.stillSilent.length, 0, 'and not yet due a reminder either');
});
