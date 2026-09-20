import { TemplateGuardError } from '../api/errors.js';
import type { AccountPlan } from '../billing/tiers.js';
import type { BoardSnapshot, TemplateRecord } from '../snapshot/types.js';
import { SNAPSHOT_SCHEMA_VERSION } from '../snapshot/types.js';
import { StaleSnapshotError } from './sqlite-storage.js';
import { assertNoItemData, type Storage, type StoredInstall } from './storage.js';

/**
 * `Storage` implemented on monday code.
 *
 * Third implementation of the same interface, after in-memory and SQLite. The
 * interface has now paid for itself twice: nothing outside this file changes,
 * and `test/storage.test.ts` runs the identical suite against all three.
 *
 * ## The two storages, and why the split is not arbitrary
 *
 * monday code gives us two, and they differ in *scope*, which the SDK's own
 * constructors make plain:
 *
 * - `SecureStorage` takes **no token**. It is scoped to the app. Encrypted,
 *   compartmentalised per app, unreachable from another app.
 * - `Storage` takes **an account's OAuth token**. Everything it holds is
 *   scoped to that account, and `search()` only ever walks that account's keys.
 *
 * That split decides the whole layout, and it is the answer to the question
 * `docs/08-monday-code.md` said had to be answered first:
 *
 * | What | Where | Why |
 * |---|---|---|
 * | Install records (the access token) | SecureStorage | Sensitive, and needed *before* we have a token to open account storage with |
 * | The account index | SecureStorage | The drift sweep must enumerate accounts, which no account-scoped store can do |
 * | Plans | SecureStorage | Read by the sweep, which has no account token until it reads the install |
 * | Template snapshots | account `Storage` | Belongs to the customer, stays in their partition, and `search()` lists them |
 *
 * ## Failing loudly, against an SDK that does not throw
 *
 * Every `Storage` method returns `{ success, error }` rather than throwing. A
 * caller that ignores that shape gets a *silent* failed write — an app that
 * says "template saved" and saved nothing. For a product whose entire claim is
 * "we tell you what silently broke", that is the worst available bug, so every
 * call here is checked and converted into a thrown `TemplateGuardError`.
 *
 * ✱ UNVERIFIED — never run against monday code. The SDK's type definitions are
 * ground truth for the *signatures* (they were read from the installed
 * package, not guessed), but not for behaviour: per-key size limits, whether
 * `search` needs a key prefix convention, and the Secure Storage rate limit of
 * 7 req/s in practice. See `docs/08-monday-code.md` and ADR-020.
 */

/** The subset of the SDK's `SecureStorage` this uses. App-scoped. */
export interface SecureStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<boolean>;
  delete(key: string): Promise<boolean>;
}

/** The subset of the SDK's `Storage` this uses. Account-scoped, token-bound. */
export interface AccountStore {
  get<T>(key: string): Promise<{ value: T | null; success: boolean; error?: string }>;
  set(key: string, value: unknown): Promise<{ success: boolean; error?: string }>;
  delete(key: string): Promise<{ success: boolean; error?: string }>;
  search<T>(
    key: string,
    options?: { cursor?: string },
  ): Promise<{
    records: { key: string; value: T }[] | null;
    cursor?: string;
    success: boolean;
    error?: string;
  }>;
}

const INSTALL_PREFIX = 'install:';
const PLAN_PREFIX = 'plan:';
const TEMPLATE_PREFIX = 'template:';
/**
 * The app-level list of accounts that have at least one template.
 *
 * This exists because account-scoped storage cannot be enumerated across
 * accounts — which is a security property, not an obstacle to route around.
 * The index is the price of keeping the drift sweep possible, and it is
 * maintained on every template write and every account deletion.
 */
const ACCOUNT_INDEX_KEY = 'accounts-with-templates';

/** How many `search` pages to walk before refusing to keep going. */
const MAX_SEARCH_PAGES = 50;

