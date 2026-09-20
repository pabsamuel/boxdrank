import { describe, expect, it } from 'vitest';
import { SqliteStorage, StaleSnapshotError } from '../src/server/sqlite-storage.js';
import { InMemoryStorage, TokenCipher, type Storage } from '../src/server/storage.js';
import { SNAPSHOT_SCHEMA_VERSION, type TemplateRecord } from '../src/snapshot/types.js';
import { MondayCodeStorage } from '../src/server/monday-code-storage.js';
import { fakeMondayCode } from './monday-code-fakes.js';
import { templateBoard, TEMPLATE_BOARD_ID, COPY_BOARD_ID } from './fixtures/boards.js';

/**
 * These run the same suite against both implementations.
 *
 * The point of the `Storage` interface is that swapping the database changes
 * one file. That claim is only true if both implementations actually behave
 * the same, and "actually" means tested, not asserted in a comment.
 */

function record(over: Partial<TemplateRecord> = {}): TemplateRecord {
  return {
    accountId: 'acct-1',
    templateBoardId: TEMPLATE_BOARD_ID,
    label: 'Client onboarding template',
    // Cloned: one test below deliberately poisons its snapshot, and a shared
    // fixture reference would carry that into every test after it.
    snapshot: structuredClone(templateBoard),
    linkedBoardIds: [],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...over,
  };
}

const implementations: [string, () => Storage][] = [
  ['InMemoryStorage', () => new InMemoryStorage()],
  ['SqliteStorage', () => new SqliteStorage(':memory:')],
  [
    'MondayCodeStorage',
    () => {
      const { secure, accountStoreFor } = fakeMondayCode();
      // Tokens are stored encrypted and decrypted on the way out, exactly as
      // in production; here the "cipher" is identity so the fake account
      // stores key off a readable token.
      return new MondayCodeStorage(secure, accountStoreFor, (t) => t);
    },
  ],
];

/**
 * Templates are stored in the account's own partition on monday code, which is
 * opened with that account's OAuth token — so there is nothing to open until
 * the account has installed the app. Every test that saves a template seeds
 * the install first, which is also what really happens: OAuth completes before
 * anyone designates a template.
 */
async function seedInstall(storage: Storage, accountId: string): Promise<void> {
  await storage.saveInstall({
    accountId,
    accountSlug: `slug-${accountId}`,
    encryptedToken: `token-${accountId}`,
    installedAt: '2026-09-01T00:00:00.000Z',
  });
}

