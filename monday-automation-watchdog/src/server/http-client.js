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
 */

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
 * Builds a client with the same surface `runCheck` expects from the SDK.
 *
 * @param {object} options
 * @param {string} options.token monday API token. Never logged.
 * @param {string} [options.endpoint]
 * @param {string} [options.apiVersion] Sent as the API-Version header when given.
 * @param {typeof fetch} [options.fetchImpl] Injected for tests.
 */
export function createHttpClient({ token, endpoint = DEFAULT_ENDPOINT, apiVersion, fetchImpl = globalThis.fetch }) {
  if (!token) throw new Error('A monday API token is required to run outside a browser.');
  if (typeof fetchImpl !== 'function') throw new Error('No fetch implementation available.');

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
      });

      // A non-2xx response carries no useful GraphQL body, and its text could
      // contain anything. The status is what the caller can act on; the body is
      // deliberately not echoed, so a token reflected in an error page cannot
      // travel into a log or an email.
      if (!response.ok) {
        throw new Error(`monday API returned HTTP ${response.status}`);
      }

      return response.json();
    },
  };
}
