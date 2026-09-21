/**
 * A monday API client that works outside a browser.
 *
 * `monday-sdk-js` cannot be used here: version 0.5.9 attaches a `message`
 * listener to `window` on construction, so it throws the moment it is imported
 * in Node. Its seamless authentication is also browser-only by definition — it
 * borrows the signed-in user's session, and a scheduled job has no user.
 *
 * So the scheduled path uses a plain HTTP client with an API token, and exposes
 * the same `api(query, options)` shape the rest of the code already expects.
 * Nothing above this file knows which one it is talking to.
 *
 * This is the only file in the project that holds a credential, so it is the
 * only place that can defend one. Two of the three defences below exist because
 * a security review found the gap, not because they were designed in.
 */

import { singleLine } from '../core/sanitize.js';

/**
 * monday's GraphQL endpoint.
 *
 * **UNVERIFIED in this environment** — developer.monday.com is unreachable from
 * here, so this is the widely published address rather than one read from the
 * reference. Overridable by `MONDAY_API_URL` precisely because it is a guess,
 * and a wrong default should cost one environment variable rather than a patch.
 */
export const DEFAULT_ENDPOINT = 'https://api.monday.com/v2';

/** What replaces the token anywhere it would otherwise be written down. */
export const REDACTED = '[monday API token redacted]';

/**
 * Hosts the token may be sent to.
 *
 * The endpoint is an operator-supplied string that the token is attached to on
 * the very first request, before any response is looked at. Without this check
 * a single wrong environment variable — a typo, a copied snippet, a line added
 * to a workflow by anyone with push access — hands a full-account credential to
 * whoever owns that address. The token is the one thing here that cannot be
 * un-leaked, so the destination fails closed.
 *
 * The suffix is checked with a leading dot so `notmonday.com` and
 * `monday.com.attacker.example` do not pass.
 */
function assertSafeEndpoint(endpoint) {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error(`MONDAY_API_URL is not a valid URL: ${singleLine(endpoint, 60)}`);
  }

  if (url.protocol !== 'https:') {
    throw new Error(`Refusing to send the monday API token over ${url.protocol}//. Use https.`);
  }
  if (url.hostname !== 'monday.com' && !url.hostname.endsWith('.monday.com')) {
    throw new Error(`Refusing to send the monday API token to ${singleLine(url.hostname, 60)}.`);
  }
}

/**
 * Removes the token from text that is about to be logged, stored or parsed.
 *
 * The client already refused to echo the body of a failed response. That was
 * not enough: GraphQL reports errors in a **200**, so an error message is read
 * as data, handed upwards, printed to stderr and written into the run log. A
 * server that quotes the Authorization header back — a reflecting error page, a
 * proxy in front of the API, a wrong endpoint — therefore put the credential on
 * disk and into a public CI log. Verified by running the real CLI against a
 * stub that echoes the header; the token appeared in both.
 *
 * So the whole body is scrubbed before it is parsed, not just the fields that
 * happen to be read today. The replacement contains no quote or backslash, so
 * substituting it inside a JSON string literal leaves valid JSON.
 *
 * Tokens shorter than this are not redacted: a two-character needle would strip
 * unrelated text out of every response and corrupt it. Real monday tokens are
 * long, so nothing of value is exposed by the floor.
 */
const MIN_REDACTABLE_LENGTH = 8;

export function redactToken(text, token) {
  if (typeof text !== 'string') return text;
  if (typeof token !== 'string' || token.length < MIN_REDACTABLE_LENGTH) return text;
  return text.split(token).join(REDACTED);
}

/**
 * Builds a client with the same surface `runCheck` expects from the SDK.
 *
 * @param {object} options
 * @param {string} options.token monday API token. Never logged, and scrubbed
 *   out of every response before anything else sees it.
 * @param {string} [options.endpoint] Must be https and a monday.com host.
 * @param {string} [options.apiVersion] Sent as the API-Version header when given.
 * @param {boolean} [options.allowInsecureEndpoint] Lifts the endpoint check.
 *   Only for tests pointing at a local stub, and the CLI makes the operator ask
 *   for it explicitly.
 * @param {typeof fetch} [options.fetchImpl] Injected for tests.
 */
export function createHttpClient({
  token,
  endpoint = DEFAULT_ENDPOINT,
  apiVersion,
  allowInsecureEndpoint = false,
  fetchImpl = globalThis.fetch,
}) {
  if (!token) throw new Error('A monday API token is required to run outside a browser.');
  if (typeof fetchImpl !== 'function') throw new Error('No fetch implementation available.');
  if (!allowInsecureEndpoint) assertSafeEndpoint(endpoint);

  return {
    async api(query, options = {}) {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: token,
      };
      if (apiVersion) headers['API-Version'] = apiVersion;

      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, variables: options.variables ?? {} }),
        // A GraphQL POST has no business being redirected. Node strips the
        // Authorization header on a cross-origin hop, so this is not what keeps
        // the token home — it stops the *query* being forwarded somewhere
        // unnoticed, and turns a misrouted endpoint into an error instead of a
        // silent success.
        redirect: 'error',
      });

      // A non-2xx response carries no useful GraphQL body, and its text could
      // contain anything. The status is what the caller can act on.
      if (!response.ok) {
        throw new Error(`monday API returned HTTP ${response.status}`);
      }

      const body = redactToken(await response.text(), token);

      try {
        return JSON.parse(body);
      } catch {
        // Not `error.message`: Node's JSON parse errors quote the first bytes
        // of the input, which is the body this client refuses to echo. The
        // content type is the diagnostic that actually matters — it is how you
        // find out the endpoint is serving an HTML login page.
        const contentType = singleLine(response.headers?.get?.('content-type') ?? 'unknown', 60);
        throw new Error(
          `monday API returned a non-JSON response (${body.length} bytes, content-type ${contentType}).`,
        );
      }
    },
  };
}
