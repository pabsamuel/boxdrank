import { describe, expect, it } from 'vitest';
import { activateLicense, checkoutUrl, entitlementsMode, validateLicense } from './entitlements';

const fakeFetch = (payload: unknown) =>
  (async () => new Response(JSON.stringify(payload))) as unknown as typeof fetch;

describe('entitlements', () => {
  it('defaults to open mode with everything unlocked', () => {
    expect(entitlementsMode({})).toBe('open');
    expect(entitlementsMode({ ENTITLEMENTS_MODE: 'weird' })).toBe('open');
    expect(entitlementsMode({ ENTITLEMENTS_MODE: 'lemonsqueezy' })).toBe('lemonsqueezy');
  });

  it('only hands out an https checkout link', () => {
    expect(checkoutUrl({})).toBeUndefined();
    expect(checkoutUrl({ PERDE_CHECKOUT_URL: '' })).toBeUndefined();
    expect(checkoutUrl({ PERDE_CHECKOUT_URL: 'javascript:alert(1)' })).toBeUndefined();
    expect(checkoutUrl({ PERDE_CHECKOUT_URL: ' https://perde.lemonsqueezy.com/buy/x ' })).toBe(
      'https://perde.lemonsqueezy.com/buy/x',
    );
  });

  it('grants plus without calling anyone in open mode', async () => {
    const r = await activateLicense({}, 'whatever', 'tv', (() => {
      throw new Error('must not fetch');
    }) as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, plan: 'plus' });
  });

  it('rejects malformed keys before calling Lemon Squeezy', async () => {
    const r = await activateLicense(
      { ENTITLEMENTS_MODE: 'lemonsqueezy' },
      'short',
      'tv',
      fakeFetch({}),
    );
    expect(r.ok).toBe(false);
    expect(r.error).toBe('malformed-key');
  });

  it('activates a key from our store', async () => {
    const env = { ENTITLEMENTS_MODE: 'lemonsqueezy', LEMONSQUEEZY_STORE_ID: '123' };
    const key = '38b1460a-5104-4067-a91d-77b872934d51';
    const ok = await activateLicense(
      env,
      key,
      'tv',
      fakeFetch({ activated: true, instance: { id: 'inst-1' }, meta: { store_id: 123 } }),
    );
    expect(ok).toEqual({ ok: true, plan: 'plus', instanceId: 'inst-1' });
    const wrongStore = await activateLicense(
      env,
      key,
      'tv',
      fakeFetch({ activated: true, meta: { store_id: 999 } }),
    );
    expect(wrongStore.ok).toBe(false);
  });

  it('validates and notices disabled keys', async () => {
    const env = { ENTITLEMENTS_MODE: 'lemonsqueezy' };
    const good = await validateLicense(
      env,
      'k'.repeat(20),
      'inst',
      fakeFetch({ valid: true, license_key: { status: 'active' } }),
    );
    expect(good.plan).toBe('plus');
    const bad = await validateLicense(
      env,
      'k'.repeat(20),
      'inst',
      fakeFetch({ valid: true, license_key: { status: 'disabled' } }),
    );
    expect(bad.plan).toBe('free');
    const down = await validateLicense(env, 'k'.repeat(20), undefined, (async () => {
      throw new Error('network');
    }) as unknown as typeof fetch);
    expect(down.error).toBe('upstream');
  });
});
