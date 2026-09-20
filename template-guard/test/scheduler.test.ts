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
      Object.assign(Object.create(Object.getPrototypeOf(storage) as object), storage, {
        listAccountIdsWithTemplates: async () => {
          throw new Error('database unreachable');
        },
      }) as InMemoryStorage,
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

describe('DriftScheduler resumability', () => {
  /** Seeds N pro accounts, each with one template and one linked board. */
  async function seedMany(count: number) {
    const storage = new InMemoryStorage();
    for (let i = 0; i < count; i += 1) {
      const accountId = `acct-${i}`;
      await storage.saveInstall({
        accountId,
        accountSlug: `slug-${i}`,
        encryptedToken: cipher.encrypt('monday-token'),
        installedAt: '2026-09-01T00:00:00.000Z',
      });
      await storage.savePlan({ accountId, planId: 'pro', renewsAt: null });
      await storage.saveTemplate({
        accountId,
        templateBoardId: TEMPLATE_BOARD_ID,
        label: 'Template',
        snapshot: templateBoard,
        linkedBoardIds: [COPY_BOARD_ID],
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      });
    }
    return storage;
  }

  function schedulerFor(storage: InMemoryStorage, clock: { t: number }, maxRunMs: number) {
    return new DriftScheduler(storage, cipher, new RecordingSink(), {
      jitterMs: 0,
      accountPauseMs: 0,
      storageOpsPerSecond: 0,
      maxRunMs,
      now: () => new Date(clock.t),
      // Every wait advances the clock, which is what eventually spends the
      // run budget.
      sleep: async (ms: number) => {
        clock.t += ms || 1000;
      },
      makeClient: () => fakeClient(cleanCopy),
    });
  }

  it('stops when the run budget is spent and saves what is left', async () => {
    const storage = await seedMany(4);
    const clock = { t: 0 };
    const scheduler = schedulerFor(storage, clock, 1);

    const first = await scheduler.sweep();

    // Not an exact count: in this fake, time only moves when the sweep sleeps,
    // so how many accounts fit is an artefact of the fake. The invariant is
    // what matters — it stopped early and nothing was dropped.
    expect(first.results.length).toBeGreaterThan(0);
    expect(first.results.length).toBeLessThan(4);
    expect(first.remainingAccountIds.length).toBe(4 - first.results.length);

    const checkpoint = await storage.getSweepCheckpoint();
    expect(checkpoint?.remainingAccountIds).toEqual(first.remainingAccountIds);
  });

  it('resumes where it stopped rather than re-checking the same accounts forever', async () => {
    const storage = await seedMany(4);
    const clock = { t: 0 };
    const scheduler = schedulerFor(storage, clock, 1);

    const first = await scheduler.sweep();
    const second = await scheduler.sweep();

    expect(second.resumed).toBe(true);

    // The whole point: no account is checked twice while others wait. Without
    // resumption every run would re-check the same first accounts and the
    // rest would never be swept at all.
    const firstIds = first.results.map((r) => r.accountId);
    const secondIds = second.results.map((r) => r.accountId);
    expect(secondIds.filter((id) => firstIds.includes(id))).toEqual([]);
  });

  it('eventually covers every account across runs, and then clears the checkpoint', async () => {
    const storage = await seedMany(4);
    const clock = { t: 0 };
    const scheduler = schedulerFor(storage, clock, 1);

    const seen: string[] = [];
    // Run until this sweep cycle completes, rather than a fixed number of
    // times — running past completion starts a *new* sweep, which legitimately
    // revisits accounts.
    for (let run = 0; run < 10; run += 1) {
      const result = await scheduler.sweep();
      seen.push(...result.results.map((r) => r.accountId));
      if (result.remainingAccountIds.length === 0) break;
    }

    expect(seen.sort()).toEqual(['acct-0', 'acct-1', 'acct-2', 'acct-3']);
    // A finished sweep leaves nothing behind, so the next one starts fresh.
    expect(await storage.getSweepCheckpoint()).toBeNull();
  });

  it('finishes in one run when the budget allows, and saves no checkpoint', async () => {
    const storage = await seedMany(3);
    const clock = { t: 0 };
    const scheduler = schedulerFor(storage, clock, 10 * 60 * 1000);

    const result = await scheduler.sweep();

    expect(result.results).toHaveLength(3);
    expect(result.remainingAccountIds).toEqual([]);
    expect(result.resumed).toBe(false);
    expect(await storage.getSweepCheckpoint()).toBeNull();
  });

  it('abandons a checkpoint that is too old instead of freezing on a stale list', async () => {
    const storage = await seedMany(2);
    // A checkpoint left behind by a sweep that never completed. Without an age
    // limit this would be resumed forever and the other accounts never seen.
    await storage.saveSweepCheckpoint({
      startedAt: new Date(0).toISOString(),
      remainingAccountIds: ['acct-1'],
    });

    const clock = { t: 10 * 24 * 60 * 60 * 1000 };
    const scheduler = schedulerFor(storage, clock, 10 * 60 * 1000);

    const result = await scheduler.sweep();

    expect(result.resumed).toBe(false);
    expect(result.results.map((r) => r.accountId).sort()).toEqual(['acct-0', 'acct-1']);
  });
});
