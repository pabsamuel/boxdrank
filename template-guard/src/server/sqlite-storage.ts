import { createRequire } from 'node:module';
import type { AccountPlan, PlanId } from '../billing/tiers.js';
import type { BoardSnapshot, TemplateRecord } from '../snapshot/types.js';
import { SNAPSHOT_SCHEMA_VERSION } from '../snapshot/types.js';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  assertNoItemData,
  type NotificationSettings,
  type SweepCheckpoint,
  type Storage,
  type StoredInstall,
} from './storage.js';

/**
 * Durable storage.
 *
 * `InMemoryStorage` loses every install token on restart, which means every
 * customer has to reinstall the app after a deploy. That is not a rough edge,
 * it is an outage. This is the same `Storage` interface against a real
 * database — and it is deliberately the *only* thing that changed. If the
 * interface had leaked into the diff engine or the server handlers, this file
 * could not exist without touching twenty others.
 *
 * ## Why SQLite, and what it costs
 *
 * One ops person per account, a handful of template snapshots each, writes
 * measured in dozens per day. That is not a Postgres workload; it is a file.
 * A single-file database also keeps the security conversation short — there is
 * no database server listening on a port, no connection string in a second
 * place, and a backup is `cp`.
 *
 * The cost, stated plainly rather than discovered later: `node:sqlite` is
 * marked **experimental** by Node, one process owns the file, and horizontal
 * scaling is not available. Two of those stop mattering the moment this moves
 * to Postgres, which is a new file implementing this same interface and
 * nothing else. See ADR-013.
 *
 * ## The storage rule
 *
 * Snapshots are stored as JSON, so the "no customer item data" promise cannot
 * be enforced by the column types. `assertNoItemData` therefore runs on every
 * write, before serialisation. A guarantee that depends on nobody ever adding
 * a field to a type is not a guarantee.
 */

/**
 * Loaded through `createRequire` rather than a static import.
 *
 * Bundlers that do not yet know `node:sqlite` try to resolve it as a package
 * and fail at build time — including the one that runs the test suite. This
 * keeps the resolution at runtime, where Node answers it correctly, and costs
 * nothing: the server is not bundled.
 */
type DatabaseSyncCtor = new (path: string) => SqliteDatabase;

