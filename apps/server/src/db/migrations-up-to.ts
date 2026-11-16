import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { MIGRATIONS } from './client';

export interface MigrationEntry {
  tag: string;
  /** created_at у drizzle.__drizzle_migrations (when із журналу). */
  createdAt: number;
  hash: string;
}

interface Journal {
  entries: { tag: string; when: number }[];
}

/** Міграції застосунку в порядку журналу: тег, мітка й хеш, як їх запише drizzle. */
export function appMigrations(folder = MIGRATIONS): MigrationEntry[] {
  const journal = JSON.parse(readFileSync(join(folder, 'meta/_journal.json'), 'utf8')) as Journal;
  const files = readMigrationFiles({ migrationsFolder: folder });
  return journal.entries.map((entry, index) => ({ tag: entry.tag, createdAt: entry.when, hash: files[index]!.hash }));
}

/** Тимчасова тека з першими count міграціями застосунку: щоб довести базу рівно до рівня резервної копії. */
export function migrationsUpTo(count: number, folder = MIGRATIONS): string {
  const journal = JSON.parse(readFileSync(join(folder, 'meta/_journal.json'), 'utf8')) as Journal;
  if (count > journal.entries.length) throw new Error(`only ${journal.entries.length} migrations are known, ${count} asked`);
  const target = mkdtempSync(join(tmpdir(), 'quiz-migrations-'));
  mkdirSync(join(target, 'meta'));
  const entries = journal.entries.slice(0, count);
  writeFileSync(join(target, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }));
  for (const entry of entries) copyFileSync(join(folder, `${entry.tag}.sql`), join(target, `${entry.tag}.sql`));
  return target;
}
