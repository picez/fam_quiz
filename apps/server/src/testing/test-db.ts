import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { MIGRATIONS, type Db } from '../db/client';
import * as schema from '../db/schema';

/** Порожня база в пам'яті з усіма міграціями. */
export async function createTestDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as Db;
}

interface Journal {
  entries: { tag: string }[];
}

/**
 * База з міграціями лише до заданої включно: щоб покласти дані в старому форматі,
 * а потім перевірити, як їх перенесуть наступні міграції (`migrateRest`).
 */
export async function createTestDbUpTo(tag: string): Promise<{ db: Db; migrateRest: () => Promise<void> }> {
  const journal = JSON.parse(readFileSync(join(MIGRATIONS, 'meta/_journal.json'), 'utf8')) as Journal;
  const last = journal.entries.findIndex((entry) => entry.tag === tag);
  if (last < 0) throw new Error(`unknown migration ${tag}`);

  const folder = mkdtempSync(join(tmpdir(), 'quiz-migrations-'));
  mkdirSync(join(folder, 'meta'));
  const entries = journal.entries.slice(0, last + 1);
  writeFileSync(join(folder, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }));
  for (const entry of entries) copyFileSync(join(MIGRATIONS, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));

  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: folder });
  return {
    db: db as unknown as Db,
    migrateRest: () => migrate(db, { migrationsFolder: MIGRATIONS }),
  };
}
