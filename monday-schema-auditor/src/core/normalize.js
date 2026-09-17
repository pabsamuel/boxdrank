/**
 * Title normalisation used when matching columns across boards.
 *
 * Two boards built from the same template drift in ways that look identical to
 * a human but not to a dashboard: "Due date" vs "Due Date", "Owner " with a
 * trailing space, "Son Tarih" typed with a Turkish dotted capital I. Normalising
 * lets us call those the same column and report the difference as a variant
 * rather than as a missing column plus an extra one.
 */

/**
 * Lowercase, strip diacritics, and reduce every run of non-alphanumeric
 * characters to a single space.
 *
 * NFKD before the diacritic strip matters for Turkish input: "İ" decomposes to
 * "I" plus a combining dot, and only the decomposed form can have the dot
 * removed. Without it "İSİM" and "isim" would not match.
 *
 * @param {unknown} title
 * @returns {string}
 */
export function normalizeTitle(title) {
  return String(title ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * True when two titles differ only in case, spacing, punctuation or accents.
 * An exact match returns false — that is not a variant, it is the same title.
 *
 * @param {string} a
 * @param {string} b
 */
export function isTitleVariant(a, b) {
  return a !== b && normalizeTitle(a) === normalizeTitle(b);
}
