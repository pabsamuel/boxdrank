/**
 * Entitlements: who gets Perde Plus.
 *
 * Two modes, picked by the ENTITLEMENTS_MODE var:
 *   open         – everything unlocked. Dev, self-hosting, demos.
 *   lemonsqueezy – a licence key bought on Lemon Squeezy unlocks Plus.
 *
 * Lemon Squeezy is the merchant of record (handles VAT/KDV worldwide), and its
 * licence endpoints need no API key, so this worker never holds a secret.
 * See docs/PRICING.md.
 */

export type Plan = 'free' | 'plus';
export type EntitlementsMode = 'open' | 'lemonsqueezy';

export interface EntitlementsEnv {
  ENTITLEMENTS_MODE?: string;
  LEMONSQUEEZY_STORE_ID?: string;
  LEMONSQUEEZY_PRODUCT_ID?: string;
}

export interface LicenseResult {
  ok: boolean;
  plan: Plan;
  instanceId?: string;
  error?: string;
}

const LS_API = 'https://api.lemonsqueezy.com/v1/licenses';

export function entitlementsMode(env: EntitlementsEnv): EntitlementsMode {
  return env.ENTITLEMENTS_MODE === 'lemonsqueezy' ? 'lemonsqueezy' : 'open';
}

interface LsResponse {
  activated?: boolean;
  valid?: boolean;
  error?: string | null;
  license_key?: { status?: string };
  instance?: { id?: string } | null;
  meta?: { store_id?: number; product_id?: number };
}

function belongsToUs(meta: LsResponse['meta'], env: EntitlementsEnv): boolean {
  if (env.LEMONSQUEEZY_STORE_ID && String(meta?.store_id) !== env.LEMONSQUEEZY_STORE_ID)
    return false;
  if (env.LEMONSQUEEZY_PRODUCT_ID && String(meta?.product_id) !== env.LEMONSQUEEZY_PRODUCT_ID)
    return false;
  return true;
}

async function lsCall(
  path: 'activate' | 'validate',
  form: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<LsResponse> {
  const body = new URLSearchParams(form);
  const res = await fetchImpl(`${LS_API}/${path}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  return (await res.json()) as LsResponse;
}

export async function activateLicense(
  env: EntitlementsEnv,
  key: string,
  instanceName: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LicenseResult> {
  if (entitlementsMode(env) === 'open') return { ok: true, plan: 'plus' };
  const trimmed = key.trim();
  if (!/^[A-Za-z0-9-]{16,64}$/.test(trimmed))
    return { ok: false, plan: 'free', error: 'malformed-key' };
  try {
    const r = await lsCall(
      'activate',
      { license_key: trimmed, instance_name: instanceName.slice(0, 60) },
      fetchImpl,
    );
    if (!r.activated || !belongsToUs(r.meta, env)) {
      return { ok: false, plan: 'free', error: r.error ?? 'not-activated' };
    }
    return { ok: true, plan: 'plus', instanceId: r.instance?.id };
  } catch {
    return { ok: false, plan: 'free', error: 'upstream' };
  }
}

export async function validateLicense(
  env: EntitlementsEnv,
  key: string,
  instanceId: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<LicenseResult> {
  if (entitlementsMode(env) === 'open') return { ok: true, plan: 'plus' };
  const trimmed = key.trim();
  if (!trimmed) return { ok: false, plan: 'free', error: 'malformed-key' };
  try {
    const form: Record<string, string> = { license_key: trimmed };
    if (instanceId) form.instance_id = instanceId;
    const r = await lsCall('validate', form, fetchImpl);
    const active =
      r.valid && r.license_key?.status !== 'disabled' && r.license_key?.status !== 'expired';
    if (!active || !belongsToUs(r.meta, env))
      return { ok: false, plan: 'free', error: r.error ?? 'invalid' };
    return { ok: true, plan: 'plus', instanceId: r.instance?.id ?? instanceId };
  } catch {
    return { ok: false, plan: 'free', error: 'upstream' };
  }
}
