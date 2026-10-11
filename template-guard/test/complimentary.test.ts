import { describe, expect, it } from 'vitest';
import { parseAccountList, withComplimentaryPro } from '../src/billing/complimentary.js';
import { InMemoryStorage } from '../src/server/storage.js';

describe('complimentary Pro', () => {
  it('parses a comma-separated list of numeric account ids and ignores junk', () => {
    expect([...parseAccountList(' 123, 456 ,abc,,7')]).toEqual(['123', '456', '7']);
    expect(parseAccountList(undefined).size).toBe(0);
  });

  it('grants Pro to listed accounts and leaves everyone else to real storage', async () => {
    const real = new InMemoryStorage();
    const storage = withComplimentaryPro(real, new Set(['42']));
    expect((await storage.getPlan('42')).planId).toBe('pro');
    expect((await storage.getPlan('7')).planId).toBe('free');
  });

  it('passes every other call through, bound to the real storage', async () => {
    const real = new InMemoryStorage();
    const storage = withComplimentaryPro(real, new Set(['42']));
    await storage.savePlan({ accountId: '7', planId: 'pro', renewsAt: null });
    expect((await real.getPlan('7')).planId).toBe('pro');
  });

  it('returns the storage untouched when the list is empty', () => {
    const real = new InMemoryStorage();
    expect(withComplimentaryPro(real, new Set())).toBe(real);
  });
});
