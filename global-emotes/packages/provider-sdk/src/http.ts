import { ProviderError, type FetchFn } from './types';

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Exponential backoff with full jitter (spec §9). */
export function backoffDelay(attempt: number, baseMs = 500, maxMs = 30_000): number {
  const cap = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.floor(Math.random() * cap);
}

/**
 * JSON fetch with normalized provider errors, rate-limit awareness and retry
 * on retryable failures. Never logs tokens.
 */
export async function providerFetch<T>(
  fetchFn: FetchFn,
  url: string,
  init: RequestInit,
  options: RetryOptions = {},
): Promise<T> {
  const retries = options.retries ?? 2;
  const sleep = options.sleep ?? defaultSleep;
  let lastError: ProviderError | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    let res: Response;
    try {
      res = await fetchFn(url, init);
    } catch (err) {
      lastError = new ProviderError('provider_unavailable', `network error: ${String(err)}`);
      if (attempt < retries) await sleep(backoffDelay(attempt, options.baseDelayMs));
      continue;
    }

    if (res.status === 401) throw new ProviderError('auth_expired', 'access token rejected');
    if (res.status === 403) throw new ProviderError('permission_denied', 'insufficient scope');
    if (res.status === 404) throw new ProviderError('not_found', `not found: ${url}`);
    if (res.status === 429) {
      const retryAfter = Number(
        res.headers.get('retry-after') ?? res.headers.get('ratelimit-reset') ?? 1,
      );
      lastError = new ProviderError('rate_limited', 'rate limited', retryAfter * 1000);
      if (attempt < retries) {
        await sleep(Math.max(retryAfter * 1000, backoffDelay(attempt, options.baseDelayMs)));
        continue;
      }
      throw lastError;
    }
    if (res.status >= 500) {
      lastError = new ProviderError('provider_unavailable', `upstream ${res.status}`);
      if (attempt < retries) {
        await sleep(backoffDelay(attempt, options.baseDelayMs));
        continue;
      }
      throw lastError;
    }
    if (!res.ok) {
      throw new ProviderError('invalid_response', `unexpected status ${res.status}`);
    }
    if (res.status === 204) return undefined as T;
    try {
      return (await res.json()) as T;
    } catch {
      throw new ProviderError('invalid_response', 'invalid JSON body');
    }
  }
  throw lastError ?? new ProviderError('provider_unavailable', 'exhausted retries');
}
