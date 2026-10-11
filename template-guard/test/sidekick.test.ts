import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { MondayClient } from '../src/api/client.js';
import { InMemoryStorage } from '../src/server/storage.js';
import {
  SIDEKICK_PATH,
  answerSidekick,
  readInputs,
  sidekickAudience,
  verifySidekickRequest,
} from '../src/server/sidekick.js';
import { COPY_BOARD_ID, TEMPLATE_BOARD_ID, templateBoard } from './fixtures/boards.js';

const ORIGIN = 'https://bf61d-service-36993937-e27ad91f.eu.monday.app';
const SIGNING = 'signing-secret';

function jwt(payload: Record<string, unknown>, secret = SIGNING): string {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const s = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${s}`;
}

const good = { exp: 2_000_000_000, aud: `${ORIGIN}${SIDEKICK_PATH}`, shortLivedToken: 'slt', accountId: 42 };

describe('sidekick request verification', () => {
  it('accepts a token signed with the Signing Secret for this route', () => {
    expect(verifySidekickRequest(`Bearer ${jwt(good)}`, SIGNING, ORIGIN, 1)).toEqual({ accountId: '42', shortLivedToken: 'slt' });
  });

  it('accepts the version URL of the same service', () => {
    expect(sidekickAudience(`https://aa11b-service-36993937-e27ad91f.eu.monday.app${SIDEKICK_PATH}`, ORIGIN)).toBe(true);
  });

  it('refuses another route, another host, another secret, or an expired token', () => {
    expect(verifySidekickRequest(jwt({ ...good, aud: `${ORIGIN}/api/compare` }), SIGNING, ORIGIN, 1)).toBeNull();
    expect(verifySidekickRequest(jwt({ ...good, aud: `https://evil.example${SIDEKICK_PATH}` }), SIGNING, ORIGIN, 1)).toBeNull();
    expect(verifySidekickRequest(jwt(good, 'client-secret'), SIGNING, ORIGIN, 1)).toBeNull();
    expect(verifySidekickRequest(jwt({ ...good, exp: 10 }), SIGNING, ORIGIN, 20)).toBeNull();
    expect(verifySidekickRequest(undefined, SIGNING, ORIGIN, 1)).toBeNull();
  });

  it('reads inputs from either payload shape', () => {
    expect(readInputs({ payload: { inboundFieldValues: { board_name: 'Client A' } } }).boardName).toBe('Client A');
    expect(readInputs({ payload: { inputFields: { template_name: 'T' } } }).templateName).toBe('T');
    expect(readInputs(undefined)).toEqual({ boardName: '', templateName: '' });
  });
});

function fakeClient(boards: { id: string; name: string }[]): MondayClient {
  return { request: async () => ({ data: { boards }, errors: [] }) } as unknown as MondayClient;
}

async function withTemplate() {
  const storage = new InMemoryStorage();
  await storage.saveTemplate({
    templateBoardId: TEMPLATE_BOARD_ID,
    accountId: '42',
    label: 'T',
    snapshot: templateBoard,
    linkedBoardIds: [COPY_BOARD_ID],
    createdAt: '2026-09-28T00:00:00Z',
    updatedAt: '2026-09-28T00:00:00Z',
  });
  return storage;
}

describe('answerSidekick', () => {
  it('asks the user to save a template first when there is none', async () => {
    const a = await answerSidekick({ client: fakeClient([]), storage: new InMemoryStorage(), accountId: '42', boardName: 'x', templateName: '' });
    expect(a.summary).toMatch(/No template is saved/);
  });

  it('says so when no board has that name, and asks when several do', async () => {
    const storage = await withTemplate();
    const none = await answerSidekick({ client: fakeClient([{ id: '9', name: 'Other' }]), storage, accountId: '42', boardName: 'Client A', templateName: '' });
    expect(none.summary).toMatch(/could not find a board called "Client A"/);
    const many = await answerSidekick({
      client: fakeClient([{ id: '8', name: 'Client A (EU)' }, { id: '9', name: 'Client A (US)' }]),
      storage,
      accountId: '42',
      boardName: 'Client A',
      templateName: '',
    });
    expect(many.summary).toMatch(/Several boards match/);
  });

  it('does not compare a template with itself', async () => {
    const storage = await withTemplate();
    const a = await answerSidekick({
      client: fakeClient([{ id: TEMPLATE_BOARD_ID, name: templateBoard.name }]),
      storage,
      accountId: '42',
      boardName: templateBoard.name,
      templateName: '',
    });
    expect(a.summary).toMatch(/itself a saved template/);
  });
});
