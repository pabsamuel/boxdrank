import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileStorage } from '../src/server/file-storage.js';

const withDir = async (fn) => {
  const dir = await mkdtemp(join(tmpdir(), 'watchdog-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

test('values round-trip', () =>
  withDir(async (dir) => {
    const storage = createFileStorage(dir);
    await storage.set('watchdog:state:v1:acc1', { a: { status: 'silent' } });
    assert.deepEqual(await storage.get('watchdog:state:v1:acc1'), { a: { status: 'silent' } });
  }));

test('a missing key is empty, not an error', () =>
  withDir(async (dir) => {
    // The first run of any account has no stored state and must not look broken.
    assert.equal(await createFileStorage(dir).get('never:written'), null);
  }));

test('corrupt state is treated as empty rather than jamming the check forever', () =>
  withDir(async (dir) => {
    // The cost is one repeated alert. The alternative is a check that can never
    // run again, which for a watchdog is the worse failure.
    await writeFile(join(dir, 'broken.json'), '{ not json');
    assert.equal(await createFileStorage(dir).get('broken'), null);
  }));

test('keys with namespaces become safe filenames and stay distinct', () =>
  withDir(async (dir) => {
    const storage = createFileStorage(dir);
    await storage.set('watchdog:state:v1:acc1', 'one');
    await storage.set('watchdog:runs:v1:acc1', 'two');
    assert.equal(await storage.get('watchdog:state:v1:acc1'), 'one');
    assert.equal(await storage.get('watchdog:runs:v1:acc1'), 'two');
  }));

test('a nested directory is created on demand', () =>
  withDir(async (dir) => {
    const storage = createFileStorage(join(dir, 'deep', 'nested'));
    await storage.set('k', 1);
    assert.equal(await storage.get('k'), 1);
  }));
