import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isAuthorisedCronCaller } from '../src/server/cron-auth.js';

const SIGNING = 'signing-secret';

function jwt(payload: Record<string, unknown>, secret = SIGNING, alg = 'HS256'): string {
  const h = Buffer.from(JSON.stringify({ alg, typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const s = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${s}`;
}

describe('isAuthorisedCronCaller', () => {
  it("accepts monday code's scheduler, which can only send a signed JWT", () => {
    expect(isAuthorisedCronCaller({ authorization: `Bearer ${jwt({ exp: 2_000_000_000 })}`, signingSecret: SIGNING, nowSeconds: 1 })).toBe(true);
    expect(isAuthorisedCronCaller({ authorization: jwt({}), signingSecret: SIGNING })).toBe(true);
  });

  it('accepts the shared-secret header for a self-hosted cron', () => {
    expect(isAuthorisedCronCaller({ cronHeader: 'c', cronSecret: 'c', signingSecret: SIGNING })).toBe(true);
  });

  it('refuses a token signed with another secret, an expired one, or alg none', () => {
    expect(isAuthorisedCronCaller({ authorization: jwt({}, 'other'), signingSecret: SIGNING })).toBe(false);
    expect(isAuthorisedCronCaller({ authorization: jwt({ exp: 10 }), signingSecret: SIGNING, nowSeconds: 20 })).toBe(false);
    expect(isAuthorisedCronCaller({ authorization: jwt({}, SIGNING, 'none'), signingSecret: SIGNING })).toBe(false);
  });

  it('refuses a caller with nothing, or with the wrong header secret', () => {
    expect(isAuthorisedCronCaller({ signingSecret: SIGNING })).toBe(false);
    expect(isAuthorisedCronCaller({ cronHeader: 'x', cronSecret: 'c', signingSecret: SIGNING })).toBe(false);
    expect(isAuthorisedCronCaller({ cronHeader: 'x', signingSecret: SIGNING })).toBe(false);
  });
});
