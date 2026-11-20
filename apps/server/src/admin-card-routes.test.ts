import { randomUUID } from 'node:crypto';
import { makeQuiz, single } from '@quiz/engine/testing';
import { ADMIN_CARD_QUIZZES, BOT_USER_ID, type AdminList, type AdminLogEntry, type AdminUserDetail, type GameDetail, type PrizeContent, type PrizeItem } from '@quiz/shared';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { adminAction, familyGroup, follow, groupMember, quiz, user } from './db/schema';
import { seedGame } from './testing/history-rows';
import { TEST_AUTH, signUp, startGame } from './testing/accounts';
import { createTestDb } from './testing/test-db';

type Ctx = Awaited<ReturnType<typeof buildApp>>;
type Method = 'GET' | 'POST' | 'DELETE';
type Person = Awaited<ReturnType<typeof signUp>> & { id: string; nickname: string };

let db: Awaited<ReturnType<typeof createTestDb>>;
let ctx: Ctx;
let admin: Person;
let other: Person;
const emails = new Set<string>();
const quizOne = makeQuiz([single]);

const callOn = (app: Ctx['app'], method: Method, url: string, cookie?: string, payload?: unknown) =>
  app.inject({ method, url, payload: payload as object, headers: cookie === undefined ? {} : { cookie } });
const call = (method: Method, url: string, payload?: unknown) => callOn(ctx.app, method, url, admin.cookie, payload);

async function person(name: string, verified = false): Promise<Person> {
  const signed = await signUp(ctx.app, name);
  const me = (await callOn(ctx.app, 'GET', '/api/me', signed.cookie)).json() as { id: string };
  if (verified) await db.update(user).set({ emailVerified: true }).where(eq(user.id, me.id));
  const found = (await callOn(ctx.app, 'GET', '/api/me/profile', signed.cookie)).json() as { nickname: string };
  return { ...signed, id: me.id, nickname: found.nickname };
}

async function lastLog(): Promise<AdminLogEntry> {
  const page = (await call('GET', '/api/admin/log?page=1')).json() as AdminList<AdminLogEntry>;
  return page.rows[0]!;
}
const logCount = async () => (await db.select().from(adminAction)).length;

const content = (name: string): PrizeContent => ({ name, trophy: { kind: 'cup', material: 'gold' }, engraving: null, real: null, title: null, diploma: false });

beforeAll(async () => {
  db = await createTestDb();
  ctx = await buildApp({ db, auth: TEST_AUTH, adminEmails: emails });
  admin = await person('Адмін', true);
  emails.add(admin.email.toLowerCase());
  other = await person('Сторонній');
});
afterAll(async () => {
  await ctx.app.close();
});

async function ownQuiz(ownerId: string, title: string, at: Date): Promise<string> {
  const [row] = await db.insert(quiz).values({ ownerId, title, description: '', settings: quizOne.settings, rounds: quizOne.rounds, updatedAt: at }).returning();
  return row!.id;
}

