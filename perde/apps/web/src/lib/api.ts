import type { Plan } from '@perde/shared';

export async function createRoom(): Promise<string> {
  const res = await fetch('/api/rooms', { method: 'POST' });
  if (!res.ok) throw new Error(`createRoom failed: ${res.status}`);
  const data = (await res.json()) as { code: string };
  return data.code;
}

export interface RoomInfo {
  code: string;
  stage: boolean;
  controllers: Array<{ seat?: string; name?: string }>;
}

export async function getRoom(code: string): Promise<RoomInfo | null> {
  const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getRoom failed: ${res.status}`);
  return (await res.json()) as RoomInfo;
}

export interface Entitlements {
  mode: 'open' | 'lemonsqueezy';
  plan: Plan;
}

export async function getEntitlements(): Promise<Entitlements> {
  const res = await fetch('/api/entitlements');
  if (!res.ok) return { mode: 'lemonsqueezy', plan: 'free' };
  return (await res.json()) as Entitlements;
}

export interface LicenseResult {
  ok: boolean;
  plan: Plan;
  instanceId?: string;
  error?: string;
}

export async function activateLicense(key: string, instanceName: string): Promise<LicenseResult> {
  const res = await fetch('/api/license/activate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key, instanceName }),
  });
  return (await res.json()) as LicenseResult;
}

export async function validateLicense(key: string, instanceId?: string): Promise<LicenseResult> {
  const res = await fetch('/api/license/validate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key, instanceId }),
  });
  return (await res.json()) as LicenseResult;
}
