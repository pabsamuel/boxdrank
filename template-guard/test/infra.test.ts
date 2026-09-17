import { describe, expect, it, vi } from 'vitest';
import { MondayClient } from '../src/api/client.js';
import { MONDAY_API_VERSION } from '../src/api/version.js';
import { TemplateGuardError, classifyGraphQLError, partial } from '../src/api/errors.js';
import { matchColumns, titleSimilarity } from '../src/diff/match.js';
import { linkedBoardIds } from '../src/diff/connect.js';
import { parseSettings, toColumnSnapshot } from '../src/snapshot/capture.js';
import { assertNoItemData, TokenCipher } from '../src/server/storage.js';
import { assertNoPaidPreviewDependency, canAddTemplate, PLANS } from '../src/billing/tiers.js';
import { isWorthReporting, notificationFor } from '../src/drift/monitor.js';
import { createState, verifyState, REQUIRED_SCOPES } from '../src/server/oauth.js';
import { diffBoards } from '../src/diff/diff.js';
import { countBySeverity } from '../src/diff/types.js';
import { column, cleanCopy, copyWith, templateBoard, TEMPLATE_BOARD_ID } from './fixtures/boards.js';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('MondayClient', () => {
  it('pins the API version on every request', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: { ok: true } }));
    const client = new MondayClient({ token: 't', fetchImpl: fetchImpl as unknown as typeof fetch });

    await client.request('query { me { id } }');

    const init = (fetchImpl.mock.calls as unknown as [string, RequestInit][])[0]?.[1];
    expect((init?.headers as Record<string, string>)['API-Version']).toBe(MONDAY_API_VERSION);
  });

  it('returns data AND errors rather than discarding a partial result', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: { boards: [{ id: '1' }] },
        errors: [{ message: 'not authorized to read columns' }],
      }),
    );
    const client = new MondayClient({ token: 't', fetchImpl: fetchImpl as unknown as typeof fetch });

    const { data, errors } = await client.request<{ boards: unknown[] }>('query { boards { id } }');
    expect(data?.boards).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });

  it('retries a 429 and then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(jsonResponse({ data: { ok: true } }));

    const client = new MondayClient({
      token: 't',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async () => {},
    });

    const { data } = await client.request<{ ok: boolean }>('query { ok }');
    expect(data?.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('gives up loudly rather than silently returning nothing', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 429 }));
    const client = new MondayClient({
      token: 't',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async () => {},
      maxRetries: 1,
    });

    await expect(client.request('query { ok }')).rejects.toThrow(TemplateGuardError);
  });

  it('refuses to construct without a token', () => {
    expect(() => new MondayClient({ token: '' })).toThrow(TemplateGuardError);
  });
});

describe('error classification', () => {
  it.each([
    [{ extensions: { code: 'ComplexityException' } }, 'complexity_exceeded'],
    [{ message: 'Rate limit exceeded' }, 'rate_limited'],
    [{ extensions: { code: 'UserUnauthorizedException' } }, 'permission_denied'],
    [{ message: "Cannot query field 'nope' on type 'Board'" }, 'schema_mismatch'],
    [{ message: 'something else entirely' }, 'unknown'],
  ])('classifies %o', (err, expected) => {
    expect(classifyGraphQLError(err)).toBe(expected);
  });
});

