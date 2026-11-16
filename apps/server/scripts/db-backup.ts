/**
 * Резервна копія бази на вимогу (35): той самий формат, що й щотижнева копія сервера (src/db-backup.ts).
 *
 *   pnpm --filter @quiz/server db:backup                    — у файл ./<дата>-m<рівень>.jsonl.gz
 *   pnpm --filter @quiz/server db:backup --out <файл>       — у вказаний файл
 *   pnpm --filter @quiz/server db:backup --r2               — у R2 під backups/db/ (потрібні R2_*), зі збереженням 12 найновіших
 *
 * База — DATABASE_URL. Міграцій скрипт не запускає й нічого в базі не змінює (транзакція лише для читання).
 */
import { createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { once } from 'node:events';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createPool, type Db } from '../src/db/client';
import * as schema from '../src/db/schema';
import { expiredBackups, r2BackupStore, writeBackup } from '../src/db-backup';
import type { BackupSink } from '../src/storage/r2-objects';
import { describeTarget, r2FromEnv } from './db-cli';

function fileSink(path: string): BackupSink {
  const out = createWriteStream(path);
  return {
    async write(chunk) {
      if (!out.write(chunk)) await once(out, 'drain');
    },
    async close() {
      out.end();
      await once(out, 'finish');
    },
    async abort() {
      out.destroy();
      await unlink(path).catch(() => {});
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const toR2 = args.includes('--r2');
  const outAt = args.indexOf('--out');
  const out = outAt >= 0 ? args[outAt + 1] : undefined;
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === '') throw new Error('DATABASE_URL is not set');
  const r2 = toR2 ? r2FromEnv() : null;
  console.log(`Backing up ${describeTarget(url)}${r2 === null ? '' : ` to R2 bucket ${r2.bucket}`}.`);

  const pool = createPool(url);
  try {
    const db = drizzle(pool, { schema }) as unknown as Db;
    const store = r2 === null ? null : r2BackupStore(r2);
    let path: string | null = null;
    const stats = await writeBackup(db, {
      open: (key) => {
        if (store !== null) return store.upload(key);
        path = resolve(out ?? basename(key));
        return fileSink(path);
      },
      commit: process.env.RENDER_GIT_COMMIT ?? null,
    });
    if (stats === null) throw new Error('another backup is running right now (advisory lock taken); try again later');
    console.log(`Done: ${path ?? stats.key}, ${stats.bytes} bytes, ${stats.rows} rows in ${stats.tables} tables, ${stats.ms} ms.`);
    if (store !== null) {
      for (const key of expiredBackups(await store.list())) {
        await store.remove(key);
        console.log(`Removed old backup ${key}.`);
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
