import mondaySdk from 'monday-sdk-js';
import type { DiffResult } from '../diff/types.js';
import type { RepairPlan, AutoRepair } from '../repair/plan.js';
import type { TemplateRecord } from '../snapshot/types.js';
import type { AccountPlan } from '../billing/tiers.js';
import type { NotificationSettings } from '../server/storage.js';

/**
 * Browser-side calls to the Template Guard backend.
 *
 * Every response goes through `unwrap`, which refuses to hand a caller a body
 * from a non-OK response. A UI that renders `undefined` as "no problems found"
 * is precisely the silent failure this product is sold against.
 */

const monday = mondaySdk();

export interface BoardSummary {
  id: string;
  name: string;
  workspace_id: string | null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly upsell?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function sessionToken(): Promise<string> {
  const res = (await monday.get('sessionToken')) as { data?: string };
  if (!res?.data) {
    throw new ApiError(
      'Template Guard could not confirm who you are with monday. Reload the board and try again.',
      401,
    );
  }
  return res.data;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await sessionToken();

  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    });
  } catch (cause) {
    throw new ApiError('Could not reach Template Guard. Check your connection and try again.', 0);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    // A non-JSON body on an error status is still an error we must surface.
    throw new ApiError(`Template Guard returned an unreadable response (HTTP ${res.status}).`, res.status);
  }

  if (!res.ok && res.status !== 207) {
    const detail = body as { error?: string; upsell?: string };
    throw new ApiError(
      detail.error ?? `Template Guard returned HTTP ${res.status}.`,
      res.status,
      detail.upsell,
    );
  }

  return body as T;
}

export const api = {
  listBoards: () => call<{ boards: BoardSummary[]; warnings: string[] }>('/api/boards'),

  listTemplates: () => call<{ templates: TemplateRecord[]; plan: AccountPlan }>('/api/templates'),

  designateTemplate: (boardId: string, label?: string) =>
    call<{ template: TemplateRecord; failures: { message: string }[] }>('/api/templates', {
      method: 'POST',
      body: JSON.stringify({ boardId, label }),
    }),

  compare: (templateBoardId: string, copyBoardId: string, includeCosmetic: boolean) =>
    call<{ diff: DiffResult; repairPlan: RepairPlan; copySnapshotFailures: { message: string }[] }>(
      '/api/compare',
      {
        method: 'POST',
        body: JSON.stringify({ templateBoardId, copyBoardId, includeCosmetic }),
      },
    ),

  notificationSettings: () =>
    call<{
      settings: NotificationSettings;
      effectiveMondayUserId: string | null;
      deliverable: boolean;
    }>('/api/notifications'),

  saveNotificationSettings: (patch: Partial<Omit<NotificationSettings, 'accountId'>>) =>
    call<{ settings: NotificationSettings }>('/api/notifications', {
      method: 'POST',
      body: JSON.stringify(patch),
    }),

  repair: (repairs: AutoRepair[]) =>
    call<{
      outcomes: (
        | { status: 'applied'; findingId: string; detail: string }
        | { status: 'failed'; findingId: string; reason: string; recoverable: boolean }
      )[];
      applied: number;
      failed: number;
    }>('/api/repair', { method: 'POST', body: JSON.stringify({ repairs }) }),
};

/** The board this view is embedded in, if any. */
export async function currentBoardId(): Promise<string | null> {
  const ctx = (await monday.get('context')) as { data?: { boardId?: number | string } };
  const id = ctx?.data?.boardId;
  return id != null ? String(id) : null;
}

export { monday };