describe('settings parsing', () => {
  it('accepts a typed object', () => {
    expect(parseSettings({ boardIds: ['1'] })).toEqual({ boardIds: ['1'] });
  });

  it('accepts the deprecated JSON string', () => {
    expect(parseSettings('{"boardIds":["1"]}')).toEqual({ boardIds: ['1'] });
  });

  it('returns null — not an empty object — for something unparseable', () => {
    expect(parseSettings('{not json')).toBeNull();
    expect(parseSettings(42)).toBeNull();
  });

  it('falls back to settings_str and records that it had to', () => {
    const failures: ReturnType<typeof partial>[] = [];
    const snap = toColumnSnapshot(
      { id: 'c1', title: 'Link', type: 'board_relation', settings: null, settings_str: '{"boardIds":["9"]}' },
      'b1',
      failures,
    );
    expect(snap.settings).toEqual({ boardIds: ['9'] });
    expect(snap.settingsFromDeprecatedField).toBe(true);
    expect(failures).toHaveLength(0);
  });

  it('records a failure when neither settings field can be read', () => {
    const failures: ReturnType<typeof partial>[] = [];
    toColumnSnapshot(
      { id: 'c1', title: 'Broken', type: 'status', settings: '{oops', settings_str: '{oops' },
      'b1',
      failures,
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]?.degradesDiff).toBe(true);
  });
});

describe('linkedBoardIds', () => {
  it('reads each plausible settings spelling', () => {
    for (const key of ['boardIds', 'board_ids', 'linkedBoardIds']) {
      expect(linkedBoardIds(column({ id: 'c', title: 'x', type: 'board_relation', settings: { [key]: ['7'] } }))).toEqual(['7']);
    }
  });

  it('reads one level of nesting', () => {
    const col = column({ id: 'c', title: 'x', type: 'board_relation', settings: { relation: { boardIds: ['7'] } } });
    expect(linkedBoardIds(col)).toEqual(['7']);
  });

  it('returns null rather than an empty array when it finds nothing it understands', () => {
    // The distinction that keeps a mis-wired column from being reported as fine.
    expect(linkedBoardIds(column({ id: 'c', title: 'x', type: 'board_relation', settings: { other: 1 } }))).toBeNull();
  });
});

describe('column matching', () => {
  it('scores a plausible rename above the threshold and an unrelated title below it', () => {
    expect(titleSimilarity('Account Owner', 'Client Owner')).toBeGreaterThan(0.6);
    expect(titleSimilarity('Budget', 'Status')).toBeLessThan(0.6);
  });

  it('refuses to pair ambiguous duplicates by title', () => {
    const t = [
      column({ id: 't1', title: 'Status', type: 'status' }),
      column({ id: 't2', title: 'Status', type: 'status' }),
    ];
    const c = [
      column({ id: 'c1', title: 'Status', type: 'status' }),
      column({ id: 'c2', title: 'Status', type: 'status' }),
    ];
    // Two identical candidates on each side: pass 3 pairs them positionally
    // rather than guessing, and never crosses them over.
    const { matches, templateOnly, copyOnly } = matchColumns(t, c);
    expect(matches).toHaveLength(2);
    expect(templateOnly).toHaveLength(0);
    expect(copyOnly).toHaveLength(0);
    expect(matches.every((m) => m.confidence === 'likely')).toBe(true);
  });

  it('ignores archived columns on both sides', () => {
    const t = [column({ id: 't1', title: 'Old', type: 'text', archived: true })];
    const c: never[] = [];
    expect(matchColumns(t, c).templateOnly).toHaveLength(0);
  });
});

describe('token encryption', () => {
  const key = Buffer.alloc(32, 7).toString('base64');

  it('round-trips a token', () => {
    const cipher = new TokenCipher(key);
    expect(cipher.decrypt(cipher.encrypt('secret-token'))).toBe('secret-token');
  });

  it('produces a different ciphertext each time', () => {
    const cipher = new TokenCipher(key);
    expect(cipher.encrypt('t')).not.toBe(cipher.encrypt('t'));
  });

  it('rejects a wrong-length key instead of silently truncating', () => {
    expect(() => new TokenCipher(Buffer.alloc(16).toString('base64'))).toThrow(/32 bytes/);
  });

  it('refuses a tampered payload', () => {
    const cipher = new TokenCipher(key);
    const [iv, tag] = cipher.encrypt('t').split('.');
    expect(() => cipher.decrypt(`${iv}.${tag}.YWJj`)).toThrow();
  });
});

