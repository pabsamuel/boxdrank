import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index';

export * as schema from './schema/index';
export { sql, eq, and, or, desc, asc, inArray, isNull, lt, gt, gte, lte, ilike, count } from 'drizzle-orm';

export type Db = NodePgDatabase<typeof schema>;

export interface CreateDbOptions {
  connectionString: string;
  max?: number;
}

export function createDb(options: CreateDbOptions): { db: Db; pool: pg.Pool } {
  const pool = new pg.Pool({
    connectionString: options.connectionString,
    max: options.max ?? 10,
  });
  const db = drizzle(pool, { schema });
  return { db, pool };
}
