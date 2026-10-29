/**
 * Where mutes live in the browser.
 *
 * `localStorage` is per-browser, so a mute set by one admin is invisible to
 * their colleague and to the scheduled job that actually sends the email. That
 * is wrong for the real product and right for a demo, which is the honest
 * position to be in while monday code's storage API cannot be read from here.
 *
 * monday's own SDK exposes `monday.storage` (account-scoped) — swapping this
 * module for it is the whole migration, because nothing else imports
 * localStorage. The scheduled job already takes an injected `storage`, so the
 * server side is ready for the same object.
 *
 * Every access is wrapped: storage throws in private windows and with site data
 * blocked, and a watchdog must not fail to render because a mute could not be
 * read.
 */

const KEY = 'watchdog:mutes:v1';

export function loadMutes() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    // Anything not shaped like a mute map is discarded rather than trusted;
    // a corrupt record must not be able to silence a real alert.
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveMutes(mutes) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(mutes));
    return true;
  } catch {
    // Reported to the caller so the UI can say the mute will not survive a
    // reload, rather than pretending it worked.
    return false;
  }
}