describe('the no-item-data promise', () => {
  it('accepts a normal snapshot', () => {
    expect(() => assertNoItemData(templateBoard)).not.toThrow();
  });

  it('refuses a snapshot that somehow picked up items', () => {
    const contaminated = structuredClone(templateBoard) as unknown as Record<string, unknown>;
    contaminated.items = [{ id: '1', name: 'Confidential client name' }];
    expect(() => assertNoItemData(contaminated as never)).toThrow(/never customer item data/i);
  });

  it('catches item data nested deep inside column settings', () => {
    const contaminated = copyWith((b) => {
      const col = b.columns[0];
      if (col) col.settings = { nested: { column_values: ['leak'] } };
    });
    expect(() => assertNoItemData(contaminated)).toThrow(/column_values/);
  });
});

describe('billing', () => {
  it('holds the free tier to one template', () => {
    const plan = { accountId: 'a', planId: 'free' as const, renewsAt: null };
    expect(canAddTemplate(plan, 0).allowed).toBe(true);
    expect(canAddTemplate(plan, 1).allowed).toBe(false);
  });

  it('does not cap Pro', () => {
    const plan = { accountId: 'a', planId: 'pro' as const, renewsAt: null };
    expect(canAddTemplate(plan, 500).allowed).toBe(true);
    expect(PLANS.pro.maxTemplates).toBe(Number.POSITIVE_INFINITY);
  });

  it('keeps every paid feature off the preview schema', () => {
    expect(() => assertNoPaidPreviewDependency()).not.toThrow();
  });

  it('leaves mis-wiring detection on the free tier', () => {
    // The finding that sells the product must be visible before you pay for it.
    const miswired = copyWith((b) => {
      const col = b.columns.find((c) => c.title === 'Related Work');
      if (col) col.settings = { boardIds: [TEMPLATE_BOARD_ID] };
    });
    expect(countBySeverity(diffBoards(templateBoard, miswired).findings).miswired).toBe(1);
  });
});

describe('drift reporting', () => {
  it('stays quiet about cosmetic-only drift', () => {
    const cosmeticOnly = diffBoards(
      templateBoard,
      copyWith((b) => {
        const col = b.columns[4];
        if (col) col.width = 999;
      }),
      { includeCosmetic: true },
    );
    expect(isWorthReporting(cosmeticOnly)).toBe(false);
  });

  it('always speaks up when a read failed', () => {
    const damaged = diffBoards(
      templateBoard,
      copyWith((b) => {
        b.failures = [partial('permission_denied', 'board.x.columns', 'refused')];
      }),
    );
    expect(isWorthReporting(damaged)).toBe(true);
  });

  it('leads with mis-wiring in the notification text', () => {
    const diff = diffBoards(
      templateBoard,
      copyWith((b) => {
        const col = b.columns.find((c) => c.title === 'Related Work');
        if (col) col.settings = { boardIds: [TEMPLATE_BOARD_ID] };
        b.groups = b.groups.filter((g) => g.title !== 'Handover');
      }),
    );
    const text = notificationFor(
      { templateBoardId: 't', copyBoardId: 'c', diff, counts: countBySeverity(diff.findings) },
      'Acme Corp',
    );
    expect(text).toMatch(/wrong board/i);
  });
});

describe('oauth', () => {
  it('round-trips signed state and rejects tampering', () => {
    const state = createState('secret');
    expect(verifyState('secret', state)).toBe(true);
    expect(verifyState('secret', `${state}x`)).toBe(false);
    expect(verifyState('other-secret', state)).toBe(false);
  });

  it('requests no item-level scope', () => {
    expect(REQUIRED_SCOPES.join(' ')).not.toMatch(/items|updates|assets/);
  });
});

describe('the healthy-copy invariant', () => {
  it('never reports a correctly duplicated board as broken', () => {
    // Guards against the failure mode that would sink the product fastest:
    // false positives teach users to ignore the tool.
    expect(diffBoards(templateBoard, cleanCopy).findings).toHaveLength(0);
  });
});
