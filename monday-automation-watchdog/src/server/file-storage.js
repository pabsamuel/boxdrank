/**
 * Key/value storage on disk, for running the scheduled check somewhere other
 * than monday's own infrastructure.
 *
 * Exists so the product is not blocked on whether monday can schedule a job. If
 * it can, its storage replaces this and nothing above changes. If it cannot, a
 * cron somewhere cheap — a GitHub Actions schedule costs nothing — runs the same
 * code against the same interface.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** Keys contain a colon-separated namespace; make them safe as filenames. */
const safeName = (key) => `${String(key).replace(/[^a-zA-Z0-9._-]+/g, '_')}.json`;

export function createFileStorage(directory) {
  return {
    async get(key) {
      try {
        return JSON.parse(await readFile(join(directory, safeName(key)), 'utf8'));
      } catch (error) {
        // A missing file is an empty value, not a failure: the first run of any
        // account has no stored state and must not be treated as broken.
        if (error.code === 'ENOENT') return null;
        // Corrupt JSON is also treated as empty. The cost is one repeated alert;
        // the alternative is a check that can never run again.
        if (error instanceof SyntaxError) return null;
        throw error;
      }
    },

    async set(key, value) {
      const file = join(directory, safeName(key));
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(value, null, 2));
    },
  };
}
