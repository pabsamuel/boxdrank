/**
 * Local-only storage. Timelines and metadata in IndexedDB, video and takes in
 * OPFS. Nothing here ever uploads (CLAUDE.md rule 4).
 */

import { openDB, type IDBPDatabase } from 'idb';
import type { PoseTimeline } from '../pose-core/types';
import type { Cue } from '../coach/cues';
import type { Move } from '../coach/segment';
import type { SegmentId } from '../pose-core/types';

export interface Routine {
  id: string;
  name: string;
  createdAt: number;
  duration: number;
  /** 'video' routines have a stored clip; 'photo' routines are a single pose. */
  kind: 'video' | 'photo';
  timeline: PoseTimeline;
  moves: Move[];
  cues: Cue[];
  beats?: number[];
  thumbnail?: string;
  bestAccuracy?: number;
  lastPractisedAt?: number;
  /** OPFS filename of the source clip, if we kept one. */
  videoFile?: string;
}

/** One scored frame of a take, time-aligned to the routine. */
export interface TakeFrame {
  t: number;
  /** Overall score, or null when the body could not be seen. */
  score: number | null;
  /**
   * Per-limb scores at this instant. Without these a dip tells you *when* you
   * drifted but not *what* drifted, which is half the point of reviewing.
   */
  segments?: Partial<Record<SegmentId, number>>;
}

export interface Take {
  id: string;
  routineId: string;
  createdAt: number;
  duration: number;
  scores: TakeFrame[];
  accuracy: number;
  videoFile: string;
}

const DB_NAME = 'trendghost';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('routines')) {
        database.createObjectStore('routines', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('takes')) {
        const store = database.createObjectStore('takes', { keyPath: 'id' });
        store.createIndex('routineId', 'routineId');
      }
      if (!database.objectStoreNames.contains('settings')) {
        database.createObjectStore('settings');
      }
    },
  });
  return dbPromise;
}

export async function saveRoutine(routine: Routine): Promise<void> {
  await (await db()).put('routines', routine);
}

export async function listRoutines(): Promise<Routine[]> {
  const all = (await (await db()).getAll('routines')) as Routine[];
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getRoutine(id: string): Promise<Routine | undefined> {
  return (await db()).get('routines', id) as Promise<Routine | undefined>;
}

export async function deleteRoutine(id: string): Promise<void> {
  const routine = await getRoutine(id);
  if (routine?.videoFile) await deleteFile(routine.videoFile);
  const takes = await listTakes(id);
  for (const take of takes) await deleteTake(take.id);
  await (await db()).delete('routines', id);
}

export async function saveTake(take: Take): Promise<void> {
  await (await db()).put('takes', take);
}

export async function listTakes(routineId?: string): Promise<Take[]> {
  const all = (await (await db()).getAll('takes')) as Take[];
  const filtered = routineId ? all.filter((t) => t.routineId === routineId) : all;
  return filtered.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteTake(id: string): Promise<void> {
  const take = (await (await db()).get('takes', id)) as Take | undefined;
  if (take) await deleteFile(take.videoFile);
  await (await db()).delete('takes', id);
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const value = await (await db()).get('settings', key);
  return (value as T) ?? fallback;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await (await db()).put('settings', value, key);
}

/* ---------- OPFS: the video files themselves ---------- */

async function opfsRoot(): Promise<FileSystemDirectoryHandle | null> {
  if (!navigator.storage?.getDirectory) return null;
  try {
    return await navigator.storage.getDirectory();
  } catch {
    return null;
  }
}

export async function saveFile(name: string, blob: Blob): Promise<string> {
  const root = await opfsRoot();
  if (!root) throw new Error('This browser has no local file storage available.');
  const handle = await root.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
  return name;
}

export async function readFile(name: string): Promise<Blob | null> {
  const root = await opfsRoot();
  if (!root) return null;
  try {
    const handle = await root.getFileHandle(name);
    return await handle.getFile();
  } catch {
    return null;
  }
}

export async function deleteFile(name: string): Promise<void> {
  const root = await opfsRoot();
  if (!root) return;
  try {
    await root.removeEntry(name);
  } catch {
    // Already gone — nothing to do.
  }
}

export async function storageUsage(): Promise<{ usedBytes: number; quotaBytes: number }> {
  const estimate = (await navigator.storage?.estimate?.()) ?? {};
  return { usedBytes: estimate.usage ?? 0, quotaBytes: estimate.quota ?? 0 };
}

/** Settings > "delete all my data" — must actually clear everything. */
export async function clearAllData(): Promise<void> {
  const database = await db();
  await database.clear('routines');
  await database.clear('takes');
  await database.clear('settings');
  const root = await opfsRoot();
  if (root) {
    for await (const key of (root as unknown as { keys(): AsyncIterable<string> }).keys()) {
      await root.removeEntry(key).catch(() => undefined);
    }
  }
}
