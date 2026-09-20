import { describe, expect, it } from 'vitest';
import { MondayClient } from '../src/api/client.js';
import { DriftScheduler, type DriftNotification, type NotificationSink } from '../src/drift/scheduler.js';
import { InMemoryStorage, TokenCipher } from '../src/server/storage.js';
import type { TemplateRecord } from '../src/snapshot/types.js';
import { COPY_BOARD_ID, TEMPLATE_BOARD_ID, cleanCopy, copyWith, templateBoard } from './fixtures/boards.js';

/**
 * The scheduler is where a monitoring product quietly dies: a sweep that
 * throws once and never runs again, a free account counted as "checked", an
 * overlapping run that doubles API load until monday throttles the app.
 *
 * So these tests are mostly about what happens when things go wrong. The happy
 * path is one test; the rest are failures that must stay visible.
 */

const KEY = Buffer.alloc(32, 3).toString('base64');
const cipher = new TokenCipher(KEY);
const noSleep = async () => {};

class RecordingSink implements NotificationSink {
  sent: DriftNotification[] = [];
  async deliver(n: DriftNotification): Promise<void> {
    this.sent.push(n);
  }
}

class BrokenSink implements NotificationSink {
  async deliver(): Promise<void> {
    throw new Error('mail server refused the connection');
  }
}

/** A client whose transport is a function, so no socket is ever opened. */
function fakeClient(board: (typeof templateBoard) | null): MondayClient {
  return new MondayClient({
    token: 'test',
    sleep: noSleep,
    fetchImpl: (async (_url: string, init: { body?: string }) => {
      const body = JSON.parse(init.body ?? '{}') as { query: string };
      if (body.query.includes('owners')) {
        return jsonResponse({ data: { boards: [{ id: COPY_BOARD_ID, owners: [], subscribers: [] }] } });
      }
      if (!board) return jsonResponse({ data: { boards: [] } });
      return jsonResponse({
        data: {
          boards: [
            {
              id: board.boardId,
              name: board.name,
              description: board.description,
              state: board.state,
              board_kind: board.boardKind,
              workspace_id: board.workspaceId,
              permissions: board.permissions,
              columns: board.columns.map((c) => ({
                id: c.id,
                title: c.title,
                type: c.type,
                description: c.description,
                archived: c.archived,
                width: c.width,
                settings: c.settings,
              })),
              groups: board.groups,
              views: board.views.map((v) => ({
                id: v.id,
                name: v.name,
                type: v.type,
                settings_str: JSON.stringify(v.settings),
              })),
              tags: board.tags,
            },
          ],
        },
      });
    }) as unknown as typeof fetch,
  });
}

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => payload,
  };
}