describe('the player card read', () => {
  it('shows the overview, achievements, last 20 games, quizzes, bans and manual xp', async () => {
    const oля = await person('Оля');
    const friend = await person('Друг');
    const host = await person('Ведучий');
    for (let i = 0; i < 22; i += 1) {
      await seedGame(db, {
        hostId: host.id,
        startedAt: new Date(Date.UTC(2026, 0, 1 + i)),
        title: `Гра ${i}`,
        players: [
          { userId: oля.id, nickname: 'Оля', score: 10, rank: i < 2 ? 1 : 2 },
          { userId: null, nickname: 'Гість', score: 5, rank: i < 2 ? 2 : 1 },
        ],
      });
    }
    await ownQuiz(oля.id, 'Старша', new Date('2026-02-01T00:00:00Z'));
    const fresh = await ownQuiz(oля.id, 'Новіша', new Date('2026-03-01T00:00:00Z'));
    await db.insert(follow).values({ followerId: oля.id, followeeId: friend.id });
    const [group] = await db.insert(familyGroup).values({ name: 'Родина', emoji: '👪', inviteCode: `c-${randomUUID()}` }).returning();
    await db.insert(groupMember).values({ groupId: group!.id, userId: oля.id, role: 'owner', joinedAt: new Date() });
    expect((await call('POST', `/api/admin/users/${oля.id}/ban`, { reason: 'Спам' })).statusCode).toBe(204);
    expect((await call('DELETE', `/api/admin/users/${oля.id}/ban`)).statusCode).toBe(204);
    expect((await call('POST', `/api/admin/users/${oля.id}/xp`, { amount: 300, reason: 'Турнір' })).statusCode).toBe(200);

    const response = await call('GET', `/api/admin/users/${oля.id}`);
    expect(response.statusCode).toBe(200);
    const { card } = response.json() as AdminUserDetail;
    expect(card.overview).toMatchObject({ games: 22, wins: 2, quizzes: 2, friends: 1, groups: 1 });
    expect(card.overview.xp).toBeGreaterThanOrEqual(300);
    expect(card.overview.level).toBeGreaterThanOrEqual(1);
    expect(card.overview.registeredAt).toEqual(expect.any(String));
    expect(card.games).toHaveLength(20);
    expect(card.games[0]).toMatchObject({ title: 'Гра 21', rank: 2, playerCount: 2, score: 10 });
    expect(card.games[0]!.startedAt > card.games[19]!.startedAt).toBe(true);
    expect(card.quizzes.map((q) => q.title)).toEqual(['Новіша', 'Старша']);
    expect(card.quizzes[0]).toMatchObject({ id: fresh, questions: 1 });
    expect(card.bans.map((b) => b.kind)).toEqual(['unban', 'ban']);
    expect(card.bans[1]).toMatchObject({ admin: admin.nickname, reason: 'Спам' });
    expect(card.xp[0]).toMatchObject({ amount: 300, note: 'Турнір' });
    expect(card.achievements).toEqual(expect.any(Array));
    expect(card.blocked).toEqual([]);
  });

  it('counts every quiz but lists only the newest ADMIN_CARD_QUIZZES', async () => {
    const author = await person('Автор');
    const rows = Array.from({ length: ADMIN_CARD_QUIZZES + 2 }, (_, i) => ({
      ownerId: author.id,
      title: `Вікторина ${i}`,
      description: '',
      settings: quizOne.settings,
      rounds: quizOne.rounds,
      updatedAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
    }));
    await db.insert(quiz).values(rows);
    const { card } = (await call('GET', `/api/admin/users/${author.id}`)).json() as AdminUserDetail;
    expect(card.overview.quizzes).toBe(ADMIN_CARD_QUIZZES + 2);
    expect(card.quizzes).toHaveLength(ADMIN_CARD_QUIZZES);
    expect(card.quizzes[0]).toMatchObject({ title: `Вікторина ${ADMIN_CARD_QUIZZES + 1}`, questions: 1 });
  });
});

