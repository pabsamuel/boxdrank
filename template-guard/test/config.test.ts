import { describe, expect, it } from 'vitest';
import { EnvConfig, MondayCodeConfig, type KeyValueReader } from '../src/server/config.js';

/**
 * Config is where a deployment quietly runs with the wrong settings. Both
 * implementations must fail the same way on a missing required value, and
 * neither may treat a near-miss as a "yes".
 */

function reader(data: Record<string, unknown>): KeyValueReader {
  return { get: (key: string) => data[key] };
}

describe('EnvConfig', () => {
  const config = new EnvConfig({ SET: 'value', EMPTY: '', FLAG_ON: 'true', FLAG_NEAR: 'TRUE' });

  it('reads a value and reports a missing one as null', () => {
    expect(config.get('SET')).toBe('value');
    expect(config.get('NOPE')).toBeNull();
  });

  it('names the key and how to set it when a required value is missing', () => {
    expect(() => config.require('MONDAY_CLIENT_ID')).toThrow(/MONDAY_CLIENT_ID.*\.env/s);
    // Empty is missing. A blank signing secret would otherwise verify nothing.
    expect(() => config.require('EMPTY')).toThrow(/Missing required/);
  });

  it('only treats an exact "true" as on', () => {
    expect(config.flag('FLAG_ON')).toBe(true);
    // A flag that turns on for "TRUE", "1" or "yes" turns on by accident.
    expect(config.flag('FLAG_NEAR')).toBe(false);
    expect(config.flag('MISSING')).toBe(false);
  });
});

describe('MondayCodeConfig', () => {
  it('prefers a secret over an environment variable of the same name', () => {
    const config = new MondayCodeConfig(
      reader({ MONDAY_SIGNING_SECRET: 'from-secrets' }),
      reader({ MONDAY_SIGNING_SECRET: 'from-env' }),
    );
    // Nobody puts a signing secret in plain environment variables on purpose.
    expect(config.get('MONDAY_SIGNING_SECRET')).toBe('from-secrets');
  });

  it('falls back to environment variables', () => {
    const config = new MondayCodeConfig(reader({}), reader({ PORT: 8302 }));
    // The managers return JsonValue, so a number arrives as a number.
    expect(config.get('PORT')).toBe('8302');
  });

  it('tells you the CLI command when a required value is missing', () => {
    const config = new MondayCodeConfig(reader({}), reader({}));
    expect(() => config.require('TOKEN_ENCRYPTION_KEY')).toThrow(/mapps code:secret/);
  });

  it('treats a throwing manager as "not set" rather than taking the process down', () => {
    const throwing: KeyValueReader = {
      get: () => {
        throw new Error('no local data file');
      },
    };
    const config = new MondayCodeConfig(throwing, reader({ PORT: '9000' }));

    expect(config.get('PORT')).toBe('9000');
    // And a genuinely missing required value still fails, with the key named.
    expect(() => config.require('MONDAY_CLIENT_ID')).toThrow(/MONDAY_CLIENT_ID/);
  });
});
