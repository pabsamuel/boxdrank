/** Durations in words, as the rows show them ("3 days"). From Automation Watchdog. */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatDuration(ms) {
  if (ms < MINUTE) return 'less than a minute';
  if (ms < HOUR) return `${Math.round(ms / MINUTE)} min`;
  if (ms < DAY) {
    const hours = ms / HOUR;
    return `${hours < 10 ? hours.toFixed(1).replace(/\.0$/, '') : Math.round(hours)} hr`;
  }
  const days = ms / DAY;
  const shown = days < 10 ? days.toFixed(1).replace(/\.0$/, '') : String(Math.round(days));
  return `${shown} ${shown === '1' ? 'day' : 'days'}`;
}
