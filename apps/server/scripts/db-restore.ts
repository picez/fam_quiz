/**
 * Відновлення резервної копії бази (35) у ПОРОЖНЮ базу DATABASE_URL.
 *
 *   pnpm --filter @quiz/server db:restore <файл.jsonl.gz> [--force]
 *   pnpm --filter @quiz/server db:restore --r2 <ключ backups/db/…> [--force]     — завантажити з R2 (потрібні R2_*)
 *   pnpm --filter @quiz/server db:restore --r2-latest [--force]                   — найновіша копія з R2
 *   pnpm --filter @quiz/server db:restore --r2-list                               — показати копії в R2
 *
 * Що робить: перевіряє, що міграції копії збігаються з міграціями цього коду; доводить базу міграціями рівно до рівня копії;
 * в одній транзакції вставляє всі таблиці (зовнішні ключі повертаються з перевіркою), звіряє кількість рядків; далі застосовує
 * решту міграцій. Непорожню базу не чіпає без --force (з ним усі таблиці public спершу очищаються).
 * Після відновлення в працюючу базу (як і після ручної правки завершеної гри) веб-сервіс треба перезапустити: кеш форм ігор у пам'яті.
 */
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createPool, type Db } from '../src/db/client';
import * as schema from '../src/db/schema';
import { parseBackupKey, r2BackupStore } from '../src/db-backup';
import { backupLines, restoreBackup } from '../src/db-restore';
import { r2Objects } from '../src/storage/r2-objects';
import { describeTarget, r2FromEnv } from './db-cli';

async function source(args: string[]): Promise<{ name: string; input: Readable } | null> {
  if (args.includes('--r2-list') || args.includes('--r2-latest') || args.includes('--r2')) {
    const settings = r2FromEnv();
    const keys = (await r2BackupStore(settings).list())
      .filter((object) => parseBackupKey(object.key) !== null)
      .sort((a, b) => a.key.localeCompare(b.key));
    if (args.includes('--r2-list')) {
      for (const object of keys) console.log(`${object.key}  ${object.size} bytes`);
      if (keys.length === 0) console.log('No backups under backups/db/.');
      return null;
    }
    const at = args.indexOf('--r2');
    const key = args.includes('--r2-latest') ? keys.at(-1)?.key : args[at + 1];
    if (key === undefined || parseBackupKey(key) === null) throw new Error('Give a backup key like backups/db/2026-11-16T10-05-00Z-m0037.jsonl.gz (see --r2-list).');
    const body = await r2Objects(settings).download(key);
    if (body === null) throw new Error(`No such backup in R2: ${key}`);
    return { name: key, input: Readable.fromWeb(body as never) };
  }
  const file = args.find((arg) => !arg.startsWith('--'));
  if (file === undefined) throw new Error('Usage: db:restore <backup.jsonl.gz> | --r2 <key> | --r2-latest | --r2-list  [--force]');
  return { name: file, input: createReadStream(file) };
}

async function main() {
  const args = process.argv.slice(2);
  const from = await source(args);
  if (from === null) return;
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === '') throw new Error('DATABASE_URL is not set');
  console.log(`Restoring ${from.name} into ${describeTarget(url)}.`);
  const pool = createPool(url);
  try {
    const db = drizzle(pool, { schema });
    const result = await restoreBackup({
      db: db as unknown as Db,
      lines: backupLines(from.input),
      migrate: (folder) => migrate(db, { migrationsFolder: folder }),
      force: args.includes('--force'),
      progress: (message) => console.log(message),
    });
    const total = Object.values(result.rows).reduce((sum, n) => sum + n, 0);
    console.log(`Restored ${total} rows from the backup of ${result.createdAt} (migration level ${result.level}, ${result.tag ?? 'none'}).`);
  } finally {
    await pool.end();
  }
  // Кеш форм зіграних ігор (plays/знімок завершених ігор) живе в пам'яті сервера: після відновлення (чи ручної правки завершеної гри) сервіс треба перезапустити.
  console.log('Restart the web service now: its in-memory caches (finished-game shapes) still hold the data from before the restore.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
