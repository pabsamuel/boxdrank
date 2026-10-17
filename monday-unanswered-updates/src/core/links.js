/**
 * A monday URL the view may open, or null. Item and board URLs come from
 * monday's API and are only ever opened if they are https on monday.com, so a
 * value that is anything else cannot send the user somewhere else.
 * From Automation Inventory's `safeBoardUrl`.
 */
export function safeMondayUrl(value) {
  let url;
  try {
    url = new URL(String(value ?? ''));
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  if (host !== 'monday.com' && !host.endsWith('.monday.com')) return null;
  return url.toString();
}
