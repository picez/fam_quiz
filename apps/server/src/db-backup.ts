import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { sql } from 'drizzle-orm';
import type { Db } from './db/client';
import { appMigrations } from './db/migrations-up-to';
import { log, reportError } from './log';
import { realScheduler, type Scheduler } from './rooms/scheduler';
import type { R2Settings } from './storage/r2';
import { r2Objects, type BackupSink, type StoredObject } from './storage/r2-objects';

/**
 * Щотижнева логічна копія бази (35): усі таблиці схеми public рядками JSON (row_to_json, тож типи — як їх пише сам Postgres:
 * мітки часу з мікросекундами й поясом, jsonb, масиви, числа без втрати точності, null), gzip, потоком у R2 під backups/db/.
 * pg_dump на Render у середовищі Node немає, тому копію знімає сам сервер. Відновлення — scripts/db-restore.ts (db-restore.ts).
 *
 * Формат (рядок = JSON): {"$":"header",…}, далі для кожної таблиці {"$":"table","name","columns"}, рядки таблиці, {"$":"end","name","rows"},
 * і в кінці {"$":"footer","rows":{…}} — без нього копія вважається обрізаною.
 */

export const BACKUP_PREFIX = 'backups/db/';
export const BACKUP_FORMAT = 'quiz-db-backup';
export const BACKUP_VERSION = 1;

/**
 * Не копіюються: session і verification — токени входу й підтвердження (після відновлення всі просто увійдуть знову);
 * live_room — знімки живих ігор: відновлення роблять через дні після збою, кімнати на той час мертві, а їхній формат залежить
 * від GAME_STATE_VERSION коду, що їх писав; до того ж це найбільші й найчастіше змінювані рядки.
 */
export const SKIPPED_TABLES = ['session', 'verification', 'live_room'] as const;

/**
 * Стовпці, що не копіюються (після відновлення — null): OAuth-токени Google в account. Вхід через Google їх не потребує — Better Auth
 * видає нові під час наступного входу, а копія в кошику не носить чужих ключів доступу. password (хеш) лишається, інакше входи
 * поштою й паролем пропали б.
 */
export const DROPPED_COLUMNS: Record<string, readonly string[]> = { account: ['access_token', 'refresh_token', 'id_token'] };

/** Не частіше, ніж раз на тиждень; перевірка щогодини; перша — через 5 хвилин після старту, щоб не гальмувати розгортання. */
export const BACKUP_EVERY_MS = 7 * 24 * 60 * 60 * 1000;
export const CHECK_EVERY_MS = 60 * 60 * 1000;
export const FIRST_CHECK_MS = 5 * 60 * 1000;
/** Скільки тижневих копій лишається; старіші видаляються. */
export const KEEP_BACKUPS = 12;

/**
 * Чи знімати копії за розкладом: DB_BACKUP=off — ні, DB_BACKUP=on — так, інакше лише в продакшені. Локальний сервер із ключами R2
 * у .env інакше писав би копії локальної бази поруч із продакшеновими — і найновіша «свіжа» копія була б не тієї бази.
 */
export function backupsEnabled(env: Record<string, string | undefined>): boolean {
  const mode = env.DB_BACKUP?.trim().toLowerCase();
  if (mode === 'off') return false;
  if (mode === 'on') return true;
  return env.NODE_ENV === 'production';
}

/** Ключ advisory-блокування: дві копії бази (два екземпляри під час розгортання) не знімаються одночасно. */
const LOCK_KEY = 7_315_250_035;
/** Рядків за одне FETCH курсора й пауза між порціями: мало пам'яті й м'яке навантаження на базу, поки йдуть ігри. */
const BATCH_ROWS = 500;
const BATCH_PAUSE_MS = 10;

const KEY = /^backups\/db\/(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})Z-m(\d{4})\.jsonl\.gz$/;