describe.each(implementations)('%s', (_name, make) => {
  it('round-trips an install', async () => {
    const storage = make();
    await storage.saveInstall({
      accountId: 'acct-1',
      accountSlug: 'agency',
      encryptedToken: 'enc',
      installedAt: '2026-09-01T00:00:00.000Z',
    });

    expect(await storage.getInstall('acct-1')).toMatchObject({ accountSlug: 'agency' });
    expect(await storage.getInstall('acct-missing')).toBeNull();
  });

  it('overwrites an install on reinstall rather than accumulating them', async () => {
    const storage = make();
    const base = { accountId: 'acct-1', accountSlug: 'agency', installedAt: '2026-09-01T00:00:00.000Z' };
    await storage.saveInstall({ ...base, encryptedToken: 'old' });
    await storage.saveInstall({ ...base, encryptedToken: 'new' });

    // A stale token that outlived a reinstall is a token that fails every
    // sweep for an account that is actually fine.
    expect(await storage.getInstall('acct-1')).toMatchObject({ encryptedToken: 'new' });
  });

  it('round-trips a template snapshot without losing structure', async () => {
    const storage = make();
    await seedInstall(storage, 'acct-1');
    await storage.saveTemplate(record({ linkedBoardIds: [COPY_BOARD_ID] }));

    const got = await storage.getTemplate('acct-1', TEMPLATE_BOARD_ID);
    expect(got).not.toBeNull();
    expect(got!.linkedBoardIds).toEqual([COPY_BOARD_ID]);
    expect(got!.snapshot.columns).toHaveLength(templateBoard.columns.length);
    expect(got!.snapshot.columns[0]).toEqual(templateBoard.columns[0]);
  });

  it('scopes templates to their account', async () => {
    const storage = make();
    await seedInstall(storage, 'acct-1');
    await seedInstall(storage, 'acct-2');
    await storage.saveTemplate(record({ accountId: 'acct-1' }));
    await storage.saveTemplate(record({ accountId: 'acct-2' }));

    expect(await storage.listTemplates('acct-1')).toHaveLength(1);
    expect(await storage.getTemplate('acct-2', TEMPLATE_BOARD_ID)).not.toBeNull();
  });

  it('deletes a template', async () => {
    const storage = make();
    await seedInstall(storage, 'acct-1');
    await storage.saveTemplate(record());
    await storage.deleteTemplate('acct-1', TEMPLATE_BOARD_ID);
    expect(await storage.listTemplates('acct-1')).toEqual([]);
  });

  it('lists only accounts that have templates — the scheduler sweeps these', async () => {
    const storage = make();
    await storage.saveInstall({
      accountId: 'acct-no-templates',
      accountSlug: 'x',
      encryptedToken: 'e',
      installedAt: '2026-09-01T00:00:00.000Z',
    });
    await seedInstall(storage, 'acct-a');
    await seedInstall(storage, 'acct-b');
    await storage.saveTemplate(record({ accountId: 'acct-b' }));
    await storage.saveTemplate(record({ accountId: 'acct-a' }));

    expect(await storage.listAccountIdsWithTemplates()).toEqual(['acct-a', 'acct-b']);
  });

  it('defaults an unknown account to the free plan', async () => {
    const storage = make();
    expect(await storage.getPlan('nobody')).toEqual({ accountId: 'nobody', planId: 'free', renewsAt: null });
  });

  it('round-trips a plan', async () => {
    const storage = make();
    await storage.savePlan({ accountId: 'acct-1', planId: 'pro', renewsAt: '2026-10-01T00:00:00.000Z' });
    expect(await storage.getPlan('acct-1')).toMatchObject({ planId: 'pro' });
  });

  it('erases everything for an account on uninstall — a listing claim, so a real delete', async () => {
    const storage = make();
    await storage.saveInstall({
      accountId: 'acct-1',
      accountSlug: 'agency',
      encryptedToken: 'enc',
      installedAt: '2026-09-01T00:00:00.000Z',
    });
    await storage.savePlan({ accountId: 'acct-1', planId: 'pro', renewsAt: null });
    await seedInstall(storage, 'acct-2');
    await storage.saveTemplate(record({ accountId: 'acct-1' }));
    await storage.saveTemplate(record({ accountId: 'acct-2' }));

    await storage.deleteAccount('acct-1');

    expect(await storage.getInstall('acct-1')).toBeNull();
    expect((await storage.getPlan('acct-1')).planId).toBe('free');
    // Out of the sweep, so a purged account is never checked again.
    expect(await storage.listAccountIdsWithTemplates()).not.toContain('acct-1');
    // Another account's data must be untouched.
    expect(await storage.listTemplates('acct-2')).toHaveLength(1);
  });

  it('refuses to store a snapshot carrying customer item data', async () => {
    const storage = make();
    await seedInstall(storage, 'acct-1');
    const poisoned = record();
    (poisoned.snapshot as unknown as Record<string, unknown>).items = [{ name: "Client's private deal" }];

    await expect(storage.saveTemplate(poisoned)).rejects.toThrow(/never customer item data/);
  });
});

describe('SqliteStorage specifics', () => {
  it('persists across connections to the same file', async () => {
    const file = `${process.env.TMPDIR ?? '/tmp'}/tg-test-${process.pid}-${Date.now()}.db`;
    const first = new SqliteStorage(file);
    await first.saveInstall({
      accountId: 'acct-1',
      accountSlug: 'agency',
      encryptedToken: 'enc',
      installedAt: '2026-09-01T00:00:00.000Z',
    });
    await first.saveTemplate(record());
    first.close();

    const second = new SqliteStorage(file);
    expect(await second.getTemplate('acct-1', TEMPLATE_BOARD_ID)).not.toBeNull();
    second.close();
  });

  it('refuses a snapshot written by an older schema instead of diffing it blindly', async () => {
    const storage = new SqliteStorage(':memory:');
    const stale = record();
    stale.snapshot = { ...structuredClone(templateBoard), schemaVersion: SNAPSHOT_SCHEMA_VERSION - 1 };
    await storage.saveTemplate(stale);

    // A silently-downgraded comparison would report findings that are
    // artefacts of our own schema change. Better to refuse and re-snapshot.
    await expect(storage.getTemplate('acct-1', TEMPLATE_BOARD_ID)).rejects.toThrow(StaleSnapshotError);
    storage.close();
  });

  it('degrades an unrecognised plan id to free rather than granting paid features', async () => {
    const storage = new SqliteStorage(':memory:');
    await storage.savePlan({ accountId: 'acct-1', planId: 'enterprise' as never, renewsAt: null });
    expect((await storage.getPlan('acct-1')).planId).toBe('free');
    storage.close();
  });
});

