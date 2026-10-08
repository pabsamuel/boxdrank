import type { Storage } from '../server/storage.js';

/**
 * Pro for accounts we grant it to by hand — partner licences promised in
 * outreach, and the developer's own account so the Pro path (scheduled drift
 * monitoring) runs live, not only in tests.
 *
 * Configured as `COMPLIMENTARY_PRO_ACCOUNTS`, a comma-separated list of monday
 * account ids. Only `getPlan` changes; everything else, including `savePlan`
 * from the billing webhook, goes straight to the real storage, so removing an
 * id from the list returns the account to whatever monday says it pays for.
 */
export function parseAccountList(raw: string | null | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^\d+$/.test(s)),
  );
}

export function withComplimentaryPro<S extends Pick<Storage, 'getPlan'>>(storage: S, accountIds: Set<string>): S {
  if (accountIds.size === 0) return storage;
  return new Proxy(storage, {
    get(target, prop) {
      if (prop === 'getPlan') {
        return async (accountId: string) =>
          accountIds.has(accountId)
            ? { accountId, planId: 'pro' as const, renewsAt: null }
            : target.getPlan(accountId);
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
