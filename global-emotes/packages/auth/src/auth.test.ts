import { describe, expect, it } from 'vitest';
import {
  decryptSecret,
  encryptSecret,
  generateAccessCode,
  generateToken,
  hashToken,
  signValue,
  unsignValue,
} from './index';

const KEY = 'a'.repeat(64);

describe('auth primitives', () => {
  it('generates unique opaque tokens and stable hashes', () => {
    const t1 = generateToken();
    const t2 = generateToken();
    expect(t1).not.toBe(t2);
    expect(hashToken(t1)).toBe(hashToken(t1));
    expect(hashToken(t1)).not.toBe(hashToken(t2));
  });

  it('round-trips AES-256-GCM secrets and rejects tampering', () => {
    const secret = 'oauth-access-token-value';
    const enc = encryptSecret(secret, KEY);
    expect(enc).not.toContain(secret);
    expect(decryptSecret(enc, KEY)).toBe(secret);

    const parts = enc.split(':');
    const tamperedData = Buffer.from(parts[3]!, 'base64');
    tamperedData[0] = tamperedData[0]! ^ 0xff;
    const tampered = [parts[0], parts[1], parts[2], tamperedData.toString('base64')].join(':');
    expect(() => decryptSecret(tampered, KEY)).toThrow();
  });

  it('rejects wrong-length keys', () => {
    expect(() => encryptSecret('x', 'abcd')).toThrow();
  });

  it('signs and verifies cookie values, rejecting forgeries', () => {
    const signed = signValue('user-123', 'secret-1');
    expect(unsignValue(signed, 'secret-1')).toBe('user-123');
    expect(unsignValue(signed, 'other-secret')).toBeNull();
    expect(unsignValue(signed.replace('user-123', 'user-999'), 'secret-1')).toBeNull();
  });

  it('generates unambiguous access codes in the expected format', () => {
    const code = generateAccessCode();
    expect(code).toMatch(/^[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}$/);
    expect(code).not.toMatch(/[01OIL]/);
  });
});
