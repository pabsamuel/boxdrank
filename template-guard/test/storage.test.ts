import { describe, expect, it } from 'vitest';
import { SqliteStorage, StaleSnapshotError } from '../src/server/sqlite-storage.js';
import { InMemoryStorage, TokenCipher, type Storage } from '../src/server/storage.js';
import { SNAPSHOT_SCHEMA_VERSION, type TemplateRecord } from '../src/snapshot/types.js';
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
];

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

  it('overwrites an install on reinstall rather than duplicating it', async () => {
    const storage = make();
    const base = { accountId: 'acct-1', accountSlug: 'agency', installedAt: '2026-09-01T00:00:00.000Z' };
    await storage.saveInstall({ ...base, encryptedToken: 'old' });
    await storage.saveInstall({ ...base, encryptedToken: 'new' });

    expect(await storage.getInstall('acct-1')).toMatchObject({ encryptedToken: 'new' });
    expect(await storage.listInstalls()).toHaveLength(1);
  });

  it('round-trips a template snapshot without losing structure', async () => {
    const storage = make();
    await storage.saveTemplate(record({ linkedBoardIds: [COPY_BOARD_ID] }));

    const got = await storage.getTemplate('acct-1', TEMPLATE_BOARD_ID);
    expect(got).not.toBeNull();
    expect(got!.linkedBoardIds).toEqual([COPY_BOARD_ID]);
    expect(got!.snapshot.columns).toHaveLength(templateBoard.columns.length);
    expect(got!.snapshot.columns[0]).toEqual(templateBoard.columns[0]);
  });

  it('scopes templates to their account', async () => {
    const storage = make();
    await storage.saveTemplate(record({ accountId: 'acct-1' }));
    await storage.saveTemplate(record({ accountId: 'acct-2' }));

    expect(await storage.listTemplates('acct-1')).toHaveLength(1);
    expect(await storage.getTemplate('acct-2', TEMPLATE_BOARD_ID)).not.toBeNull();
    expect(await storage.getTemplate('acct-3', TEMPLATE_BOARD_ID)).toBeNull();
  });

  it('deletes a template', async () => {
    const storage = make();
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
    await storage.saveTemplate(record({ accountId: 'acct-1' }));
    await storage.saveTemplate(record({ accountId: 'acct-2' }));

    await storage.deleteAccount('acct-1');

    expect(await storage.getInstall('acct-1')).toBeNull();
    expect(await storage.listTemplates('acct-1')).toEqual([]);
    expect((await storage.getPlan('acct-1')).planId).toBe('free');
    // Another account's data must be untouched.
    expect(await storage.listTemplates('acct-2')).toHaveLength(1);
  });

  it('refuses to store a snapshot carrying customer item data', async () => {
    const storage = make();
    const poisoned = record();
    (poisoned.snapshot as unknown as Record<string, unknown>).items = [{ name: "Client's private deal" }];

    await expect(storage.saveTemplate(poisoned)).rejects.toThrow(/never customer item data/);
  });
});

describe('SqliteStorage specifics', () => {
  it('persists across connections to the same file', async () => {
    const file = `${process.env.TMPDIR ?? '/tmp'}/tg-test-${process.pid}-${Date.now()}.db`;
    const first = new SqliteStorage(file);
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
