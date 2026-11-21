import { makeQuiz, single } from '@quiz/engine/testing';
import { BOT_USER_ID, type AccountMergePreview, type AdminList, type AdminLogEntry, type AdminUserDetail, type MergeSummary } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { adminAction, participant, user } from './db/schema';
import { seedGame } from './testing/history-rows';
import { TEST_AUTH, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';

type Ctx = Awaited<ReturnType<typeof buildApp>>;
type Method = 'GET' | 'POST';
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

async function personOn(app: Ctx['app'], name: string, verified = false): Promise<Person> {
  const signed = await signUp(app, name);
  const me = (await callOn(app, 'GET', '/api/me', signed.cookie)).json() as { id: string };
  if (verified) await db.update(user).set({ emailVerified: true }).where(eq(user.id, me.id));
  const found = (await callOn(app, 'GET', '/api/me/profile', signed.cookie)).json() as { nickname: string };
  return { ...signed, id: me.id, nickname: found.nickname };
}
const person = (name: string, verified = false) => personOn(ctx.app, name, verified);
const logCount = async () => (await db.select().from(adminAction)).length;
const exists = async (id: string) => (await db.select().from(user).where(eq(user.id, id))).length === 1;

async function playedOnce(userId: string, title: string): Promise<string> {
  const host = await person('Ведучий');
  const { gameId } = await seedGame(db, {
    hostId: host.id,
    startedAt: new Date('2026-06-01T10:00:00Z'),
    title,
    players: [
      { userId, nickname: 'Друга', score: 12, rank: 1 },
      { userId: null, nickname: 'Гість', score: 4, rank: 2 },
    ],
  });
  return gameId;
}

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

describe('merge routes on the player card (66)', () => {
  it('the preview shows counts, logins and the confirmation label; a non-admin gets 404', async () => {
    const primary = await person('Головна');
    const secondary = await person('Друга');
    await playedOnce(secondary.id, 'Перегляд');
    const before = await logCount();

    const response = await call('GET', `/api/admin/users/${primary.id}/merge/${secondary.id}`);
    expect(response.statusCode).toBe(200);
    const preview = response.json() as AccountMergePreview;
    expect(preview.primary).toMatchObject({ id: primary.id, nickname: primary.nickname, logins: ['credential'] });
    expect(preview.secondary).toMatchObject({ id: secondary.id, nickname: secondary.nickname, email: secondary.email, logins: ['credential'] });
    expect(preview.confirm).toBe(secondary.nickname);
    expect(preview.refusal).toBeNull();
    // У головного свій пароль: пароль другого не переходить (logins порожні), перегляд попереджає.
    expect(preview.summary).toMatchObject({ games: 1, logins: [], passwordDropped: true });
    expect(preview.after).toEqual({ level: expect.any(Number), xp: expect.any(Number) });
    // Перегляд нічого не змінює й у журнал не пишеться.
    expect(await exists(secondary.id)).toBe(true);
    expect(await logCount()).toBe(before);

    expect((await callOn(ctx.app, 'GET', `/api/admin/users/${primary.id}/merge/${secondary.id}`, other.cookie)).statusCode).toBe(404);
    expect((await callOn(ctx.app, 'GET', `/api/admin/users/${primary.id}/merge/${secondary.id}`)).statusCode).toBe(404);
    expect((await callOn(ctx.app, 'POST', `/api/admin/users/${primary.id}/merge`, other.cookie, { secondaryId: secondary.id, confirm: secondary.nickname })).statusCode).toBe(404);
    expect(await exists(secondary.id)).toBe(true);
    expect((await call('GET', `/api/admin/users/${primary.id}/merge/nobody`)).statusCode).toBe(404);
    expect((await call('GET', `/api/admin/users/${primary.id}/merge/${'x'.repeat(65)}`)).statusCode).toBe(404);

    // Відмова — причина в refusal, без підсумку.
    const banned = await person('Забанена');
    expect((await call('POST', `/api/admin/users/${banned.id}/ban`, { reason: 'Спам' })).statusCode).toBe(204);
    const refused = (await call('GET', `/api/admin/users/${primary.id}/merge/${banned.id}`)).json() as AccountMergePreview;
    expect(refused).toMatchObject({ refusal: 'merge_banned', summary: null, after: null });
  });

  it('a wrong confirmation is 400 confirm_mismatch and nothing changes', async () => {
    const primary = await person('Головна');
    const secondary = await person('Друга');
    const before = await logCount();
    const wrong = await call('POST', `/api/admin/users/${primary.id}/merge`, { secondaryId: secondary.id, confirm: 'Петро' });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json()).toEqual({ error: 'confirm_mismatch' });
    // Регістр має значення (точний збіг, як у видаленні 58).
    const upper = await call('POST', `/api/admin/users/${primary.id}/merge`, { secondaryId: secondary.id, confirm: secondary.nickname.toLocaleUpperCase('uk') });
    expect(upper.json()).toEqual({ error: 'confirm_mismatch' });
    expect((await call('POST', `/api/admin/users/${primary.id}/merge`, { secondaryId: secondary.id })).json()).toEqual({ error: 'invalid_payload' });
    expect((await call('POST', `/api/admin/users/${primary.id}/merge`, { secondaryId: secondary.id, confirm: 'x', extra: 1 })).statusCode).toBe(400);
    expect(await exists(secondary.id)).toBe(true);
    expect(await logCount()).toBe(before);
    expect((await callOn(ctx.app, 'GET', '/api/me', secondary.cookie)).statusCode).toBe(200);
  });

  it('merging while one of them plays is 409 merge_live', async () => {
    const primary = await person('Головна');
    const secondary = await person('Друга');
    const room = ctx.manager.create(quizOne, null, null);
    const joined = ctx.manager.join(room.code, 'Друга', secondary.id);
    expect(joined.ok).toBe(true);
    const refused = await call('POST', `/api/admin/users/${primary.id}/merge`, { secondaryId: secondary.id, confirm: secondary.nickname });
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({ error: 'merge_live' });
    expect(await exists(secondary.id)).toBe(true);
    // Перегляд показує ту саму причину.
    const preview = (await call('GET', `/api/admin/users/${secondary.id}/merge/${primary.id}`)).json() as AccountMergePreview;
    expect(preview).toMatchObject({ refusal: 'merge_live', summary: null, after: null });
    expect(ctx.manager.closeByAdmin(room.code)).toBe('closed');
  });

  it('the bot as either side is 404, the same id twice is 400 merge_same', async () => {
    const someone = await person('Хтось');
    expect((await call('GET', `/api/admin/users/${BOT_USER_ID}/merge/${someone.id}`)).statusCode).toBe(404);
    expect((await call('GET', `/api/admin/users/${someone.id}/merge/${BOT_USER_ID}`)).statusCode).toBe(404);
    expect((await call('POST', `/api/admin/users/${BOT_USER_ID}/merge`, { secondaryId: someone.id, confirm: someone.nickname })).statusCode).toBe(404);
    expect((await call('POST', `/api/admin/users/${someone.id}/merge`, { secondaryId: BOT_USER_ID, confirm: 'x' })).statusCode).toBe(404);
    const sameGet = await call('GET', `/api/admin/users/${someone.id}/merge/${someone.id}`);
    expect(sameGet.statusCode).toBe(400);
    expect(sameGet.json()).toEqual({ error: 'merge_same' });
    const samePost = await call('POST', `/api/admin/users/${someone.id}/merge`, { secondaryId: someone.id, confirm: someone.nickname });
    expect(samePost.statusCode).toBe(400);
    expect(samePost.json()).toEqual({ error: 'merge_same' });
    expect((await call('POST', '/api/admin/users/nobody/merge', { secondaryId: someone.id, confirm: someone.nickname })).statusCode).toBe(404);
    expect(await exists(someone.id)).toBe(true);
  });

  it('a merge returns the summary, closes the secondary session (its /api/me is 401) and the primary card shows the moved game', async () => {
    const primary = await person('Головна');
    const secondary = await person('Йосип');
    const gameId = await playedOnce(secondary.id, 'Перенесена');
    // Завершена кімната в пам'яті з місцем S: після об'єднання місце прив'язане до P.
    const room = ctx.manager.create(quizOne, null, null);
    const joined = ctx.manager.join(room.code, 'Друга', secondary.id);
    if (!joined.ok) throw new Error(joined.error);
    expect(ctx.manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(ctx.manager.closeByAdmin(room.code)).toBe('ended');
    const before = await logCount();
    // Нік, набраний розкладеною формою (И + знак бреве), — той самий нік: порівняння після NFC.
    const typed = secondary.nickname.normalize('NFD');
    expect(typed).not.toBe(secondary.nickname);

    const done = await call('POST', `/api/admin/users/${primary.id}/merge`, { secondaryId: secondary.id, confirm: ` ${typed} ` });
    expect(done.statusCode).toBe(200);
    const body = done.json() as { primaryId: string; summary: MergeSummary };
    expect(body.primaryId).toBe(primary.id);
    expect(body.summary).toMatchObject({ games: 1, logins: [], passwordDropped: true });

    expect(await exists(secondary.id)).toBe(false);
    expect((await callOn(ctx.app, 'GET', '/api/me', secondary.cookie)).statusCode).toBe(401);
    expect((await callOn(ctx.app, 'GET', '/api/me', primary.cookie)).statusCode).toBe(200);
    expect(room.playerUsers.get(joined.playerId)).toBe(primary.id);
    expect(await logCount()).toBe(before + 1);
    const log = (await call('GET', '/api/admin/log?page=1')).json() as AdminList<AdminLogEntry>;
    expect(log.rows[0]!.kind).toBe('account_merge');

    const { card } = (await call('GET', `/api/admin/users/${primary.id}`)).json() as AdminUserDetail;
    expect(card.games.map((g) => g.gameId)).toContain(gameId);
    const rows = await db.select({ userId: participant.userId }).from(participant).where(eq(participant.gameId, gameId));
    expect(rows.map((r) => r.userId).sort()).toEqual([primary.id, null].sort());
    expect((await call('GET', `/api/admin/users/${secondary.id}`)).statusCode).toBe(404);
  });

  it('while restarting the merge is 503', async () => {
    const frozen = await buildApp({ db, auth: TEST_AUTH, adminEmails: emails });
    try {
      const primary = await personOn(frozen.app, 'Головна');
      const secondary = await personOn(frozen.app, 'Друга');
      frozen.manager.freeze();
      const refused = await callOn(frozen.app, 'POST', `/api/admin/users/${primary.id}/merge`, admin.cookie, { secondaryId: secondary.id, confirm: secondary.nickname });
      expect(refused.statusCode).toBe(503);
      expect(refused.json()).toEqual({ error: 'restarting' });
      const preview = await callOn(frozen.app, 'GET', `/api/admin/users/${primary.id}/merge/${secondary.id}`, admin.cookie);
      expect(preview.statusCode).toBe(503);
      expect(await exists(secondary.id)).toBe(true);
    } finally {
      await frozen.app.close();
    }
  });
});
