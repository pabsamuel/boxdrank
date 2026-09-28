import type { AccountStore, SecureStore } from '../src/server/monday-code-storage.js';

/**
 * In-memory stand-ins for monday code's two storages.
 *
 * They mimic the SDK's *shapes* exactly as its type definitions declare them —
 * `SecureStorage.set` answers a boolean, `Storage.set` answers
 * `{ success, error }` — because the interesting bugs are in how our code
 * handles those answers, not in the storage itself. A fake that threw on
 * failure would test a world we do not live in.
 */

export class FakeSecureStore implements SecureStore {
  readonly data = new Map<string, unknown>();
  /** Keys whose next write should report failure, to exercise loud failing. */
  failWrites = new Set<string>();

  async get<T>(key: string): Promise<T | null> {
    return (this.data.get(key) as T) ?? null;
  }

  async set(key: string, value: unknown): Promise<boolean> {
    if (this.failWrites.has(key)) return false;
    this.data.set(key, structuredClone(value));
    return true;
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
  }
}

export class FakeAccountStore implements AccountStore {
  readonly data = new Map<string, unknown>();
  failNextSearch = false;
  /** Records returned per search page, to exercise cursor paging. */
  pageSize = 100;
  /** Mimic the live platform: search values are not the stored objects. */
  searchMangles = false;
  /** Mimic a platform that returns stored objects as JSON text from get. */
  getReturnsText = false;

  async get<T>(key: string) {
    const v = this.data.get(key);
    if (v !== undefined && this.getReturnsText) return { value: JSON.stringify(v) as unknown as T, success: true };
    return { value: (v as T) ?? null, success: true };
  }

  async set(key: string, value: unknown) {
    this.data.set(key, structuredClone(value));
    return { success: true };
  }

  async delete(key: string) {
    this.data.delete(key);
    return { success: true };
  }

  async search<T>(prefix: string, options?: { cursor?: string }) {
    if (this.failNextSearch) {
      this.failNextSearch = false;
      return { records: null, success: false, error: 'storage unavailable' };
    }

    const all = [...this.data.entries()].filter(([k]) => k.startsWith(prefix));
    const start = options?.cursor ? Number(options.cursor) : 0;
    const page = all.slice(start, start + this.pageSize);
    const next = start + this.pageSize;

    return {
      records: page.map(([key, value]) => ({ key, value: (this.searchMangles ? {} : value) as T })),
      cursor: next < all.length ? String(next) : undefined,
      success: true,
    };
  }
}

/** One secure store, one account store per token — as the platform behaves. */
export function fakeMondayCode() {
  const secure = new FakeSecureStore();
  const accounts = new Map<string, FakeAccountStore>();
  const accountStoreFor = (token: string): FakeAccountStore => {
    let store = accounts.get(token);
    if (!store) {
      store = new FakeAccountStore();
      accounts.set(token, store);
    }
    return store;
  };
  return { secure, accounts, accountStoreFor };
}