export class MondayCodeStorage implements Storage {
  constructor(
    private readonly secure: SecureStore,
    /** Opens account-scoped storage with that account's access token. */
    private readonly accountStoreFor: (token: string) => AccountStore,
    /**
     * Decrypts a stored install token. Tokens are encrypted by us *and* held
     * in Secure Storage: two locks, because the cost is one function call and
     * the failure being defended against is the loss of a customer's entire
     * monday account.
     */
    private readonly decryptToken: (encrypted: string) => string,
  ) {}

  // --- Installs (app-scoped) ------------------------------------------------

  async saveInstall(install: StoredInstall): Promise<void> {
    await this.secureSet(`${INSTALL_PREFIX}${install.accountId}`, install, 'install record');
  }

  async getInstall(accountId: string): Promise<StoredInstall | null> {
    return this.secure.get<StoredInstall>(`${INSTALL_PREFIX}${accountId}`);
  }

  // --- Plans (app-scoped) ---------------------------------------------------

  async getPlan(accountId: string): Promise<AccountPlan> {
    const stored = await this.secure.get<AccountPlan>(`${PLAN_PREFIX}${accountId}`);
    if (!stored) return { accountId, planId: 'free', renewsAt: null };
    return {
      accountId: stored.accountId,
      // Same rule as every other storage implementation: an unrecognised plan
      // id degrades to free rather than granting paid features on a typo.
      planId: stored.planId === 'pro' ? 'pro' : 'free',
      renewsAt: stored.renewsAt ?? null,
    };
  }

  async savePlan(plan: AccountPlan): Promise<void> {
    await this.secureSet(`${PLAN_PREFIX}${plan.accountId}`, plan, 'plan');
  }

  // --- Templates (account-scoped) -------------------------------------------

  async saveTemplate(record: TemplateRecord): Promise<void> {
    assertNoItemData(record.snapshot);

    const store = await this.openAccount(record.accountId);
    const result = await store.set(`${TEMPLATE_PREFIX}${record.templateBoardId}`, record);
    if (!result.success) {
      throw new TemplateGuardError(
        `Could not save the template for board ${record.templateBoardId}: ${result.error ?? 'monday storage rejected the write.'}`,
        'transport',
      );
    }

    // Index last, and its failure is loud. If the record saved but the index
    // did not, this account silently stops being swept — a monitoring product
    // that quietly stops monitoring, which is the one failure this codebase
    // exists to refuse. Better a visible error the user can retry.
    await this.addToIndex(record.accountId);
  }

  async getTemplate(accountId: string, templateBoardId: string): Promise<TemplateRecord | null> {
    const store = await this.openAccount(accountId);
    const result = await store.get<TemplateRecord>(`${TEMPLATE_PREFIX}${templateBoardId}`);

    if (!result.success) {
      throw new TemplateGuardError(
        `Could not read the saved template for board ${templateBoardId}: ${result.error ?? 'monday storage returned an error.'}`,
        'transport',
      );
    }
    if (!result.value) return null;
    return this.validate(result.value, accountId, templateBoardId);
  }

  async listTemplates(accountId: string): Promise<TemplateRecord[]> {
    const store = await this.openAccount(accountId);
    const out: TemplateRecord[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < MAX_SEARCH_PAGES; page += 1) {
      const result = await store.search<TemplateRecord>(TEMPLATE_PREFIX, { cursor });
      if (!result.success) {
        throw new TemplateGuardError(
          `Could not list templates for this account: ${result.error ?? 'monday storage returned an error.'}`,
          'transport',
        );
      }

      for (const record of result.records ?? []) {
        out.push(this.validate(record.value, accountId, record.key));
      }

      if (!result.cursor) return out;
      cursor = result.cursor;
    }

    // A truncated list would read as "you have fewer templates than you do",
    // and this app never returns a short list quietly.
    throw new TemplateGuardError(
      `This account has more saved templates than Template Guard reads in one pass (${MAX_SEARCH_PAGES} pages). Refusing to show a partial list.`,
      'unexpected_shape',
    );
  }

