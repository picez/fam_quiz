/**
 * Вимірювання профілю (план 46): медіани publicProfile, achievementsPage (чужа й своя), ownProfile, playerHistory,
 * а також самих playerGames і careerInputs; для кожного — число запитів і п'ять найповільніших.
 *
 *   pnpm --filter @quiz/server profile:timing <userId> [--runs 5]   — база DATABASE_URL (локальна копія після db:restore)
 *   pnpm --filter @quiz/server profile:timing --fixture [--runs 5]  — засіяна кар'єра плану 46 у PGlite в пам'яті
 *
 * Базу не мігрує (не connectDb). Перші проходи першого виклику доповнюють історію й синхронізують ачівки — тому медіана.
 * Нелокальна база (не localhost) — лише з --allow-remote: на прод скрипт не ходить без явного дозволу.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle as pgliteDrizzle } from 'drizzle-orm/pglite';
import { migrate as pgliteMigrate } from 'drizzle-orm/pglite/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createPool, MIGRATIONS, type Db } from '../src/db/client';
import * as schema from '../src/db/schema';
import { achievementsPage, careerInputs } from '../src/achievement-store';
import { playerGames, playerHistory } from '../src/history';
import { ownProfile, publicProfile } from '../src/profiles';
import { seedCareer } from '../src/testing/career-fixture';
import { describeTarget } from './db-cli';

interface Logged {
  sql: string;
  ms: number;
  rows: number;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

let log: Logged[] | null = null;

/** Обгортка query: SQL (перші 120 знаків), мс і число рядків — у log, поки він не null. */
function timed<T>(sqlOf: (args: unknown[]) => string, rowsOf: (result: T) => number, query: (...args: unknown[]) => Promise<T>) {
  return async (...args: unknown[]): Promise<T> => {
    const start = performance.now();
    const result = await query(...args);
    log?.push({ sql: sqlOf(args).replace(/\s+/g, ' ').slice(0, 120), ms: performance.now() - start, rows: rowsOf(result) });
    return result;
  };
}

const textOf = (args: unknown[]): string => {
  const first = args[0];
  if (typeof first === 'string') return first;
  if (typeof first === 'object' && first !== null && 'text' in first) return String((first as { text: unknown }).text);
  return '?';
};

async function openPostgres(url: string): Promise<{ db: Db; close: () => Promise<void> }> {
  const pool = createPool(url);
  const query = pool.query.bind(pool) as (...args: unknown[]) => Promise<{ rowCount: number | null; rows?: unknown[] }>;
  (pool as unknown as { query: unknown }).query = timed(textOf, (r) => r.rowCount ?? r.rows?.length ?? 0, query);
  return { db: drizzle(pool, { schema }) as unknown as Db, close: () => pool.end() };
}

async function openFixture(): Promise<{ db: Db; userId: string; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = pgliteDrizzle(client, { schema });
  await pgliteMigrate(db, { migrationsFolder: MIGRATIONS });
  const { userId } = await seedCareer(db as unknown as Db);
  const query = client.query.bind(client) as (...args: unknown[]) => Promise<{ rows: unknown[]; affectedRows?: number }>;
  (client as unknown as { query: unknown }).query = timed(textOf, (r) => r.rows.length || (r.affectedRows ?? 0), query);
  return { db: db as unknown as Db, userId, close: () => client.close() };
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

async function measure(name: string, runs: number, run: () => Promise<unknown>): Promise<void> {
  const totals: number[] = [];
  let last: Logged[] = [];
  for (let i = 0; i < runs; i++) {
    log = [];
    const start = performance.now();
    await run();
    totals.push(performance.now() - start);
    last = log;
    log = null;
  }
  console.log(`\n${name}: median ${median(totals).toFixed(1)} ms over ${runs} runs (${totals.map((t) => t.toFixed(0)).join(', ')}), ${last.length} queries in the last run`);
  for (const q of [...last].sort((a, b) => b.ms - a.ms).slice(0, 5)) console.log(`  ${q.ms.toFixed(1).padStart(8)} ms  ${String(q.rows).padStart(5)} rows  ${q.sql}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const runsAt = args.indexOf('--runs');
  const runs = runsAt >= 0 ? Number(args[runsAt + 1]) : 5;
  if (!Number.isInteger(runs) || runs < 1) throw new Error('--runs must be a positive integer');
  const fixture = args.includes('--fixture');
  const positional = args.filter((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--runs');

  let target: { db: Db; userId: string; close: () => Promise<void> };
  if (fixture) {
    console.log('PGlite in memory: the seeded plan 46 career (26 games).');
    target = await openFixture();
  } else {
    const userId = positional[0];
    if (userId === undefined) throw new Error('Usage: profile:timing <userId> [--runs 5] | --fixture [--runs 5]');
    const url = process.env.DATABASE_URL;
    if (url === undefined || url === '') throw new Error('DATABASE_URL is not set');
    console.log(describeTarget(url));
    let host = '';
    try {
      host = new URL(url).hostname;
    } catch {
      // describeTarget уже сказав, що адреса не читається.
    }
    if (!LOCAL_HOSTS.has(host) && !args.includes('--allow-remote')) throw new Error(`${host || 'this'} is not a local database: pass --allow-remote only with the owner's permission`);
    target = { ...(await openPostgres(url)), userId };
  }

  const { db, userId: id } = target;
  try {
    await measure('publicProfile', runs, () => publicProfile(db, id, null));
    await measure('achievementsPage (public)', runs, () => achievementsPage(db, id, false));
    await measure('achievementsPage (own)', runs, () => achievementsPage(db, id, true));
    await measure('ownProfile', runs, () => ownProfile(db, { id, name: '', email: '' }));
    await measure('playerHistory', runs, () => playerHistory(db, id));
    await measure('playerGames', runs, () => playerGames(db, id, null));
    await measure('careerInputs', runs, () => careerInputs(db, id));
  } finally {
    await target.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
