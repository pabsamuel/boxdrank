/**
 * Silencing a signal without going blind to it.
 *
 * A mute button is not optional in a monitoring product: one automation nobody
 * intends to fix will otherwise poison every future alert until the whole thing
 * is filtered away. But mute is also the most dangerous feature here, because
 * the obvious implementation — mute forever, hide it — turns the watchdog into
 * something that silently stops watching. That is the exact failure this product
 * exists to catch, and it would be self-inflicted.
 *
 * So three rules hold throughout:
 *
 *  1. **Mutes expire by default.** Time-boxed is the normal case; indefinite is
 *     possible but is never the easy path and is never invisible.
 *  2. **Mute suppresses the email, never the dashboard.** A muted signal still
 *     appears, marked as muted. Silencing a notification is not the same as
 *     deleting the information.
 *  3. **Muted signals are counted in every email that goes out anyway.** One
 *     line, so a blind spot cannot quietly become permanent.
 */

const DAY = 24 * 3600_000;

/** Offered durations. The longest is 90 days, not "forever", on purpose. */
export const MUTE_PRESETS = [
  { id: '1d', label: 'for a day', ms: DAY },
  { id: '1w', label: 'for a week', ms: 7 * DAY },
  { id: '90d', label: 'for 90 days', ms: 90 * DAY },
  { id: 'until_recovered', label: 'until it works again', ms: null },
];

/**
 * @typedef {{ mode: 'until'|'until_recovered', until: number|null, mutedAt: number }} Mute
 * @typedef {Record<string, Mute>} MuteMap
 */

/**
 * Builds a mute record.
 *
 * `until_recovered` is the "I know, I am fixing it" case: stay quiet about this
 * one until it starts working, then forget the mute so the *next* failure is
 * announced normally. Without it people reach for an indefinite mute to cover a
 * problem they are actively fixing, and then never remove it.
 *
 * @param {string} presetId
 * @param {number} now
 * @returns {Mute}
 */
export function createMute(presetId, now) {
  const preset = MUTE_PRESETS.find((option) => option.id === presetId);
  if (!preset) throw new Error(`Unknown mute duration: ${presetId}`);

  return preset.ms === null
    ? { mode: 'until_recovered', until: null, mutedAt: now }
    : { mode: 'until', until: now + preset.ms, mutedAt: now };
}

/**
 * Whether a mute is still in force.
 *
 * An `until_recovered` mute is cleared by recovery rather than by the clock, so
 * it needs the signal's current status. Called without one it stays active,
 * which is the conservative direction: a stale mute is noticed by the reader,
 * while an alert sent to someone who asked for silence teaches them to filter.
 */
export function isMuteActive(mute, now, status) {
  if (!mute) return false;
  if (mute.mode === 'until_recovered') return status !== 'healthy';
  return typeof mute.until === 'number' && now < mute.until;
}

/**
 * Drops mutes that have lapsed, so stored state cannot grow without limit and a
 * signal cannot stay quietly muted by a record nobody can see any more.
 *
 * @param {MuteMap} mutes
 * @param {number} now
 * @param {Map<string,string>} [statusByKey] Current status per signal key.
 * @returns {MuteMap}
 */
export function pruneMutes(mutes, now, statusByKey) {
  const kept = {};
  for (const [key, mute] of Object.entries(mutes ?? {})) {
    if (isMuteActive(mute, now, statusByKey?.get(key))) kept[key] = mute;
  }
  return kept;
}

/** Plain-English description for the UI, e.g. "muted for 3 more days". */
export function describeMute(mute, now) {
  if (!mute) return '';
  if (mute.mode === 'until_recovered') return 'muted until it works again';

  const remaining = mute.until - now;
  if (remaining <= 0) return 'mute expired';
  const days = Math.round(remaining / DAY);
  if (days >= 2) return `muted for ${days} more days`;
  const hours = Math.max(1, Math.round(remaining / 3600_000));
  return `muted for ${hours} more hour${hours === 1 ? '' : 's'}`;
}