interface SqliteStatement {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: DatabaseSyncCtor;
};

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS installs (
     account_id     TEXT PRIMARY KEY,
     account_slug   TEXT NOT NULL,
     encrypted_token TEXT NOT NULL,
     installed_at   TEXT NOT NULL
   );`,
  `CREATE TABLE IF NOT EXISTS templates (
     account_id       TEXT NOT NULL,
     template_board_id TEXT NOT NULL,
     label            TEXT NOT NULL,
     snapshot_json    TEXT NOT NULL,
     snapshot_version INTEGER NOT NULL,
     linked_board_ids TEXT NOT NULL,
     created_at       TEXT NOT NULL,
     updated_at       TEXT NOT NULL,
     PRIMARY KEY (account_id, template_board_id)
   );`,
  `CREATE TABLE IF NOT EXISTS plans (
     account_id TEXT PRIMARY KEY,
     plan_id    TEXT NOT NULL,
     renews_at  TEXT
   );`,
  `CREATE INDEX IF NOT EXISTS templates_by_account ON templates (account_id);`,
  `ALTER TABLE installs ADD COLUMN installed_by_user_id TEXT;`,
  `CREATE TABLE IF NOT EXISTS app_state (
     key   TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );`,
  `CREATE TABLE IF NOT EXISTS notification_settings (
     account_id     TEXT PRIMARY KEY,
     monday_user_id TEXT,
     webhook_url    TEXT,
     enabled        INTEGER NOT NULL DEFAULT 1
   );`,
];

/**
 * Migrations run in order on every start and must be idempotent.
 *
 * `CREATE TABLE IF NOT EXISTS` is. `ALTER TABLE ADD COLUMN` is not — SQLite
 * raises "duplicate column name" the second time. That specific error means
 * the migration already ran, so it is swallowed *by name*; anything else is a
 * real problem and still throws. A blanket try/catch around migrations would
 * hide a genuinely broken schema behind a working-looking start-up.
 */
function isAlreadyApplied(err: unknown): boolean {
  return err instanceof Error && /duplicate column name/i.test(err.message);
}

interface InstallRow {
  account_id: string;
  account_slug: string;
  encrypted_token: string;
  installed_at: string;
  installed_by_user_id: string | null;
}

interface NotificationRow {
  account_id: string;
  monday_user_id: string | null;
  webhook_url: string | null;
  enabled: number;
}

interface TemplateRow {
  account_id: string;
  template_board_id: string;
  label: string;
  snapshot_json: string;
  snapshot_version: number;
  linked_board_ids: string;
  created_at: string;
  updated_at: string;
}

interface PlanRow {
  account_id: string;
  plan_id: string;
  renews_at: string | null;
}

export class SqliteStorage implements Storage {
  private readonly db: SqliteDatabase;

  /** @param filename a path, or `:memory:` for tests. */
  constructor(filename: string) {
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    for (const migration of MIGRATIONS) {
      try {
        this.db.exec(migration);
      } catch (err) {
        if (!isAlreadyApplied(err)) throw err;
      }
    }
  }

  close(): void {
    this.db.close();
  }

  async saveInstall(install: StoredInstall): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO installs (account_id, account_slug, encrypted_token, installed_at, installed_by_user_id)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(account_id) DO UPDATE SET
           account_slug = excluded.account_slug,
           encrypted_token = excluded.encrypted_token,
           installed_at = excluded.installed_at,
           installed_by_user_id = excluded.installed_by_user_id`,
      )
      .run(
        install.accountId,
        install.accountSlug,
        install.encryptedToken,
        install.installedAt,
        install.installedByUserId ?? null,
      );
  }

  async getInstall(accountId: string): Promise<StoredInstall | null> {
    const row = this.db
      .prepare(`SELECT * FROM installs WHERE account_id = ?`)
      .get(accountId) as InstallRow | undefined;
    return row ? toInstall(row) : null;
  }

  async saveTemplate(record: TemplateRecord): Promise<void> {
    // Before serialisation, deliberately: once this is a JSON string the
    // forbidden keys are invisible to every later check.
    assertNoItemData(record.snapshot);

    this.db
      .prepare(
        `INSERT INTO templates
           (account_id, template_board_id, label, snapshot_json, snapshot_version,
            linked_board_ids, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(account_id, template_board_id) DO UPDATE SET
           label = excluded.label,
           snapshot_json = excluded.snapshot_json,
           snapshot_version = excluded.snapshot_version,
           linked_board_ids = excluded.linked_board_ids,
           updated_at = excluded.updated_at`,
      )
      .run(
        record.accountId,
        record.templateBoardId,
        record.label,
        JSON.stringify(record.snapshot),
        record.snapshot.schemaVersion,
        JSON.stringify(record.linkedBoardIds),
        record.createdAt,
        record.updatedAt,
      );
  }

  async getTemplate(accountId: string, templateBoardId: string): Promise<TemplateRecord | null> {
    const row = this.db
      .prepare(`SELECT * FROM templates WHERE account_id = ? AND template_board_id = ?`)
      .get(accountId, templateBoardId) as TemplateRow | undefined;
    return row ? toTemplate(row) : null;
  }

  async listTemplates(accountId: string): Promise<TemplateRecord[]> {
    const rows = this.db
      .prepare(`SELECT * FROM templates WHERE account_id = ? ORDER BY created_at`)
      .all(accountId) as unknown as TemplateRow[];
    return rows.map(toTemplate);
  }

  async deleteTemplate(accountId: string, templateBoardId: string): Promise<void> {
    this.db
      .prepare(`DELETE FROM templates WHERE account_id = ? AND template_board_id = ?`)
      .run(accountId, templateBoardId);
  }

  async listAccountIdsWithTemplates(): Promise<string[]> {
    const rows = this.db
      .prepare(`SELECT DISTINCT account_id FROM templates ORDER BY account_id`)
      .all() as unknown as { account_id: string }[];
    return rows.map((r) => r.account_id);
  }

  async getPlan(accountId: string): Promise<AccountPlan> {
    const row = this.db
      .prepare(`SELECT * FROM plans WHERE account_id = ?`)
      .get(accountId) as PlanRow | undefined;
    if (!row) return { accountId, planId: 'free', renewsAt: null };
    return {
      accountId: row.account_id,
      // An unrecognised plan id degrades to `free`. The alternative — trusting
      // whatever string is in the row — would hand out paid features on a typo.
      planId: row.plan_id === 'pro' ? 'pro' : ('free' as PlanId),
      renewsAt: row.renews_at,
    };
  }

  async savePlan(plan: AccountPlan): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO plans (account_id, plan_id, renews_at) VALUES (?, ?, ?)
         ON CONFLICT(account_id) DO UPDATE SET
           plan_id = excluded.plan_id,
           renews_at = excluded.renews_at`,
      )
      .run(plan.accountId, plan.planId, plan.renewsAt);
  }

  async getNotificationSettings(accountId: string): Promise<NotificationSettings> {
    const row = this.db
      .prepare(`SELECT * FROM notification_settings WHERE account_id = ?`)
      .get(accountId) as NotificationRow | undefined;
    if (!row) return DEFAULT_NOTIFICATION_SETTINGS(accountId);
    return {
      accountId: row.account_id,
      mondayUserId: row.monday_user_id,
      webhookUrl: row.webhook_url,
      enabled: row.enabled === 1,
    };
  }

  async saveNotificationSettings(settings: NotificationSettings): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO notification_settings (account_id, monday_user_id, webhook_url, enabled)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(account_id) DO UPDATE SET
           monday_user_id = excluded.monday_user_id,
           webhook_url = excluded.webhook_url,
           enabled = excluded.enabled`,
      )
      .run(settings.accountId, settings.mondayUserId, settings.webhookUrl, settings.enabled ? 1 : 0);
  }

  async getSweepCheckpoint(): Promise<SweepCheckpoint | null> {
    const row = this.db
      .prepare(`SELECT value FROM app_state WHERE key = 'sweep_checkpoint'`)
      .get() as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as SweepCheckpoint) : null;
  }

  async saveSweepCheckpoint(checkpoint: SweepCheckpoint | null): Promise<void> {
    if (checkpoint === null) {
      this.db.prepare(`DELETE FROM app_state WHERE key = 'sweep_checkpoint'`).run();
      return;
    }
    this.db
      .prepare(
        `INSERT INTO app_state (key, value) VALUES ('sweep_checkpoint', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(JSON.stringify(checkpoint));
  }

  async deleteAccount(accountId: string): Promise<void> {
    // One transaction: a partial purge that left the token behind while
    // deleting the snapshots would be the worst of both outcomes.
    this.db.exec('BEGIN');
    try {
      this.db.prepare(`DELETE FROM templates WHERE account_id = ?`).run(accountId);
      this.db.prepare(`DELETE FROM plans WHERE account_id = ?`).run(accountId);
      this.db.prepare(`DELETE FROM notification_settings WHERE account_id = ?`).run(accountId);
      this.db.prepare(`DELETE FROM installs WHERE account_id = ?`).run(accountId);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
}

function toInstall(row: InstallRow): StoredInstall {
  return {
    accountId: row.account_id,
    accountSlug: row.account_slug,
    encryptedToken: row.encrypted_token,
    installedAt: row.installed_at,
    installedByUserId: row.installed_by_user_id ?? undefined,
  };
}

function toTemplate(row: TemplateRow): TemplateRecord {
  const snapshot = JSON.parse(row.snapshot_json) as BoardSnapshot;

  // A snapshot written by an older build of this app may be missing fields the
  // current diff engine reads. Diffing it anyway would produce findings that
  // are artefacts of the schema change, not of anything the user did — the
  // exact class of false alarm this product cannot afford. So it is refused,
  // loudly, and the caller re-snapshots.
  if (snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    throw new StaleSnapshotError(row.account_id, row.template_board_id, snapshot.schemaVersion);
  }

  return {
    accountId: row.account_id,
    templateBoardId: row.template_board_id,
    label: row.label,
    snapshot,
    linkedBoardIds: JSON.parse(row.linked_board_ids) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class StaleSnapshotError extends Error {
  constructor(
    readonly accountId: string,
    readonly templateBoardId: string,
    readonly foundVersion: number,
  ) {
    super(
      `The saved snapshot for board ${templateBoardId} was written by an older version of Template Guard (schema ${foundVersion}, current ${SNAPSHOT_SCHEMA_VERSION}). Re-designate the template to refresh it. Template Guard will not compare against a snapshot it cannot read in full.`,
    );
    this.name = 'StaleSnapshotError';
  }
}
