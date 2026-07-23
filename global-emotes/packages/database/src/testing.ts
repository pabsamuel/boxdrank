import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from './schema/index.js';

export type TestDb = PgliteDatabase<typeof schema>;

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'drizzle');

/**
 * Embedded real-Postgres (WASM) test database. Applies the actual generated
 * SQL migrations, so schema drift between code and migrations fails tests
 * (ADR-0003).
 */
export async function createTestDb(): Promise<{ db: TestDb; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return {
    db,
    close: async () => {
      await client.close();
    },
  };
}
