/** Browser + server API client. Cookies carry the session (SameSite=Lax). */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
export const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Global Emotes';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(`${API_URL}/v1${path}`, {
    ...rest,
    credentials: 'include',
    headers: {
      ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
      ...rest.headers,
    },
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    cache: 'no-store',
  });
  const body = (await res.json().catch(() => ({}))) as T & {
    error?: { code: string; message: string };
  };
  if (!res.ok) {
    throw new ApiError(res.status, body.error?.code ?? 'unknown', body.error?.message ?? 'request failed');
  }
  return body;
}