describe('TokenCipher', () => {
  const key = Buffer.alloc(32, 7).toString('base64');

  it('round-trips a token', () => {
    const cipher = new TokenCipher(key);
    expect(cipher.decrypt(cipher.encrypt('monday-token'))).toBe('monday-token');
  });

  it('rejects a key that is not 32 bytes', () => {
    expect(() => new TokenCipher(Buffer.alloc(16).toString('base64'))).toThrow(/32 bytes/);
  });

  it('fails on a tampered ciphertext rather than returning garbage', () => {
    const cipher = new TokenCipher(key);
    const [iv, tag, data] = cipher.encrypt('monday-token').split('.');
    const flipped = Buffer.from(data!, 'base64');
    flipped[0] = (flipped[0] ?? 0) ^ 0xff;
    expect(() => cipher.decrypt([iv, tag, flipped.toString('base64')].join('.'))).toThrow();
  });
});

describe('MondayCodeStorage specifics', () => {
  function make() {
    const { secure, accountStoreFor } = fakeMondayCode();
    const storage = new MondayCodeStorage(secure, accountStoreFor, (t) => t);
    return { storage, secure, accountStoreFor };
  }

  async function install(storage: MondayCodeStorage, accountId = 'acct-1') {
    await storage.saveInstall({
      accountId,
      accountSlug: 'agency',
      encryptedToken: `token-${accountId}`,
      installedAt: '2026-09-01T00:00:00.000Z',
    });
  }

  it('keeps install tokens and the index in secure storage, snapshots in the account partition', async () => {
    const { storage, secure, accountStoreFor } = make();
    await install(storage);
    await storage.saveTemplate(record());

    // App-scoped: readable without an account token, which is what lets the
    // drift sweep start at all.
    expect([...secure.data.keys()]).toEqual(
      expect.arrayContaining(['install:acct-1', 'accounts-with-templates']),
    );
    // Account-scoped: the customer's snapshot stays in the customer's partition.
    expect([...accountStoreFor('token-acct-1').data.keys()]).toEqual([
      `template:${TEMPLATE_BOARD_ID}`,
    ]);
    expect([...secure.data.keys()].some((k) => k.startsWith('template:'))).toBe(false);
  });

  it('throws when secure storage reports a failed write instead of losing it silently', async () => {
    const { storage, secure } = make();
    secure.failWrites.add('install:acct-1');

    // The SDK answers `set` with a boolean. An unchecked call here is an
    // invisible lost write, which for this product is the worst class of bug.
    await expect(install(storage)).rejects.toThrow(/rejected the install record write/);
  });

  it('fails loudly when the account index cannot be written, rather than dropping the account from the sweep', async () => {
    const { storage, secure } = make();
    await install(storage);
    secure.failWrites.add('accounts-with-templates');

    await expect(storage.saveTemplate(record())).rejects.toThrow(/account index/);
  });

  it('refuses to open account storage for an account that never installed', async () => {
    const { storage } = make();
    // Account storage is opened with that account's own OAuth token, so this
    // is genuinely "we cannot look", not "there is nothing there".
    await expect(storage.listTemplates('stranger')).rejects.toThrow(/not installed on this account/);
  });

  it('walks every search page rather than returning the first one', async () => {
    const { storage, accountStoreFor } = make();
    await install(storage);
    accountStoreFor('token-acct-1').pageSize = 2;

    for (const boardId of ['b1', 'b2', 'b3', 'b4', 'b5']) {
      await storage.saveTemplate(record({ templateBoardId: boardId }));
    }

    expect(await storage.listTemplates('acct-1')).toHaveLength(5);
  });

  it('surfaces a failed search instead of reporting an empty template list', async () => {
    const { storage, accountStoreFor } = make();
    await install(storage);
    await storage.saveTemplate(record());
    accountStoreFor('token-acct-1').failNextSearch = true;

    // "You have no templates" and "we could not read your templates" are
    // different sentences, and only one of them is safe to guess at.
    await expect(storage.listTemplates('acct-1')).rejects.toThrow(/Could not list templates/);
  });

  it('drops an account from the index once its last template is deleted', async () => {
    const { storage } = make();
    await install(storage);
    await storage.saveTemplate(record());
    expect(await storage.listAccountIdsWithTemplates()).toEqual(['acct-1']);

    await storage.deleteTemplate('acct-1', TEMPLATE_BOARD_ID);
    expect(await storage.listAccountIdsWithTemplates()).toEqual([]);
  });

  it('does not index the same account twice', async () => {
    const { storage } = make();
    await install(storage);
    await storage.saveTemplate(record({ templateBoardId: 'b1' }));
    await storage.saveTemplate(record({ templateBoardId: 'b2' }));

    expect(await storage.listAccountIdsWithTemplates()).toEqual(['acct-1']);
  });

  it('purges the account partition on uninstall, not just the app-level keys', async () => {
    const { storage, secure, accountStoreFor } = make();
    await install(storage);
    await storage.saveTemplate(record());

    await storage.deleteAccount('acct-1');

    expect(accountStoreFor('token-acct-1').data.size).toBe(0);
    expect(secure.data.has('install:acct-1')).toBe(false);
    expect(await storage.listAccountIdsWithTemplates()).toEqual([]);
  });
});