/** backups/db/2026-11-16T10-05-00Z-m0037.jsonl.gz: мить копії (UTC, до секунди) і кількість застосованих міграцій. */
export function backupKey(at: Date, level: number): string {
  const stamp = at.toISOString().slice(0, 19).replace(/:/g, '-');
  return `${BACKUP_PREFIX}${stamp}Z-m${String(level).padStart(4, '0')}.jsonl.gz`;
}

export function parseBackupKey(key: string): { at: Date; level: number } | null {
  const found = KEY.exec(key);
  if (found === null) return null;
  const [, y, mo, d, h, mi, s, level] = found;
  return { at: new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`), level: Number(level) };
}

/** Копії (лише ключі нашого формату) від найновішої. */
function backupsNewestFirst(objects: StoredObject[]): string[] {
  return objects
    .map((object) => object.key)
    .filter((key) => parseBackupKey(key) !== null)
    .sort()
    .reverse();
}

/** Найновіша копія (чужі ключі під префіксом ігноруються); null, коли копій немає. */
export function latestBackup(objects: StoredObject[]): StoredObject | null {
  const newest = backupsNewestFirst(objects)[0];
  return objects.find((object) => object.key === newest) ?? null;
}

/** Чи пора знімати копію: копій немає або найновішій щонайменше тиждень. */
export function isBackupDue(objects: StoredObject[], now: Date): boolean {
  const newest = backupsNewestFirst(objects)[0];
  if (newest === undefined) return true;
  return now.getTime() - parseBackupKey(newest)!.at.getTime() >= BACKUP_EVERY_MS;
}

/** Які копії видалити: усі, крім keep найновіших. Чужі ключі під префіксом не чіпаються. */
export function expiredBackups(objects: StoredObject[], keep = KEEP_BACKUPS): string[] {
  return backupsNewestFirst(objects).slice(keep);
}

export interface BackupHeader {
  $: 'header';
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  commit: string | null;
  /** Скільки міграцій застосовано (рядки drizzle.__drizzle_migrations) і остання з них. */
  level: number;
  tag: string | null;
  migrations: { hash: string; createdAt: number }[];
  tables: string[];
  skipped: string[];
  dropped: Record<string, readonly string[]>;
}

export interface BackupStats {
  key: string;
  bytes: number;
  rows: number;
  tables: number;
  ms: number;
}

interface Rows<T> {
  rows: T[];
}

const rowsOf = <T>(result: unknown) => (result as Rows<T>).rows;

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

async function readMigrations(tx: Db) {
  const exists = rowsOf<{ name: string | null }>(await tx.execute(sql`select to_regclass('drizzle.__drizzle_migrations')::text as name`));
  if (exists[0]?.name == null) return [];
  const rows = rowsOf<{ hash: string; created_at: string }>(
    await tx.execute(sql`select hash, created_at::text as created_at from drizzle.__drizzle_migrations order by created_at, id`),
  );
  return rows.map((row) => ({ hash: row.hash, createdAt: Number(row.created_at) }));
}

/** Базові таблиці схеми public за абеткою. */
export async function publicTables(db: Db): Promise<string[]> {
  const rows = rowsOf<{ name: string }>(
    await db.execute(
      sql`select table_name as name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`,
    ),
  );
  return rows.map((row) => row.name);
}

async function columnsOf(tx: Db, table: string): Promise<string[]> {
  const rows = rowsOf<{ name: string }>(
    await tx.execute(
      sql`select column_name as name from information_schema.columns where table_schema = 'public' and table_name = ${table} and is_generated = 'NEVER' order by ordinal_position`,
    ),
  );
  return rows.map((row) => row.name);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Рядки копії (кожен з \n). tx — транзакція repeatable read: усі таблиці з одного знімка, тож зовнішні ключі сходяться. */
async function* dumpLines(tx: Db, header: BackupHeader, counts: Record<string, number>, pauseMs: number, signal?: AbortSignal): AsyncGenerator<string> {
  yield `${JSON.stringify(header)}\n`;
  for (const table of header.tables) {
    signal?.throwIfAborted();
    const dropped = DROPPED_COLUMNS[table] ?? [];
    const columns = (await columnsOf(tx, table)).filter((column) => !dropped.includes(column));
    yield `${JSON.stringify({ $: 'table', name: table, columns })}\n`;
    const select = `select row_to_json(x)::text as j from (select ${columns.map(quote).join(', ')} from public.${quote(table)}) x`;
    await tx.execute(sql.raw(`declare backup_rows no scroll cursor for ${select}`));
    let count = 0;
    for (;;) {
      const batch = rowsOf<{ j: string }>(await tx.execute(sql.raw(`fetch ${BATCH_ROWS} from backup_rows`)));
      // Сирий перевід рядка в JSON можливий лише як пробіл між лексемами (у рядках він екранований), тож заміна безпечна.
      for (const row of batch) yield `${row.j.includes('\n') || row.j.includes('\r') ? row.j.replace(/[\r\n]/g, ' ') : row.j}\n`;
      count += batch.length;
      if (batch.length < BATCH_ROWS) break;
      signal?.throwIfAborted();
      if (pauseMs > 0) await sleep(pauseMs);
    }
    await tx.execute(sql.raw('close backup_rows'));
    counts[table] = count;
    yield `${JSON.stringify({ $: 'end', name: table, rows: count })}\n`;
  }
  yield `${JSON.stringify({ $: 'footer', rows: counts })}\n`;
}

export interface WriteBackupOptions {
  /** Куди писати: викликається, коли відомий ключ (з рівнем міграцій). */
  open: (key: string) => BackupSink;
  now?: Date;
  commit?: string | null;
  pauseMs?: number;
  /** Перервати копію між порціями (зупинка сервера): транзакція відкочується й віддає з'єднання. */
  signal?: AbortSignal;
  /** Блокування між екземплярами; false — хтось уже знімає копію. Типово pg_try_advisory_xact_lock. */
  tryLock?: (tx: Db) => Promise<boolean>;
  /** Перевірка після блокування (поки чекали, копію міг зняти інший екземпляр); false — не знімати. */
  stillDue?: () => Promise<boolean>;
}

const advisoryLock = async (tx: Db) =>
  rowsOf<{ ok: boolean }>(await tx.execute(sql.raw(`select pg_try_advisory_xact_lock(${LOCK_KEY}) as ok`)))[0]?.ok === true;

/** Знімає копію бази в sink. null — блокування в іншого екземпляра або stillDue відмовив; збій — виняток (недописане прибрано). */
export async function writeBackup(db: Db, options: WriteBackupOptions): Promise<BackupStats | null> {
  const started = Date.now();
  const now = options.now ?? new Date();
  return db.transaction(
    async (tx) => {
      const scoped = tx as unknown as Db;
      if (!(await (options.tryLock ?? advisoryLock)(scoped))) return null;
      if (options.stillDue !== undefined && !(await options.stillDue())) return null;
      const migrations = await readMigrations(scoped);
      const last = migrations.at(-1);
      const tag = last === undefined ? null : (appMigrations().find((entry) => entry.createdAt === last.createdAt)?.tag ?? null);
      const all = await publicTables(scoped);
      const skipped = all.filter((table) => (SKIPPED_TABLES as readonly string[]).includes(table));
      const header: BackupHeader = {
        $: 'header',
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        createdAt: now.toISOString(),
        commit: options.commit ?? null,
        level: migrations.length,
        tag,
        migrations,
        tables: all.filter((table) => !skipped.includes(table)),
        skipped,
        dropped: DROPPED_COLUMNS,
      };
      const key = backupKey(now, migrations.length);
      const sink = options.open(key);
      const counts: Record<string, number> = {};
      let bytes = 0;
      try {
        await pipeline(Readable.from(dumpLines(scoped, header, counts, options.pauseMs ?? BATCH_PAUSE_MS, options.signal)), createGzip(), async (source: AsyncIterable<Buffer>) => {
          for await (const chunk of source) {
            bytes += chunk.byteLength;
            await sink.write(chunk);
          }
        });
        await sink.close();
      } catch (error) {
        await sink.abort().catch((cleanup: unknown) => reportError(cleanup, { where: 'db-backup', what: 'abort' }));
        throw error;
      }
      const rows = Object.values(counts).reduce((sum, count) => sum + count, 0);
      return { key, bytes, rows, tables: header.tables.length, ms: Date.now() - started };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}

/** Сховище копій: лише ключі під backups/db/. */
export interface BackupStore {
  list(): Promise<StoredObject[]>;
  remove(key: string): Promise<void>;
  upload(key: string): BackupSink;
}

export function r2BackupStore(settings: R2Settings, partBytes?: number): BackupStore {
  const objects = r2Objects(settings, partBytes);
  return {
    list: () => objects.list(BACKUP_PREFIX),
    async remove(key) {
      // Видаляти можна лише копії бази, ніколи не зображення.
      if (parseBackupKey(key) === null) throw new Error('not a backup key');
      await objects.remove(key);
    },
    upload: (key) => objects.upload(key, 'application/gzip'),
  };
}

export type BackupOutcome = 'fresh' | 'busy' | 'locked' | 'failed' | BackupStats;

export interface DbBackups {
  /** Одна перевірка: зняти копію, якщо пора. Ніколи не кидає. */
  check(): Promise<BackupOutcome>;
  start(): void;
  stop(): void;
}

/**
 * Розклад копій: перша перевірка через FIRST_CHECK_MS, далі щогодини. Копія знімається, коли найновішій у сховищі тиждень або її немає;
 * після вдалої — старі понад KEEP_BACKUPS видаляються. Друга перевірка, поки йде перша, нічого не робить; два екземпляри
 * розводить advisory-блокування. Збій — у reportError, а не виняток: на ігри він не впливає.
 */
export function dbBackups(options: {
  db: Db;
  store: BackupStore;
  scheduler?: Scheduler;
  commit?: string | null;
  pauseMs?: number;
  tryLock?: (tx: Db) => Promise<boolean>;
}): DbBackups {
  const scheduler = options.scheduler ?? realScheduler;
  const { db, store } = options;
  let running = false;
  let stopped = false;
  let timer: unknown = null;
  const halt = new AbortController();

  async function check(): Promise<BackupOutcome> {
    if (running) return 'busy';
    running = true;
    try {
      const now = new Date(scheduler.now());
      if (!isBackupDue(await store.list(), now)) return 'fresh';
      const stats = await writeBackup(db, {
        open: (key) => store.upload(key),
        now,
        commit: options.commit ?? null,
        pauseMs: options.pauseMs,
        tryLock: options.tryLock,
        signal: halt.signal,
        stillDue: async () => isBackupDue(await store.list(), now),
      });
      if (stats === null) return 'locked';
      log.info({ key: stats.key, bytes: stats.bytes, rows: stats.rows, tables: stats.tables, ms: stats.ms }, 'Резервну копію бази записано.');
      for (const key of expiredBackups(await store.list())) {
        try {
          await store.remove(key);
          log.info({ key }, 'Стару резервну копію бази видалено.');
        } catch (error) {
          reportError(error, { where: 'db-backup', what: 'retention' });
        }
      }
      return stats;
    } catch (error) {
      // Зупинка сервера перериває копію (halt): транзакція відкочується, недописане прибрано; це не збій.
      if (stopped) log.warn('Резервну копію бази перервано зупинкою сервера.');
      else reportError(error, { where: 'db-backup' });
      return 'failed';
    } finally {
      running = false;
    }
  }

  function plan(ms: number) {
    if (stopped) return;
    timer = scheduler.setTimeout(() => {
      void check().finally(() => plan(CHECK_EVERY_MS));
    }, ms);
    (timer as { unref?: () => void } | null)?.unref?.();
  }

  return {
    check,
    start: () => plan(FIRST_CHECK_MS),
    stop() {
      stopped = true;
      halt.abort();
      if (timer !== null) scheduler.clearTimeout(timer);
      timer = null;
    },
  };
}
