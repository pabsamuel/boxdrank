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
 * Two of the three defences below exist because a security review found the
 * gap, not because they were designed in. The third — scrubbing the token out
 * of responses — exists because the review said that path was clean and it was
 * not. Redaction is shared with the mailer in `redact.js`, since the runner
 * holds two credentials and the same mistake was available twice.
 */

import { singleLine } from '../core/sanitize.js';
import { redact, REDACTED } from './redact.js';

/**
 * monday's GraphQL endpoint.
 *
 * **UNVERIFIED in this environment** — developer.monday.com is unreachable from
 * here, so this is the widely published address rather than one read from the
 * reference. Overridable by `MONDAY_API_URL` precisely because it is a guess,
 * and a wrong default should cost one environment variable rather than a patch.
 */
export const DEFAULT_ENDPOINT = 'https://api.monday.com/v2';

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

      // Scrubbed as text before parsing, so the token cannot come back through
      // whichever field carries it rather than only the fields read today.
      const body = redact(await response.text(), [token]);

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
