import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadEnv } from '@global-emotes/config';
import { createDb } from './index';

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'drizzle');

export async function runMigrations(databaseUrl?: string): Promise<void> {
  const env = loadEnv();
  const { db, pool } = createDb({ connectionString: databaseUrl ?? env.DATABASE_URL, max: 1 });
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runMigrations()
    .then(() => {
      console.log('migrations applied');
    })
    .catch((err) => {
      console.error('migration failed', err);
      process.exitCode = 1;
    });
}
