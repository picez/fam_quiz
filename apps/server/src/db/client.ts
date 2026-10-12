import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import pg from 'pg';
import * as schema from './schema';

/** База, однакова для node-postgres у роботі та PGlite у тестах. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export const MIGRATIONS = resolve(import.meta.dirname, '../../drizzle');

export async function connectDb(url: string): Promise<{ db: Db; close: () => Promise<void> }> {
  const pool = new pg.Pool({ connectionString: url });
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return { db: db as unknown as Db, close: () => pool.end() };
}
