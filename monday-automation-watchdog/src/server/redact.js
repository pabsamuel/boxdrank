/**
 * Keeps credentials out of text that is about to be logged, stored or parsed.
 *
 * This started inside the monday API client, for a leak a security review said
 * was not there. The client refused to echo the body of a *failed* response,
 * which looked like enough — but GraphQL reports errors inside a 200, so a
 * server quoting the `Authorization` header back handed the token to stderr and
 * to the run log on disk. Verified by running the real CLI against a stub that
 * echoes headers.
 *
 * It lives here now because the runner holds a second secret: the SMTP URL,
 * password and all. The same mistake was available twice, and a defence that
 * exists once per credential gets forgotten once per credential.
 */

/** What replaces a secret anywhere it would otherwise be written down. */
export const REDACTED = '[redacted]';

/**
 * Below this length a secret is not searched for.
 *
 * A two-character needle would strip unrelated text out of every response and
 * corrupt it — including the JSON this runs over. Real tokens and passwords are
 * longer, so nothing of value is exposed by the floor, and a secret short
 * enough to hit it is not protecting anything anyway.
 */
export const MIN_REDACTABLE_LENGTH = 8;

/**
 * Replaces every occurrence of each secret with a fixed marker.
 *
 * The marker contains no quote and no backslash, so substituting it inside a
 * JSON string literal leaves the document parseable. That matters: the API
 * client scrubs response bodies *before* parsing them, so that a credential
 * cannot come back through whichever field happens to carry it rather than only
 * the fields read today.
 *
 * Longest secrets are replaced first, so one secret that contains another (an
 * SMTP URL contains its own password) cannot leave a fragment behind.
 *
 * @param {unknown} text
 * @param {Array<string|undefined|null>} secrets
 * @returns {unknown} The text with every secret replaced, or the input unchanged
 *   if it was not a string.
 */
export function redact(text, secrets) {
  if (typeof text !== 'string') return text;

  const needles = (Array.isArray(secrets) ? secrets : [secrets])
    .filter((secret) => typeof secret === 'string' && secret.length >= MIN_REDACTABLE_LENGTH)
    .sort((a, b) => b.length - a.length);

  let result = text;
  for (const needle of needles) {
    result = result.split(needle).join(REDACTED);
  }
  return result;
}

/**
 * Every secret hidden inside a URL, so redacting it covers the parts as well.
 *
 * An error from a mail library may quote the whole connection string, or only
 * the password, or only the user. Redacting the URL alone would catch the first
 * case and miss the other two.
 *
 * @param {string|undefined} url
 * @returns {string[]}
 */
export function secretsInUrl(url) {
  if (typeof url !== 'string' || url === '') return [];
  const secrets = [url];
  try {
    const parsed = new URL(url);
    if (parsed.password) secrets.push(decodeURIComponent(parsed.password), parsed.password);
    if (parsed.username) secrets.push(decodeURIComponent(parsed.username), parsed.username);
  } catch {
    // Not a URL. The whole string is still treated as a secret, which is the
    // safe reading of a value the operator put in a variable named for one.
  }
  return secrets;
}
