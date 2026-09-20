/**
 * Configuration, from wherever this is running.
 *
 * On our own host, config is `process.env`. On monday code it is not: values
 * set with `mapps code:env` and `mapps code:secret` are read through
 * `EnvironmentVariablesManager` and `SecretsManager` from the SDK, and
 * `process.env` may simply not have them.
 *
 * So the server stops reading `process.env` directly and reads a `Config`.
 * Two implementations, same trick as `Storage`: the interface exists so the
 * second implementation is one file and the tests never need the SDK.
 */

export interface Config {
  /** Returns the value, or `null` if it is not set. Never throws. */
  get(key: string): string | null;
  /** Returns the value or throws with a message that says how to set it. */
  require(key: string): string;
  /** True when the value is exactly the string "true". */
  flag(key: string): boolean;
}

abstract class BaseConfig implements Config {
  abstract get(key: string): string | null;
  protected abstract readonly howToSet: (key: string) => string;

  require(key: string): string {
    const value = this.get(key);
    if (value === null || value === '') {
      throw new Error(`Missing required configuration "${key}". ${this.howToSet(key)}`);
    }
    return value;
  }

  flag(key: string): boolean {
    // Anything other than an explicit "true" is off. A flag that turns on for
    // "1", "yes" or "TRUE" is a flag that turns on by accident.
    return this.get(key) === 'true';
  }
}

export class EnvConfig extends BaseConfig {
  protected readonly howToSet = (key: string) => `Copy .env.example to .env and set ${key}.`;

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {
    super();
  }

  get(key: string): string | null {
    return this.env[key] ?? null;
  }
}

/**
 * Reads from the SDK's managers.
 *
 * Both are synchronous and return `JsonValue | undefined`, so a number set as
 * an environment variable arrives as a number. Everything is coerced to a
 * string, because every consumer here wants one and a silent type surprise in
 * config is a bad way to find out.
 *
 * Secrets are checked first. If the same key exists in both, the secret is the
 * one that was meant — nobody puts a signing secret in plain environment
 * variables on purpose, and preferring the plaintext copy would be the wrong
 * failure to have.
 */
export interface KeyValueReader {
  get(key: string): unknown;
}

export class MondayCodeConfig extends BaseConfig {
  protected readonly howToSet = (key: string) =>
    `Set it with: mapps code:secret -i <APP_ID> -m set -k ${key} -v "<value>"  (or mapps code:env for non-secret values). Environment variables need a redeploy to take effect.`;

  constructor(
    private readonly secrets: KeyValueReader,
    private readonly env: KeyValueReader,
  ) {
    super();
  }

  get(key: string): string | null {
    const fromSecret = this.read(this.secrets, key);
    if (fromSecret !== null) return fromSecret;
    return this.read(this.env, key);
  }

  private read(source: KeyValueReader, key: string): string | null {
    let value: unknown;
    try {
      value = source.get(key);
    } catch {
      // The managers read a local file when running outside monday code, and
      // a missing file must not take the process down on a key we may not
      // even need. `null` here becomes a clear "missing required
      // configuration" error at `require()`, which names the key.
      return null;
    }
    if (value === undefined || value === null || value === '') return null;
    return typeof value === 'string' ? value : String(value);
  }
}