  async deleteTemplate(accountId: string, templateBoardId: string): Promise<void> {
    const store = await this.openAccount(accountId);
    const result = await store.delete(`${TEMPLATE_PREFIX}${templateBoardId}`);
    if (!result.success) {
      throw new TemplateGuardError(
        `Could not delete the template for board ${templateBoardId}: ${result.error ?? 'monday storage rejected the delete.'}`,
        'transport',
      );
    }

    // Drop out of the index once nothing is left, so the sweep stops paying
    // for an account with nothing to check.
    const remaining = await this.listTemplates(accountId);
    if (remaining.length === 0) await this.removeFromIndex(accountId);
  }

  // --- The index ------------------------------------------------------------

  async listAccountIdsWithTemplates(): Promise<string[]> {
    const ids = await this.secure.get<string[]>(ACCOUNT_INDEX_KEY);
    return Array.isArray(ids) ? [...ids].sort() : [];
  }

  private async addToIndex(accountId: string): Promise<void> {
    const ids = await this.listAccountIdsWithTemplates();
    if (ids.includes(accountId)) return;
    await this.secureSet(ACCOUNT_INDEX_KEY, [...ids, accountId], 'account index');
  }

  private async removeFromIndex(accountId: string): Promise<void> {
    const ids = await this.listAccountIdsWithTemplates();
    if (!ids.includes(accountId)) return;
    await this.secureSet(
      ACCOUNT_INDEX_KEY,
      ids.filter((id) => id !== accountId),
      'account index',
    );
  }

  // --- Uninstall ------------------------------------------------------------

  /**
   * Erases everything for an account. A listing claim (ADR-019), so it deletes
   * rather than marks.
   *
   * Order matters. The index goes first: if a later step fails, the account is
   * already out of the sweep and cannot be half-monitored. The install token
   * goes last, because every template delete needs it to open account storage
   * — removing it first would strand the snapshots permanently.
   */
  async deleteAccount(accountId: string): Promise<void> {
    await this.removeFromIndex(accountId);

    const install = await this.getInstall(accountId);
    if (install) {
      const store = this.accountStoreFor(this.decryptToken(install.encryptedToken));
      let cursor: string | undefined;

      for (let page = 0; page < MAX_SEARCH_PAGES; page += 1) {
        const result = await store.search<TemplateRecord>(TEMPLATE_PREFIX, { cursor });
        if (!result.success) break;
        for (const record of result.records ?? []) await store.delete(record.key);
        if (!result.cursor) break;
        cursor = result.cursor;
      }
    }

    await this.secure.delete(`${PLAN_PREFIX}${accountId}`);
    await this.secure.delete(`${INSTALL_PREFIX}${accountId}`);
  }

  // --- Helpers --------------------------------------------------------------

  private async openAccount(accountId: string): Promise<AccountStore> {
    const install = await this.getInstall(accountId);
    if (!install) {
      // Account storage is opened with the account's own OAuth token, so
      // without an install there is nothing to open — not an empty account.
      throw new TemplateGuardError(
        'Template Guard is not installed on this account, or its access was revoked. Please reinstall it from the monday marketplace.',
        'permission_denied',
      );
    }
    return this.accountStoreFor(this.decryptToken(install.encryptedToken));
  }

  private async secureSet(key: string, value: unknown, what: string): Promise<void> {
    const ok = await this.secure.set(key, value as never);
    if (!ok) {
      // `set` answers with a boolean, so an unchecked call is an invisible
      // lost write. There is no version of this app where that is acceptable.
      throw new TemplateGuardError(
        `monday's secure storage rejected the ${what} write. Nothing was saved.`,
        'transport',
      );
    }
  }

  private validate(record: TemplateRecord, accountId: string, key: string): TemplateRecord {
    const snapshot = record.snapshot as BoardSnapshot | undefined;
    if (!snapshot || snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
      throw new StaleSnapshotError(accountId, record.templateBoardId ?? key, snapshot?.schemaVersion ?? -1);
    }
    return record;
  }
}
