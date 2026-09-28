/**
 * Flattens untrusted text so it cannot forge structure in anything downstream.
 *
 * Board names, automation names and event names are chosen by anyone who can
 * create or share a board. They end up in a plain-text email — a document whose
 * entire meaning is carried by newlines, section headers and indentation. A
 * newline inside a board name lets that person write their own sections.
 *
 * The HTML body was escaped from the start; the text body was not, on the
 * reasoning that plain text is not markup and so needs no escaping. That
 * reasoning was wrong, and a test asserted it. Plain text is not markup, but it
 * *is* structured, and the structure is exactly what was forgeable.
 */

/** Long enough for any real board or automation name, short enough not to fill a screen. */
export const MAX_NAME_LENGTH = 120;

/**
 * Characters that break a line, or that a renderer may treat as one.
 *
 * Built from a string rather than written as a literal so the escape sequences
 * survive every tool that touches this file. U+2028 and U+2029 are included
 * because they are line terminators to both JavaScript and most renderers, even
 * though a plain \n check misses them.
 */
const LINE_BREAKING = new RegExp('[\\u0000-\\u001f\\u007f\\u0085\\u2028\\u2029]+', 'g');

/**
 * Collapses any text to a single line: no line breaks, no control characters,
 * no runs of whitespace, length-capped.
 *
 * @param {unknown} text
 * @param {number} [maxLength]
 * @returns {string} Never contains a line break.
 */
export function singleLine(text, maxLength = MAX_NAME_LENGTH) {
  const flattened = String(text ?? '')
    .replace(LINE_BREAKING, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (flattened.length <= maxLength) return flattened;
  return `${flattened.slice(0, maxLength - 1).trimEnd()}…`;
}
