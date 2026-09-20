import crypto from 'node:crypto';
import type { BoardSnapshot, TemplateRecord } from '../snapshot/types.js';
import type { AccountPlan } from '../billing/tiers.js';

/**
 * Persistence.
 *
 * In-memory here — swapping in Postgres means implementing `Storage` and
 * nothing else. The interface is deliberately narrow so that the storage rule
 * is enforceable by reading one file: **board IDs, column IDs and
 * configuration only.** Nothing in these types can hold a customer's item
 * data, and `assertNoItemData` refuses a snapshot that somehow acquired any.
 *
 * Access tokens are encrypted at rest. They are the keys to a customer's
 * entire monday account; storing them in plaintext because "it's only the dev
 * database" is how those keys end up in a backup nobody remembered.
 */

export interface StoredInstall {
  accountId: string;
  accountSlug: string;
  /** Encrypted. Never leaves this module in plaintext except via `token()`. */
  encryptedToken: string;
  installedAt: string;
}

export interface Storage {
  saveInstall(install: StoredInstall): Promise<void>;
  getInstall(accountId: string): Promise<StoredInstall | null>;
  /** Every install. Used only by the drift scheduler, which sweeps accounts. */
  listInstalls(): Promise<StoredInstall[]>;
  saveTemplate(record: TemplateRecord): Promise<void>;
  getTemplate(accountId: string, templateBoardId: string): Promise<TemplateRecord | null>;
  listTemplates(accountId: string): Promise<TemplateRecord[]>;
  deleteTemplate(accountId: string, templateBoardId: string): Promise<void>;
  /**
   * Accounts that have at least one template. The scheduler iterates these
   * rather than all installs, so an account that installed the app and never
   * designated a template costs nothing on every sweep.
   */
  listAccountIdsWithTemplates(): Promise<string[]>;
  getPlan(accountId: string): Promise<AccountPlan>;
  savePlan(plan: AccountPlan): Promise<void>;
  /**
   * Erases everything held for an account: install token, template snapshots,
   * plan. Called when monday says the app was uninstalled.
   *
   * This is a listing claim ("everything is deleted on uninstall"), which
   * means it is also a security-review claim and a data-protection one. It
   * must actually delete, not mark deleted — a soft delete would make the
   * sentence false while looking like it was true.
   */
  deleteAccount(accountId: string): Promise<void>;
}

const ALGORITHM = 'aes-256-gcm';

export class TokenCipher {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    const key = Buffer.from(base64Key, 'base64');
    if (key.length !== 32) {
      throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded. Generate: openssl rand -base64 32');
    }
    this.key = key;
  }

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
  }

  decrypt(payload: string): string {
    const [ivB64, tagB64, dataB64] = payload.split('.');
    if (!ivB64 || !tagB64 || !dataB64) throw new Error('Stored token is malformed.');
    const decipher = crypto.createDecipheriv(ALGORITHM, this.key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}

/**
 * Guards the "no customer item data" promise at the storage boundary.
 *
 * This is a listing claim and a security-review claim, so it gets a runtime
 * check rather than a code-review convention. It runs on every save: cheap
 * relative to a network round trip, and it fails loudly rather than quietly
 * persisting something we promised never to hold.
 */
const FORBIDDEN_SNAPSHOT_KEYS = ['items', 'items_page', 'column_values', 'updates', 'assets'];

export function assertNoItemData(snapshot: BoardSnapshot): void {
  const seen = new Set<unknown>();

  const walk = (value: unknown, path: string): void => {
    if (value === null || typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);

    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${path}[${i}]`));
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_SNAPSHOT_KEYS.includes(key)) {
        throw new Error(
          `Refusing to store snapshot for board ${snapshot.boardId}: it contains "${key}" at ${path}. Template Guard stores board and column configuration only — never customer item data.`,
        );
      }
      walk(child, `${path}.${key}`);
    }
  };

  walk(snapshot, 'snapshot');
}

export class InMemoryStorage implements Storage {
  private installs = new Map<string, StoredInstall>();
  private templates = new Map<string, TemplateRecord>();
  private plans = new Map<string, AccountPlan>();

  private key(accountId: string, boardId: string): string {
    return `${accountId}:${boardId}`;
  }

  async saveInstall(install: StoredInstall): Promise<void> {
    this.installs.set(install.accountId, install);
  }

  async getInstall(accountId: string): Promise<StoredInstall | null> {
    return this.installs.get(accountId) ?? null;
  }

  async listInstalls(): Promise<StoredInstall[]> {
    return [...this.installs.values()];
  }

  async saveTemplate(record: TemplateRecord): Promise<void> {
    assertNoItemData(record.snapshot);
    this.templates.set(this.key(record.accountId, record.templateBoardId), record);
  }

  async getTemplate(accountId: string, templateBoardId: string): Promise<TemplateRecord | null> {
    return this.templates.get(this.key(accountId, templateBoardId)) ?? null;
  }

  async listTemplates(accountId: string): Promise<TemplateRecord[]> {
    return [...this.templates.values()].filter((t) => t.accountId === accountId);
  }

  async deleteTemplate(accountId: string, templateBoardId: string): Promise<void> {
    this.templates.delete(this.key(accountId, templateBoardId));
  }

  async listAccountIdsWithTemplates(): Promise<string[]> {
    return [...new Set([...this.templates.values()].map((t) => t.accountId))].sort();
  }

  async getPlan(accountId: string): Promise<AccountPlan> {
    return this.plans.get(accountId) ?? { accountId, planId: 'free', renewsAt: null };
  }

  async savePlan(plan: AccountPlan): Promise<void> {
    this.plans.set(plan.accountId, plan);
  }

  async deleteAccount(accountId: string): Promise<void> {
    this.installs.delete(accountId);
    this.plans.delete(accountId);
    for (const [key, record] of this.templates) {
      if (record.accountId === accountId) this.templates.delete(key);
    }
  }
}