async function seed(opts: { plan?: 'free' | 'pro'; install?: boolean; linked?: string[] } = {}) {
  const storage = new InMemoryStorage();
  if (opts.install !== false) {
    await storage.saveInstall({
      accountId: 'acct-1',
      accountSlug: 'agency',
      encryptedToken: cipher.encrypt('monday-token'),
      installedAt: '2026-09-01T00:00:00.000Z',
    });
  }
  await storage.savePlan({ accountId: 'acct-1', planId: opts.plan ?? 'pro', renewsAt: null });

  const record: TemplateRecord = {
    accountId: 'acct-1',
    templateBoardId: TEMPLATE_BOARD_ID,
    label: 'Template',
    snapshot: templateBoard,
    linkedBoardIds: opts.linked ?? [COPY_BOARD_ID],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
  await storage.saveTemplate(record);
  return storage;
}

describe('DriftScheduler', () => {
  it('notifies when a monitored board has drifted', async () => {
    const storage = await seed();
    const sink = new RecordingSink();
    const drifted = copyWith((b) => {
      b.columns = b.columns.filter((c) => c.type !== 'status');
    });

    const scheduler = new DriftScheduler(storage, cipher, sink, {
      sleep: noSleep,
      jitterMs: 0,
      makeClient: () => fakeClient(drifted),
    });

    const sweep = await scheduler.sweep();

    expect(sweep.accountsChecked).toBe(1);
    expect(sink.sent).toHaveLength(1);
    expect(sink.sent[0]!.accountId).toBe('acct-1');
    expect(sweep.results[0]!.errors).toEqual([]);
  });

  it('sends nothing when the copy still matches its template', async () => {
    const storage = await seed();
    const sink = new RecordingSink();
    const scheduler = new DriftScheduler(storage, cipher, sink, {
      sleep: noSleep,
      jitterMs: 0,
      makeClient: () => fakeClient(cleanCopy),
    });

    await scheduler.sweep();
    expect(sink.sent).toEqual([]);
  });

  it('skips free accounts and says so, rather than reporting them as checked', async () => {
    const storage = await seed({ plan: 'free' });
    const sink = new RecordingSink();
    const scheduler = new DriftScheduler(storage, cipher, sink, {
      sleep: noSleep,
      jitterMs: 0,
      makeClient: () => fakeClient(templateBoard),
    });

    const sweep = await scheduler.sweep();

    expect(sweep.accountsConsidered).toBe(1);
    expect(sweep.accountsChecked).toBe(0);
    expect(sweep.results[0]!.skipped).toMatch(/Pro feature/);
    expect(sink.sent).toEqual([]);
  });

  it('records a missing install instead of throwing the whole sweep away', async () => {
    const storage = await seed({ install: false });
    const scheduler = new DriftScheduler(storage, cipher, new RecordingSink(), {
      sleep: noSleep,
      jitterMs: 0,
      makeClient: () => fakeClient(templateBoard),
    });

    const sweep = await scheduler.sweep();
    expect(sweep.results[0]!.skipped).toMatch(/uninstalled or its token was revoked/);
  });

  it('reports an undecryptable token loudly — every future sweep fails the same way', async () => {
    const storage = await seed();
    const wrongKey = new TokenCipher(Buffer.alloc(32, 9).toString('base64'));
    const scheduler = new DriftScheduler(storage, wrongKey, new RecordingSink(), {
      sleep: noSleep,
      jitterMs: 0,
      makeClient: () => fakeClient(templateBoard),
    });

    const sweep = await scheduler.sweep();
    expect(sweep.results[0]!.skipped).toMatch(/could not be decrypted/);
    expect(sweep.results[0]!.errors).not.toEqual([]);
  });

  it('records a failed notification delivery rather than swallowing it', async () => {
    const storage = await seed();
    const drifted = copyWith((b) => {
      b.columns = b.columns.filter((c) => c.type !== 'status');
    });
    const scheduler = new DriftScheduler(storage, cipher, new BrokenSink(), {
      sleep: noSleep,
      jitterMs: 0,
      makeClient: () => fakeClient(drifted),
    });

    const sweep = await scheduler.sweep();
    expect(sweep.results[0]!.notificationsSent).toBe(0);
    expect(sweep.results[0]!.errors.join(' ')).toMatch(/could not be delivered/);
  });

  it('skips a tick while a sweep is running instead of doubling API load', async () => {
    const storage = await seed();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });

    const scheduler = new DriftScheduler(storage, cipher, new RecordingSink(), {
      jitterMs: 0,
      // The first sweep parks here until the test lets it go.
      sleep: () => gate,
      accountPauseMs: 1,
      makeClient: () => fakeClient(templateBoard),
    });

    const storageWithTwo = storage;
    await storageWithTwo.saveTemplate({
      accountId: 'acct-2',
      templateBoardId: TEMPLATE_BOARD_ID,
      label: 'Template',
      snapshot: templateBoard,
      linkedBoardIds: [COPY_BOARD_ID],
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });

    const first = scheduler.tick();
    await Promise.resolve();
    const second = await scheduler.tick();

    expect(second).toBeNull();
    expect(scheduler.status.skippedTicks).toBe(1);

    release();
    await first;
    // The flag must clear, or the monitor has silently stopped monitoring.
    expect(scheduler.status.running).toBe(false);
  });

  it('clears the running flag even when the sweep throws', async () => {
    const storage = await seed();
    const scheduler = new DriftScheduler(
      {
        ...storage,
        listAccountIdsWithTemplates: async () => {
          throw new Error('database unreachable');
        },
      } as unknown as InMemoryStorage,
      cipher,
      new RecordingSink(),
      { sleep: noSleep, jitterMs: 0 },
    );

    await expect(scheduler.sweep()).rejects.toThrow(/database unreachable/);
    expect(scheduler.status.running).toBe(false);
  });

  it('start/stop is idempotent and does not hold the process open', () => {
    const scheduler = new DriftScheduler(new InMemoryStorage(), cipher, new RecordingSink(), {
      intervalMs: 60_000,
    });
    scheduler.start();
    scheduler.start();
    expect(scheduler.status.started).toBe(true);
    scheduler.stop();
    expect(scheduler.status.started).toBe(false);
  });
});

describe('DriftScheduler storage pacing', () => {
  it('spaces storage reads so a sweep cannot trip the 7/second Secure Storage limit', async () => {
    const storage = await seed();
    await storage.saveInstall({
      accountId: 'acct-2',
      accountSlug: 'other',
      encryptedToken: cipher.encrypt('monday-token'),
      installedAt: '2026-09-01T00:00:00.000Z',
    });
    await storage.savePlan({ accountId: 'acct-2', planId: 'pro', renewsAt: null });
    await storage.saveTemplate({
      accountId: 'acct-2',
      templateBoardId: TEMPLATE_BOARD_ID,
      label: 'Template',
      snapshot: templateBoard,
      linkedBoardIds: [COPY_BOARD_ID],
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });

    const waits: number[] = [];
    let clock = 0;
    const scheduler = new DriftScheduler(storage, cipher, new RecordingSink(), {
      jitterMs: 0,
      accountPauseMs: 0,
      storageOpsPerSecond: 5,
      now: () => new Date(clock),
      sleep: async (ms: number) => {
        waits.push(ms);
        clock += ms;
      },
      makeClient: () => fakeClient(cleanCopy),
    });

    await scheduler.sweep();

    // Three storage reads per account, two accounts: the first read runs
    // immediately, the rest are spaced by 1000/5 = 200ms.
    expect(waits.filter((w) => w === 200).length).toBeGreaterThanOrEqual(5);
  });

  it('does not pace when the limit is disabled', async () => {
    const storage = await seed();
    const waits: number[] = [];
    const scheduler = new DriftScheduler(storage, cipher, new RecordingSink(), {
      jitterMs: 0,
      storageOpsPerSecond: 0,
      sleep: async (ms: number) => {
        waits.push(ms);
      },
      makeClient: () => fakeClient(cleanCopy),
    });

    await scheduler.sweep();
    expect(waits).toEqual([]);
  });
});
