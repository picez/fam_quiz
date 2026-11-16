import { Readable } from 'node:stream';
import { gzipSync, gunzipSync } from 'node:zlib';
import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { makeQuiz, single } from '@quiz/engine/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import type { Db } from './db/client';
import { appMigrations } from './db/migrations-up-to';
import * as schema from './db/schema';
import { DROPPED_COLUMNS, SKIPPED_TABLES, publicTables, writeBackup } from './db-backup';
import { backupLines, restoreBackup } from './db-restore';
import { TEST_AUTH, signUp } from './testing/accounts';
import { seedGame } from './testing/history-rows';
import { createTestDb, createTestDbUpTo } from './testing/test-db';

/** Порожня база PGlite без міграцій і функція міграцій для неї, як у скрипті відновлення. */
function emptyDb() {
  const db = drizzle(new PGlite(), { schema });
  return { db: db as unknown as Db, migrate: (folder: string) => migrate(db, { migrationsFolder: folder }) };
}

async function backupOf(db: Db): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const made = await writeBackup(db, {
    open: () => ({ write: async (chunk) => void chunks.push(Buffer.from(chunk)), close: async () => {}, abort: async () => {} }),
    pauseMs: 0,
  });
  expect(made).not.toBeNull();
  return Buffer.concat(chunks);
}

const linesOf = (bytes: Buffer) => backupLines(Readable.from([bytes]));

/** Усі рядки таблиці як канонічний JSON (jsonb), відсортовані: порівняння «рядок у рядок». */
async function dumpTable(db: Db, table: string, without: readonly string[] = []): Promise<string[]> {
  const drop = without.map((column) => ` - '${column}'`).join('');
  const result = (await db.execute(sql.raw(`select (to_jsonb(t)${drop})::text as j from public."${table}" t`))) as unknown as { rows: { j: string }[] };
  return result.rows.map((row) => row.j).sort();
}

const count = async (db: Db, table: string) =>
  Number(((await db.execute(sql.raw(`select count(*)::int as n from public."${table}"`))) as unknown as { rows: { n: number }[] }).rows[0]!.n);