describe('the card routes', () => {
  it('grant, revoke, xp, gift and revoke gift answer and log', async () => {
    const target = await person('Мар’яна');
    const base = `/api/admin/users/${target.id}`;

    let before = await logCount();
    expect((await call('POST', `${base}/achievements`, { achievementId: 'first_game' })).statusCode).toBe(204);
    expect(await logCount()).toBe(before + 1);
    expect((await lastLog()).kind).toBe('achievement_grant');
    expect(((await call('GET', base)).json() as AdminUserDetail).card.achievements.map((a) => a.id)).toContain('first_game');
    const owned = await call('POST', `${base}/achievements`, { achievementId: 'first_game' });
    expect(owned.statusCode).toBe(409);
    expect(owned.json()).toEqual({ error: 'achievement_owned' });
    expect((await call('POST', `${base}/achievements`, { achievementId: 'nope' })).statusCode).toBe(400);
    expect((await call('POST', `${base}/achievements`, { achievementId: 'first_game', extra: 1 })).statusCode).toBe(400);

    before = await logCount();
    expect((await call('DELETE', `${base}/achievements/first_game`)).statusCode).toBe(204);
    expect(await logCount()).toBe(before + 1);
    expect((await lastLog()).kind).toBe('achievement_revoke');
    expect(((await call('GET', base)).json() as AdminUserDetail).card.blocked).toContain('first_game');
    // Уже забране (друга вкладка, другий адмін) — своя помилка: картка лишається, а не веде на головну.
    const notOwned = await call('DELETE', `${base}/achievements/first_game`);
    expect(notOwned.statusCode).toBe(404);
    expect(notOwned.json()).toEqual({ error: 'achievement_not_owned' });
    expect((await call('DELETE', `/api/admin/users/nobody/achievements/first_game`)).json()).toEqual({ error: 'not_found' });
    expect((await call('DELETE', `${base}/achievements/nope`)).statusCode).toBe(404);

    before = await logCount();
    const plus = await call('POST', `${base}/xp`, { amount: 120, reason: 'Бонус' });
    expect(plus.statusCode).toBe(200);
    const levelled = plus.json() as { xp: number; level: number };
    expect(levelled.xp).toBeGreaterThanOrEqual(120);
    expect(levelled.level).toEqual(expect.any(Number));
    expect(await logCount()).toBe(before + 1);
    expect((await lastLog()).kind).toBe('xp_adjust');
    before = await logCount();
    const below = await call('POST', `${base}/xp`, { amount: -5000, reason: 'Забагато' });
    expect(below.statusCode).toBe(409);
    expect(below.json()).toEqual({ error: 'xp_below_zero' });
    expect((await call('POST', `${base}/xp`, { amount: 0, reason: 'Нуль' })).statusCode).toBe(400);
    expect((await call('POST', `${base}/xp`, { amount: 5, reason: '  ' })).statusCode).toBe(400);
    expect(await logCount()).toBe(before);

    const made = await callOn(ctx.app, 'POST', '/api/me/prizes', admin.cookie, content('Кубок 58'));
    expect(made.statusCode).toBe(201);
    const { id: prizeId } = made.json() as PrizeItem;
    before = await logCount();
    const gift = await call('POST', `${base}/gifts`, { prizeId, note: 'Вітаємо' });
    expect(gift.statusCode).toBe(201);
    const { id: awardId } = gift.json() as { id: string };
    expect(await logCount()).toBe(before + 1);
    expect((await lastLog()).kind).toBe('prize_gift');
    expect((await lastLog()).details).toMatchObject({ title: 'Кубок 58', text: 'Вітаємо' });
    expect(((await call('GET', base)).json() as AdminUserDetail).awards.find((a) => a.id === awardId)?.gift).toEqual({ note: 'Вітаємо' });
    const missing = await call('POST', `${base}/gifts`, { prizeId: randomUUID() });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: 'prize_not_found' });
    expect((await call('POST', `/api/admin/users/nobody/gifts`, { prizeId })).statusCode).toBe(404);
    expect((await call('POST', `${base}/gifts`, { prizeId: 'not-a-uuid' })).statusCode).toBe(400);

    before = await logCount();
    expect((await call('DELETE', `/api/admin/gifts/${awardId}`)).statusCode).toBe(204);
    expect(await logCount()).toBe(before + 1);
    expect((await lastLog()).kind).toBe('gift_revoke');
    const goneGift = await call('DELETE', `/api/admin/gifts/${awardId}`);
    expect(goneGift.statusCode).toBe(404);
    expect(goneGift.json()).toEqual({ error: 'gift_not_found' });
    expect((await call('DELETE', '/api/admin/gifts/not-a-uuid')).statusCode).toBe(404);

    expect((await call('POST', '/api/admin/users/nobody/xp', { amount: 5, reason: 'x' })).statusCode).toBe(404);
    expect((await call('POST', `/api/admin/users/${'x'.repeat(65)}/achievements`, { achievementId: 'first_game' })).statusCode).toBe(404);
    expect((await call('POST', `/api/admin/users/${BOT_USER_ID}/xp`, { amount: 5, reason: 'x' })).statusCode).toBe(404);
  });

  it('deleting needs the exact nickname and spares admins', async () => {
    const victim = await person('Оля');
    const path = `/api/admin/users/${victim.id}`;
    const wrong = await call('DELETE', path, { confirm: 'Петро' });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json()).toEqual({ error: 'confirm_mismatch' });
    expect((await call('DELETE', path, {})).statusCode).toBe(400);
    expect((await db.select().from(user).where(eq(user.id, victim.id))).length).toBe(1);

    const second = await person('Друга', true);
    emails.add(second.email.toLowerCase());
    const adminRefused = await call('DELETE', `/api/admin/users/${second.id}`, { confirm: second.nickname });
    expect(adminRefused.statusCode).toBe(409);
    expect(adminRefused.json()).toEqual({ error: 'cannot_delete_admin' });
    const self = await call('DELETE', `/api/admin/users/${admin.id}`, { confirm: admin.nickname });
    expect(self.statusCode).toBe(409);
    expect((await call('DELETE', `/api/admin/users/${BOT_USER_ID}`, { confirm: 'x' })).statusCode).toBe(409);
    expect((await call('DELETE', '/api/admin/users/nobody', { confirm: 'x' })).statusCode).toBe(404);

    const hosted = await startGame(ctx.app, quizOne, victim.cookie);
    expect(ctx.manager.get(hosted.game.code)).toBeDefined();
    const before = await logCount();
    const done = await call('DELETE', path, { confirm: `${victim.nickname} ` });
    expect(done.statusCode).toBe(204);
    expect(await logCount()).toBe(before + 1);
    expect((await lastLog()).kind).toBe('account_delete');
    expect((await db.select().from(user).where(eq(user.id, victim.id))).length).toBe(0);
    expect(ctx.manager.get(hosted.game.code)?.state.phase ?? 'finished').toBe('finished');
    expect((await call('GET', path)).statusCode).toBe(404);
  });

  it('a failed deletion answers 500 delete_failed and keeps the account', async () => {
    const victim = await person('Зоя');
    await db.execute(sql`create or replace function card_fail() returns trigger as $$ begin raise exception 'boom'; end $$ language plpgsql`);
    await db.execute(sql`create trigger card_fail before delete on "user" for each row when (old.id = ${sql.raw(`'${victim.id}'`)}) execute function card_fail()`);
    try {
      const failed = await call('DELETE', `/api/admin/users/${victim.id}`, { confirm: victim.nickname });
      expect(failed.statusCode).toBe(500);
      expect(failed.json()).toEqual({ error: 'delete_failed' });
    } finally {
      await db.execute(sql`drop trigger card_fail on "user"`);
    }
    expect((await db.select().from(user).where(eq(user.id, victim.id))).length).toBe(1);
  });

  it('refuses to delete on a frozen manager', async () => {
    const frozen = await buildApp({ db, auth: TEST_AUTH, adminEmails: emails });
    try {
      const victim = await signUp(frozen.app, 'Ліна');
      const id = ((await callOn(frozen.app, 'GET', '/api/me', victim.cookie)).json() as { id: string }).id;
      const nickname = ((await callOn(frozen.app, 'GET', '/api/me/profile', victim.cookie)).json() as { nickname: string }).nickname;
      frozen.manager.freeze();
      const refused = await callOn(frozen.app, 'DELETE', `/api/admin/users/${id}`, admin.cookie, { confirm: nickname });
      expect(refused.statusCode).toBe(503);
      expect(refused.json()).toEqual({ error: 'restarting' });
      expect((await db.select().from(user).where(eq(user.id, id))).length).toBe(1);
    } finally {
      await frozen.app.close();
    }
  });

  it("the admin game view opens any host's game", async () => {
    const tarasId = (await person('Тарас')).id;
    const { gameId } = await seedGame(db, {
      hostId: tarasId,
      startedAt: new Date('2026-05-01T10:00:00Z'),
      title: 'Чужа гра',
      players: [
        { userId: null, nickname: 'Перший', score: 20, rank: 1 },
        { userId: null, nickname: 'Другий', score: 10, rank: 2 },
      ],
    });
    const before = await logCount();
    const response = await call('GET', `/api/admin/games/${gameId}`);
    expect(response.statusCode).toBe(200);
    const detail = response.json() as GameDetail;
    expect(detail.id).toBe(gameId);
    expect(detail.standings.map((p) => p.nickname)).toEqual(['Перший', 'Другий']);
    expect(await logCount()).toBe(before);
    expect((await call('GET', '/api/admin/games/not-a-uuid')).statusCode).toBe(404);
    expect((await call('GET', `/api/admin/games/${randomUUID()}`)).statusCode).toBe(404);
    expect((await callOn(ctx.app, 'GET', `/api/admin/games/${gameId}`, other.cookie)).statusCode).toBe(404);
  });

});
