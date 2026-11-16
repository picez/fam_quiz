import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { sql } from 'drizzle-orm';
import { MIGRATIONS, type Db } from './db/client';
import { appMigrations, migrationsUpTo } from './db/migrations-up-to';
import { BACKUP_FORMAT, BACKUP_VERSION, publicTables, type BackupHeader } from './db-backup';

/**
 * Відновлення копії з db-backup.ts у порожню базу (35): міграції рівно до рівня копії, рядки всіх таблиць в одній транзакції
 * (зовнішні ключі знімаються на час вставки й повертаються з перевіркою — є посилання таблиці на саму себе), послідовності
 * за максимумом, звірка кількості рядків із підсумком копії, а потім решта міграцій застосунку, як на старті сервера.
 */

/** Рядки розпакованої копії: потік gzip → рядки тексту без \n. */
export async function* backupLines(input: Readable): AsyncGenerator<string> {
  const gunzip = createGunzip();
  const piping = pipeline(input, gunzip);
  piping.catch(() => {});
  const decoder = new TextDecoder();
  let rest = '';
  for await (const chunk of gunzip as AsyncIterable<Buffer>) {
    rest += decoder.decode(chunk, { stream: true });
    let from = 0;
    for (let at = rest.indexOf('\n'); at >= 0; at = rest.indexOf('\n', from)) {
      yield rest.slice(from, at);
      from = at + 1;
    }
    rest = rest.slice(from);
  }
  await piping;
  rest += decoder.decode();
  if (rest !== '') yield rest;
}

export interface RestoreOptions {
  db: Db;
  lines: AsyncIterable<string>;
  /** Застосувати міграції з теки (drizzle migrate для потрібного драйвера). */
  migrate: (folder: string) => Promise<void>;
  /** Дозволити непорожню базу: усі таблиці public очищаються (truncate) перед відновленням. */
  force?: boolean;
  /** Рядків за одну вставку. */
  batchRows?: number;
  progress?: (message: string) => void;
}

export interface RestoreResult {
  level: number;
  tag: string | null;
  createdAt: string;
  rows: Record<string, number>;
}

const BATCH_CHARS = 2 * 1024 * 1024;

const rowsOf = <T>(result: unknown) => (result as { rows: T[] }).rows;

async function appliedMigrations(db: Db): Promise<string[]> {
  const exists = rowsOf<{ name: string | null }>(await db.execute(sql`select to_regclass('drizzle.__drizzle_migrations')::text as name`));
  if (exists[0]?.name == null) return [];
  const rows = rowsOf<{ hash: string }>(await db.execute(sql`select hash from drizzle.__drizzle_migrations order by created_at, id`));
  return rows.map((row) => row.hash);
}

interface Marker {
  $: 'table' | 'end' | 'footer';
  name?: string;
  columns?: string[];
  rows?: number | Record<string, number>;
}

const isMarker = (line: string) => line.startsWith('{"$":');

