/**
 * The same `get`/`set` interface, backed by monday's own storage.
 *
 * `runCheck` has always taken storage as an injected dependency rather than
 * importing one, on the bet that monday offered something and the shape of it
 * was unknowable from here. The bet paid: this file is the whole cost of moving
 * off disk, and nothing above it changes.
 *
 * Read from `developer.monday.com/apps/docs/monday-code-javascript-sdk` on
 * 23 Sep 2026, once the environment could reach it. Not written from memory —
 * the one time this project guessed at a monday format, the guess was wrong.
 *
 * **FACT, from that page:** `new Storage(ACCESS_TOKEN)` exposes `set`, `get`,
 * `search` and `delete`; keys are capped at 256 characters and values at 6MB;
 * the token must be an account access token from the OAuth flow, and "the
 * sessionToken passed from the frontend will not work"; and the whole thing
 * "can be used in every backend app, not only those hosted on monday code",
 * which is why the file-backed adapter stays as a working alternative rather
 * than a stopgap.
 */

/**
 * monday caps keys at 256 characters.
 *
 * This app's keys are `watchdog:state:v1:<accountId>` and its run-log sibling,
 * so nothing near the cap — but an account id is not this project's to bound,
 * and a silently truncated key would collide two accounts' state, which is the
 * one failure that makes a watchdog lie about a different account's automations.
 */
export const MAX_KEY_LENGTH = 256;

/**
 * How long a value lives after its last write: 9 days.
 *
 * monday's review requires End User Data to be deleted within 10 days of an
 * uninstall. This app cannot delete its per-account storage itself at that
 * point: Storage needs the account's access token, and monday revokes it at
 * uninstall. So every write sets a time to live instead. FACT (the SDK's
 * README, `@mondaycom/apps-sdk` 3.3.2): `ttl` is "a time value in seconds,
 * after which the value will be deleted"; monday's docs cap it at 30 days.
 *
 * The daily check rewrites both of the account's keys on every run, so an
 * installed account never loses its state. After an uninstall nothing writes
 * again, and the last write is at most a day old, so the data is gone within
 * 9 days. The backstop is `mapps storage:remove-data -a <app> -c <account>`.
 */
export const RETENTION_TTL_SECONDS = 9 * 24 * 60 * 60;

/**
 * monday Storage keeps strings. Values go in as JSON text and come back parsed.
 *
 * FACT (`mapps storage:export -a 12249756 -c 36993937`, 9 Nov 2026): objects
 * handed to `set` were stored as `"[object Object]"`, and the run log, read
 * back as that string and spread into an array, had become
 * `"[object Object],[,o,b,j,e,c,t, ,O,b,j,e,c,t,],…"`. So the alert state never
 * survived a run and the board view never saw a run.
 *
 * A stored value that is not JSON is one of those old strings. It holds
 * nothing recoverable, so it reads as no state rather than failing every check.
 */
function decode(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * @param {object} options
 * @param {string} options.token Account access token from the OAuth flow.
 * @param {(token: string) => {get: Function, set: Function}} [options.storageFactory]
 *   Injected so tests never reach the network, and so the SDK stays an optional
 *   dependency for anyone running the file-backed path.
 */
export function createMondayStorage({ token, storageFactory }) {
  if (!token) throw new Error('A monday access token is required for monday storage.');

  let storage;
  const connect = async () => {
    if (storage) return storage;
    // Imported on demand, not at module load: the SDK is only needed on the
    // monday-hosted path, and importing it up front would break the file-backed
    // one for anyone who has not installed it.
    const factory =
      storageFactory ??
      (async (t) => {
        const { Storage } = await import('@mondaycom/apps-sdk');
        return new Storage(t);
      });
    storage = await factory(token);
    return storage;
  };

  const checkKey = (key) => {
    const text = String(key);
    if (text.length > MAX_KEY_LENGTH) {
      throw new Error(`Storage key is ${text.length} characters; monday allows ${MAX_KEY_LENGTH}.`);
    }
    return text;
  };

  return {
    async get(key) {
      const result = await (await connect()).get(checkKey(key));
      // The SDK reports a miss as a successful call with no value, so an absent
      // key and a failed read look alike unless `success` is checked. Treating a
      // failure as "no state" would re-announce every automation in the account.
      if (result?.success === false) {
        throw new Error(`Reading watchdog state from monday storage failed: ${result.error ?? 'unknown error'}`);
      }
      return decode(result?.value);
    },

    async set(key, value) {
      const result = await (await connect()).set(checkKey(key), JSON.stringify(value), { ttl: RETENTION_TTL_SECONDS });
      if (result?.success === false) {
        throw new Error(`Writing watchdog state to monday storage failed: ${result.error ?? 'unknown error'}`);
      }
    },
  };
}
