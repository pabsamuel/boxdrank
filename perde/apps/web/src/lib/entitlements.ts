import type { Plan } from '@perde/shared';
import {
  activateLicense,
  getEntitlements,
  validateLicense,
  type Entitlements,
  type LicenseResult,
} from './api';

/**
 * The TV remembers its licence in localStorage and re-validates on start.
 * In "open" mode (dev/self-host) everything is Plus and no key is needed.
 */

const KEY = 'perde.license';

interface StoredLicense {
  key: string;
  instanceId?: string;
}

function read(): StoredLicense | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredLicense) : null;
  } catch {
    return null;
  }
}

function write(v: StoredLicense | null) {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}

export interface ResolvedPlan {
  plan: Plan;
  mode: 'open' | 'lemonsqueezy';
  checkoutUrl?: string;
}

export async function resolvePlan(): Promise<ResolvedPlan> {
  const ent: Entitlements = await getEntitlements().catch(() => ({
    mode: 'lemonsqueezy' as const,
    plan: 'free' as const,
  }));
  const checkoutUrl = ent.checkoutUrl;
  if (ent.mode === 'open') return { plan: 'plus', mode: 'open', checkoutUrl };
  const stored = read();
  if (!stored) return { plan: 'free', mode: ent.mode, checkoutUrl };
  const r = await validateLicense(stored.key, stored.instanceId).catch(() => ({
    ok: false,
    plan: 'free' as const,
  }));
  if (!r.ok) write(null);
  return { plan: r.ok ? 'plus' : 'free', mode: ent.mode, checkoutUrl };
}

export async function activate(key: string): Promise<{ ok: boolean; error?: string }> {
  const r: LicenseResult = await activateLicense(
    key,
    `Perde TV ${new Date().toISOString().slice(0, 10)}`,
  ).catch(() => ({ ok: false, plan: 'free' as const, error: 'network' }));
  if (r.ok) write({ key, instanceId: r.instanceId });
  return { ok: r.ok, error: r.error };
}
