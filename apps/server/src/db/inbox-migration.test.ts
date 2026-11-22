import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createTestDbUpTo } from '../testing/test-db';

const REPLIED = '2026-11-20T10:00:00.000Z';

describe('the inbox migration (70)', () => {
  it('moves earlier replies into the inbox unread and copies people_count into push_people', async () => {
    const { db, migrateRest } = await createTestDbUpTo('0049_merged_email');
    // Дані у форматі до 70: сирим SQL, бо в схемі вже є нові колонки.
    await db.execute(sql`insert into "user" (id, name, email) values ('u1', 'Олена', 'olena@example.com')`);
    await db.execute(sql`insert into problem_report (id, user_id, from_account, text, status, reply, replied_at, created_at)
      values ('11111111-1111-4111-8111-111111111111', 'u1', true, 'Зависла гра', 'resolved', 'Виправили', ${REPLIED}, '2026-11-19T10:00:00.000Z')`);
    await db.execute(sql`insert into problem_report (user_id, from_account, text, created_at) values (null, false, 'Гість пише', '2026-11-19T11:00:00.000Z')`);
    await db.execute(sql`insert into problem_report (user_id, from_account, text, created_at) values ('u1', true, 'Без відповіді', '2026-11-19T12:00:00.000Z')`);
    await db.execute(sql`insert into push_broadcast (title, text, recipients, people_count, created_at) values ('Розсилка', 'Текст', 'all', 3, '2026-11-18T10:00:00.000Z')`);

    await migrateRest();

    const inbox = (await db.execute(sql`select user_id, kind, problem_id, broadcast_id, read_at, created_at from inbox_item`)) as { rows: Record<string, unknown>[] };
    expect(inbox.rows).toHaveLength(1);
    expect(inbox.rows[0]).toMatchObject({ user_id: 'u1', kind: 'problem_reply', problem_id: '11111111-1111-4111-8111-111111111111', broadcast_id: null, read_at: null });
    expect(new Date(String(inbox.rows[0]!.created_at)).toISOString()).toBe(REPLIED);
    const broadcasts = (await db.execute(sql`select push_people from push_broadcast`)) as { rows: Record<string, unknown>[] };
    expect(broadcasts.rows).toEqual([{ push_people: 3 }]);
    const games = (await db.execute(sql`select game from problem_report`)) as { rows: Record<string, unknown>[] };
    expect(games.rows.every((row) => row.game === null)).toBe(true);
  });
});