describe('backup and restore round trip', () => {
  let source: Db;
  let backup: Buffer;

  beforeAll(async () => {
    source = await createTestDb();
    const { app } = await buildApp({ db: source, auth: TEST_AUTH });
    const olena = await signUp(app, 'Олена');
    await signUp(app, 'Тарас');
    const me = (await app.inject({ method: 'GET', url: '/api/me/profile', headers: { cookie: olena.cookie } })).json() as { id: string };
    const saved = await app.inject({ method: 'POST', url: '/api/quizzes', payload: { ...makeQuiz([single]), title: 'Вікторина «з лапками» і \\ слешем' }, headers: { cookie: olena.cookie } });
    const quizId = (saved.json() as { id: string }).id;
    await app.close();
    const users = (await source.select({ id: schema.user.id }).from(schema.user)).map((row) => row.id);
    const taras = users.find((id) => id !== me.id)!;

    await source.insert(schema.follow).values({ followerId: me.id, followeeId: taras });
    await seedGame(source, {
      hostId: me.id,
      quizId,
      startedAt: new Date('2026-11-01T18:00:00.123Z'),
      snapshot: { title: 'Знімок', nested: [{ a: null, b: ['x', 'y\n"z"'] }], emoji: '🎉' },
      players: [
        { userId: me.id, nickname: 'Олена', score: 30, rank: 1, rows: [{ questionIndex: 0, accepted: true, points: 30, payload: { kind: 'choice', optionIds: ['a'] } as never }], adjustments: [{ seq: 1, points: 5 }] },
        { userId: null, nickname: 'Команда', score: 10, rank: 2, isTeam: true, rows: [{ questionIndex: 0, accepted: false, points: 0, answeredBy: 2 }] },
        { userId: taras, nickname: "Тарас 'гість'", score: 10, rank: 2, teamOf: 1 },
      ],
      appeals: [{ participant: 0, seq: 1, questionIndex: 0, yes: 2, no: 1, outcome: 'accepted' as never }],
    });
    // Мікросекунди й пояс, масив із комами, лапками й кирилицею.
    await source.execute(sql`update profile set favorite_stickers = ${'{"a,b","c\\"d",Слон}'}::text[], last_seen_at = '2026-11-16 10:00:00.123456+02' where user_id = ${me.id}`);
    // Число, якого не вмістить double JS: точність має пережити копію.
    await source.execute(sql`update game set quiz_snapshot = jsonb_set(quiz_snapshot, '{big}', '12345678901234567890123.000000000000000001'::jsonb)`);
    await source.execute(sql`update account set access_token = 'secret-access', refresh_token = 'secret-refresh', id_token = 'secret-id'`);
    await source.insert(schema.verification).values({ id: 'v1', identifier: 'x', value: 'token', expiresAt: new Date() });
    await source.insert(schema.liveRoom).values({ code: '123456', roomId: '00000000-0000-4000-8000-000000000001', data: { live: true }, updatedAt: new Date() });
    backup = await backupOf(source);
  });

  it('restores every table row for row into an empty database', async () => {
    const target = emptyDb();
    const result = await restoreBackup({ db: target.db, lines: linesOf(backup), migrate: target.migrate });
    expect(result.level).toBe(appMigrations().length);

    const tables = await publicTables(source);
    expect(await publicTables(target.db)).toEqual(tables);
    let filled = 0;
    for (const table of tables) {
      if ((SKIPPED_TABLES as readonly string[]).includes(table)) {
        expect(await count(target.db, table), table).toBe(0);
        continue;
      }
      const dropped = DROPPED_COLUMNS[table] ?? [];
      const before = await dumpTable(source, table, dropped);
      expect(await dumpTable(target.db, table, dropped), table).toEqual(before);
      if (before.length > 0) filled += 1;
    }
    // Представницькі дані: користувачі, акаунти, профілі, вікторини, гра з учасниками, відповідями, коригуваннями, апеляціями, друзі.
    expect(filled).toBeGreaterThanOrEqual(10);
    expect(await count(source, 'session')).toBeGreaterThan(0);
    expect(await count(source, 'live_room')).toBe(1);

    const tokens = await target.db.execute(sql`select access_token, refresh_token, id_token, password from account`);
    for (const row of (tokens as unknown as { rows: Record<string, string | null>[] }).rows) {
      expect(row).toMatchObject({ access_token: null, refresh_token: null, id_token: null });
      expect(row.password).toEqual(expect.any(String));
    }
    const exact = await target.db.execute(sql`select to_char(last_seen_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') as at, favorite_stickers from profile where last_seen_at is not null`);
    expect((exact as unknown as { rows: unknown[] }).rows).toEqual([{ at: '2026-11-16 08:00:00.123456', favorite_stickers: ['a,b', 'c"d', 'Слон'] }]);
    const snapshot = await target.db.execute(sql`select quiz_snapshot->>'big' as big from game`);
    expect((snapshot as unknown as { rows: unknown[] }).rows).toEqual([{ big: '12345678901234567890123.000000000000000001' }]);

    // Зовнішні ключі повернуто: сирота не вставиться.
    await expect(target.db.execute(sql`insert into follow (follower_id, followee_id) values ('nobody', 'none')`)).rejects.toThrow();
    // Міграції записані, тож сервер на старті нічого не перезастосує.
    const applied = await target.db.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
    expect((applied as unknown as { rows: { n: number }[] }).rows[0]!.n).toBe(appMigrations().length);
  });

  it('refuses a non-empty database unless forced', async () => {
    const target = emptyDb();
    await restoreBackup({ db: target.db, lines: linesOf(backup), migrate: target.migrate });
    await expect(restoreBackup({ db: target.db, lines: linesOf(backup), migrate: target.migrate })).rejects.toThrow('not empty');
    await target.db.execute(sql`delete from "user" where email like 'user%'`);
    await target.db.execute(sql`insert into "user" (id, name, email) values ('stray', 'Чужий', 'stray@example.com')`);
    await restoreBackup({ db: target.db, lines: linesOf(backup), migrate: target.migrate, force: true });
    expect(await dumpTable(target.db, 'user')).toEqual(await dumpTable(source, 'user'));
  });

  it('a truncated backup restores nothing', async () => {
    const lines = gunzipSync(backup).toString('utf8').trimEnd().split('\n');
    const cut = gzipSync(Buffer.from(`${lines.slice(0, -1).join('\n')}\n`));
    const target = emptyDb();
    await expect(restoreBackup({ db: target.db, lines: linesOf(cut), migrate: target.migrate })).rejects.toThrow('truncated');
    expect(await count(target.db, 'user')).toBe(0);
    await expect(restoreBackup({ db: target.db, lines: linesOf(gzipSync('{"hello":1}\n')), migrate: target.migrate })).rejects.toThrow('not a database backup');
  });

  it('refuses a database migrated past the backup', async () => {
    const old = await createTestDbUpTo('0030_showcase_pins');
    const target = await createTestDb();
    await expect(restoreBackup({ db: target, lines: linesOf(await backupOf(old.db)), migrate: async () => {} })).rejects.toThrow('past the backup');
  });

  it('an older backup is restored at its own level and then migrated forward', async () => {
    const old = await createTestDbUpTo('0030_showcase_pins');
    await old.db.execute(sql`insert into "user" (id, name, email) values ('u1', 'Оля', 'olya@example.com')`);
    await old.db.execute(sql`insert into profile (user_id, nickname, nickname_key) values ('u1', 'Оля', 'оля')`);
    const bytes = await backupOf(old.db);
    const header = JSON.parse(gunzipSync(bytes).toString('utf8').split('\n')[0]!) as { level: number; tag: string };
    expect(header).toMatchObject({ level: 31, tag: '0030_showcase_pins' });

    const target = emptyDb();
    await restoreBackup({ db: target.db, lines: linesOf(bytes), migrate: target.migrate });
    await old.migrateRest();
    for (const table of ['user', 'profile']) expect(await dumpTable(target.db, table), table).toEqual(await dumpTable(old.db, table));
  });
});