export async function restoreBackup(options: RestoreOptions): Promise<RestoreResult> {
  const { db, migrate } = options;
  const say = options.progress ?? (() => {});
  const batchRows = options.batchRows ?? 500;
  const iterator = options.lines[Symbol.asyncIterator]();

  const first = await iterator.next();
  if (first.done === true || !isMarker(first.value)) throw new Error('this is not a database backup (no header line)');
  const header = JSON.parse(first.value) as BackupHeader;
  if (header.$ !== 'header' || header.format !== BACKUP_FORMAT) throw new Error('this is not a database backup (unknown header)');
  if (header.version > BACKUP_VERSION) throw new Error(`backup format ${header.version} is newer than this code understands (${BACKUP_VERSION})`);

  // Міграції копії мають бути початком міграцій цього коду, байт у байт.
  const known = appMigrations();
  if (header.level > known.length) {
    throw new Error(`the backup is at migration ${header.level} but this code knows only ${known.length}: restore with newer code`);
  }
  header.migrations.forEach((migration, index) => {
    if (known[index]!.hash !== migration.hash) throw new Error(`migration ${known[index]!.tag} differs from the one the backup was made with`);
  });

  const applied = await appliedMigrations(db);
  if (applied.length > header.level) {
    throw new Error(`the database is already migrated to ${applied.length}, past the backup's ${header.level}: restore into a new empty database`);
  }
  applied.forEach((hash, index) => {
    if (known[index]!.hash !== hash) throw new Error(`the database has a different migration ${known[index]!.tag}`);
  });

  const existing = await publicTables(db);
  const filled: string[] = [];
  for (const table of existing) {
    const found = rowsOf<{ yes: boolean }>(await db.execute(sql`select exists (select 1 from public.${sql.identifier(table)}) as yes`));
    if (found[0]?.yes === true) filled.push(table);
  }
  if (filled.length > 0) {
    if (options.force !== true) throw new Error(`the database is not empty (${filled.join(', ')}); pass --force to wipe it first`);
    say(`Wiping ${existing.length} tables (--force).`);
    await db.execute(sql.raw(`truncate table ${existing.map((table) => `public."${table}"`).join(', ')} restart identity cascade`));
  }

  say(`Migrating to the backup's level ${header.level} (${header.tag ?? 'none'}).`);
  await migrate(migrationsUpTo(header.level));

  const rows: Record<string, number> = {};
  await db.transaction(async (raw) => {
    const tx = raw as unknown as Db;
    const tables = new Set(await publicTables(tx));
    const keys = rowsOf<{ tbl: string; name: string; def: string }>(
      await tx.execute(sql`
        select c.conrelid::regclass::text as tbl, c.conname as name, pg_get_constraintdef(c.oid) as def
        from pg_constraint c join pg_namespace n on n.oid = c.connamespace
        where c.contype = 'f' and n.nspname = 'public'`),
    );
    for (const key of keys) await tx.execute(sql.raw(`alter table ${key.tbl} drop constraint "${key.name.replace(/"/g, '""')}"`));

    let table: string | null = null;
    let columns: string[] = [];
    let batch: string[] = [];
    let chars = 0;
    let footer: Record<string, number> | null = null;

    const flush = async () => {
      if (batch.length === 0 || table === null) return;
      const list = sql.join(columns.map((column) => sql.identifier(column)), sql`, `);
      const payload = `[${batch.join(',')}]`;
      await tx.execute(
        sql`insert into public.${sql.identifier(table)} (${list}) overriding system value select ${list} from json_populate_recordset(null::public.${sql.identifier(table)}, ${payload}::json)`,
      );
      rows[table] = (rows[table] ?? 0) + batch.length;
      batch = [];
      chars = 0;
    };

    for (let next = await iterator.next(); next.done !== true; next = await iterator.next()) {
      const line = next.value;
      if (line === '') continue;
      if (!isMarker(line)) {
        if (table === null) throw new Error('a row outside of a table section');
        batch.push(line);
        chars += line.length;
        if (batch.length >= batchRows || chars >= BATCH_CHARS) await flush();
        continue;
      }
      const marker = JSON.parse(line) as Marker;
      if (marker.$ === 'table') {
        if (!tables.has(marker.name!)) throw new Error(`table ${marker.name} from the backup does not exist at its migration level`);
        table = marker.name!;
        columns = marker.columns!;
        rows[table] = 0;
      } else if (marker.$ === 'end') {
        await flush();
        if (table !== marker.name || rows[table] !== marker.rows) throw new Error(`table ${marker.name}: expected ${String(marker.rows)} rows, restored ${rows[marker.name!] ?? 0}`);
        say(`  ${table}: ${rows[table]}`);
        table = null;
      } else if (marker.$ === 'footer') {
        footer = marker.rows as Record<string, number>;
      }
    }
    if (footer === null || table !== null) throw new Error('the backup is truncated (no footer): nothing was restored');
    for (const name of header.tables) {
      if (footer[name] !== rows[name]) throw new Error(`table ${name}: the footer says ${footer[name]} rows, restored ${rows[name] ?? 0}`);
    }

    for (const key of keys) await tx.execute(sql.raw(`alter table ${key.tbl} add constraint "${key.name.replace(/"/g, '""')}" ${key.def}`));

    const sequences = rowsOf<{ tbl: string; col: string; seq: string | null }>(
      await tx.execute(sql`
        select table_name as tbl, column_name as col, pg_get_serial_sequence(quote_ident(table_name), column_name) as seq
        from information_schema.columns
        where table_schema = 'public' and (column_default like 'nextval(%' or is_identity = 'YES')`),
    );
    for (const { tbl, col, seq } of sequences) {
      if (seq === null) continue;
      await tx.execute(
        sql`select setval(${seq}, coalesce((select max(${sql.identifier(col)}) from public.${sql.identifier(tbl)}), 0) + 1, false)`,
      );
    }
  });

  say('Applying the remaining migrations of this code.');
  await migrate(MIGRATIONS);
  return { level: header.level, tag: header.tag, createdAt: header.createdAt, rows };
}
