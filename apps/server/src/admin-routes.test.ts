import { randomUUID } from 'node:crypto';
import { classicRound, makeQuiz, makeRoundsQuiz, single, withId } from '@quiz/engine/testing';
import type { AdminList, AdminLogEntry, AdminQuizView, AdminStats, AdminUserDetail, CalendarEvent, PrizeContent, PrizeItem, PrizePlacesInfo, Question } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as adminModule from './admin';
import { buildApp } from './app';
import { calendarEvent, prizeAward, user, userBan, userTitle } from './db/schema';
import { TEST_AUTH, signUp, startGame } from './testing/accounts';
import { createTestDb } from './testing/test-db';

vi.mock('./admin', async (importOriginal) => {
  const original = await importOriginal<typeof import('./admin')>();
  return { ...original, isAdmin: vi.fn(original.isAdmin) };
});

type Ctx = Awaited<ReturnType<typeof buildApp>>;
type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
type Person = Awaited<ReturnType<typeof signUp>> & { id: string; nickname: string };

let db: Awaited<ReturnType<typeof createTestDb>>;
let ctx: Ctx;
let a: Person;
let a2: Person;
let o: Person;
let b: Person;

const UUID = '11111111-1111-4111-8111-111111111111';
const NOT_FOUND = { error: 'not_found' };

const callOn = (app: Ctx['app'], method: Method, url: string, cookie?: string, payload?: unknown) =>
  app.inject({ method, url, payload: payload as object, headers: cookie === undefined ? {} : { cookie } });
const call = (method: Method, url: string, cookie?: string, payload?: unknown) => callOn(ctx.app, method, url, cookie, payload);

async function person(name: string, verified = false): Promise<Person> {
  const signed = await signUp(ctx.app, name);
  const me = (await call('GET', '/api/me', signed.cookie)).json() as { id: string };
  if (verified) await db.update(user).set({ emailVerified: true }).where(eq(user.id, me.id));
  const profile = (await call('GET', '/api/me/profile', signed.cookie)).json() as { nickname: string };
  return { ...signed, id: me.id, nickname: profile.nickname };
}

const content = (name: string, extra: Partial<PrizeContent> = {}): PrizeContent => ({
  name,
  trophy: { kind: 'cup', material: 'gold' },
  engraving: null,
  real: null,
  title: null,
  diploma: false,
  ...extra,
});

async function newPrize(cookie: string, name: string) {
  const response = await call('POST', '/api/me/prizes', cookie, content(name));
  expect(response.statusCode).toBe(201);
  return response.json() as PrizeItem;
}

async function lastLog(): Promise<AdminLogEntry> {
  const page = (await call('GET', '/api/admin/log', a.cookie)).json() as AdminList<AdminLogEntry>;
  return page.rows[0]!;
}

async function joinAndStart(code: string) {
  const joined = await call('POST', `/api/games/by-code/${code}/join`, undefined, { nickname: 'Оля' });
  const { playerId } = joined.json() as { playerId: string };
  const room = ctx.manager.get(code)!;
  ctx.manager.connect(room, { role: 'player', playerId });
  expect(ctx.manager.host(room, { type: 'start' })).toEqual({ ok: true });
  return room;
}

const emails = new Set<string>();

beforeAll(async () => {
  db = await createTestDb();
  ctx = await buildApp({ db, auth: TEST_AUTH, adminEmails: emails });
  a = await person('Адмінка', true);
  a2 = await person('Друга', true);
  // Адреси в наборі — у тому вигляді, як config.adminEmails їх нормалізує.
  emails.add(a.email.toLowerCase());
  emails.add(a2.email.toLowerCase());
  o = await person('Оксана');
  b = await person('Богдан');
});
afterAll(async () => {
  await ctx.app.close();
});

describe('hiding the admin panel (Review Focus 3)', () => {
  const routes: [Method, string][] = [
    ['GET', '/api/admin/stats'],
    ['GET', '/api/admin/users?q=ab&page=1'],
    ['GET', `/api/admin/users/${UUID}`],
    ['POST', `/api/admin/users/${UUID}/ban`],
    ['DELETE', `/api/admin/users/${UUID}/ban`],
    ['GET', '/api/admin/quizzes?q=ab&page=1'],
    ['GET', `/api/admin/quizzes/${UUID}`],
    ['DELETE', `/api/admin/quizzes/${UUID}`],
    ['DELETE', `/api/admin/quizzes/${UUID}/questions/q1`],
    ['DELETE', `/api/admin/prizes/${UUID}`],
    ['DELETE', `/api/admin/awards/${UUID}`],
    ['GET', '/api/admin/log?page=1'],
  ];

  it('answers anyone but an admin exactly like an unknown route', async () => {
    const unknown = await call('GET', '/api/nope');
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toEqual(NOT_FOUND);
    for (const [method, url] of routes) {
      // Зламаний JSON теж: ворота стоять до розбору тіла.
      const broken = await ctx.app.inject({ method, url, payload: '{"junk":', headers: { cookie: o.cookie, 'content-type': 'application/json' } });
      const tries = [await call(method, url), await call(method, url, o.cookie), await call(method, url, o.cookie, { junk: 1 }), broken];
      for (const response of tries) {
        expect(response.statusCode, `${method} ${url}`).toBe(404);
        expect(response.body, `${method} ${url}`).toBe(unknown.body);
        expect(response.headers['x-ratelimit-limit'], `${method} ${url}`).toBeUndefined();
      }
    }
  });

  it('never rate limits a non-admin', async () => {
    for (let i = 0; i < 130; i += 1) {
      const response = await call('GET', '/api/admin/stats', o.cookie);
      expect(response.statusCode).toBe(404);
    }
  });

  it('has no admins without the set, nor with an unverified address', async () => {
    const bare = await buildApp({ db, auth: TEST_AUTH });
    try {
      const signedIn = await callOn(bare.app, 'POST', '/api/auth/sign-in/email', undefined, { email: a.email, password: a.password });
      const cookie = String(signedIn.headers['set-cookie']).split(';')[0];
      expect((await callOn(bare.app, 'GET', '/api/admin/stats', cookie)).statusCode).toBe(404);
    } finally {
      await bare.app.close();
    }
    const unverified = await person('Неперевірена');
    emails.add(unverified.email.toLowerCase());
    const response = await call('GET', '/api/admin/stats', unverified.cookie);
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual(NOT_FOUND);
  });

  it('gives an admin the stats', async () => {
    const response = await call('GET', '/api/admin/stats', a.cookie);
    expect(response.statusCode).toBe(200);
    expect((response.json() as AdminStats).users.total).toBeGreaterThanOrEqual(4);
  });

  it('answers 400 to a bad list query and 404 to a malformed id', async () => {
    expect((await call('GET', '/api/admin/users?page=0', a.cookie)).statusCode).toBe(400);
    expect((await call('GET', '/api/admin/quizzes?extra=1', a.cookie)).json()).toEqual({ error: 'invalid_payload' });
    expect((await call('GET', `/api/admin/users/${'x'.repeat(65)}`, a.cookie)).statusCode).toBe(404);
    expect((await call('GET', '/api/admin/quizzes/not-a-uuid', a.cookie)).statusCode).toBe(404);
    expect((await call('DELETE', '/api/admin/prizes/not-a-uuid', a.cookie)).statusCode).toBe(404);
    expect((await call('DELETE', '/api/admin/awards/not-a-uuid', a.cookie)).statusCode).toBe(404);
    const users = (await call('GET', `/api/admin/users?q=${encodeURIComponent(o.nickname)}`, a.cookie)).json() as AdminList<{ id: string }>;
    expect(users.rows.map((r) => r.id)).toContain(o.id);
  });
});

describe('ban', () => {
  it('bans a host, closes the lobby, ends the session and shows the reason to admins', async () => {
    const { game } = await startGame(ctx.app, makeQuiz([single]), b.cookie);
    expect(ctx.manager.get(game.code)).toBeDefined();
    const banned = await call('POST', `/api/admin/users/${b.id}/ban`, a.cookie, { reason: 'спам' });
    expect(banned.statusCode).toBe(204);
    expect(ctx.manager.get(game.code)).toBeUndefined();
    expect((await call('GET', '/api/me', b.cookie)).statusCode).toBe(401);
    const card = (await call('GET', `/api/admin/users/${b.id}`, a.cookie)).json() as AdminUserDetail;
    expect(card.user.banned?.reason).toBe('спам');
    expect(await lastLog()).toMatchObject({ kind: 'ban', target: b.nickname, details: { reason: 'спам' } });
  });

  it('refuses to ban an admin, oneself included, an unknown person or an overlong reason', async () => {
    const other = await call('POST', `/api/admin/users/${a2.id}/ban`, a.cookie, {});
    expect(other.statusCode).toBe(409);
    expect(other.json()).toEqual({ error: 'cannot_ban_admin' });
    expect((await call('POST', `/api/admin/users/${a.id}/ban`, a.cookie)).json()).toEqual({ error: 'cannot_ban_admin' });
    expect((await call('POST', '/api/admin/users/nobody-here/ban', a.cookie, {})).statusCode).toBe(404);
    const long = await call('POST', `/api/admin/users/${o.id}/ban`, a.cookie, { reason: 'я'.repeat(501) });
    expect(long.statusCode).toBe(400);
    expect(long.json()).toEqual({ error: 'invalid_payload' });
    expect((await call('GET', `/api/admin/users/${o.id}`, a.cookie)).json()).toMatchObject({ user: { banned: null } });
  });

  it('on a frozen manager refuses to ban with 503 and writes nothing', async () => {
    const other = await buildApp({ db, auth: TEST_AUTH, adminEmails: emails });
    try {
      const host = await signUp(other.app, 'Тарас');
      const hostId = ((await callOn(other.app, 'GET', '/api/me', host.cookie)).json() as { id: string }).id;
      const { game } = await startGame(other.app, makeQuiz([single]), host.cookie);
      other.manager.freeze();
      const refused = await callOn(other.app, 'POST', `/api/admin/users/${hostId}/ban`, a.cookie, {});
      expect(refused.statusCode).toBe(503);
      expect(refused.json()).toEqual({ error: 'restarting' });
      expect(other.manager.get(game.code)).toBeDefined();
      expect((await callOn(other.app, 'GET', '/api/me', host.cookie)).statusCode).toBe(200);
      expect(await db.select().from(userBan).where(eq(userBan.userId, hostId))).toHaveLength(0);
    } finally {
      await other.app.close();
    }
  });

  it('a database error while checking the admin gives the same 404 as an unknown route', async () => {
    const unknown = await call('GET', '/api/nothing-here', a.cookie);
    vi.mocked(adminModule.isAdmin).mockRejectedValueOnce(new Error('db down'));
    const failed = await call('GET', '/api/admin/stats', a.cookie);
    expect(failed.statusCode).toBe(404);
    expect(failed.json()).toEqual(NOT_FOUND);
    expect(failed.body).toBe(unknown.body);
  });

  it('unbans, and answers 204 when there was no ban', async () => {
    expect((await call('DELETE', `/api/admin/users/${b.id}/ban`, a.cookie)).statusCode).toBe(204);
    const signedIn = await call('POST', '/api/auth/sign-in/email', undefined, { email: b.email, password: b.password });
    expect(signedIn.statusCode).toBe(200);
    expect(await lastLog()).toMatchObject({ kind: 'unban', target: b.nickname });
    expect((await call('DELETE', `/api/admin/users/${b.id}/ban`, a.cookie)).statusCode).toBe(204);
    expect((await call('DELETE', `/api/admin/users/${o.id}/ban`, a.cookie)).statusCode).toBe(204);
  });
});

describe('deleting a quiz (Review Focus 4)', () => {
  it('keeps the played game, the calendar event and the live room', async () => {
    const quiz = { ...makeQuiz([single]), title: 'Карпати' };
    const first = await startGame(ctx.app, quiz, o.cookie);
    const quizId = first.quizId;
    const played = await joinAndStart(first.game.code);
    expect(ctx.manager.host(played, { type: 'end' })).toEqual({ ok: true });
    await ctx.recorder.idle();
    await db.insert(calendarEvent).values({ hostId: o.id, title: 'Вечір', quizId, startsAt: new Date(Date.now() + 86_400_000), createdAt: new Date() });
    const live = (await call('POST', '/api/games', o.cookie, { quizId })).json() as { gameId: string; code: string };
    const room = await joinAndStart(live.code);
    const phase = room.state.phase;

    const view = await call('GET', `/api/admin/quizzes/${quizId}`, a.cookie);
    expect(view.statusCode).toBe(200);
    expect((view.json() as AdminQuizView).author).toEqual({ id: o.id, nickname: o.nickname });

    expect((await call('DELETE', `/api/admin/quizzes/${quizId}`, a.cookie)).statusCode).toBe(204);
    expect((await call('DELETE', `/api/admin/quizzes/${quizId}`, a.cookie)).statusCode).toBe(404);
    expect((await call('GET', `/api/admin/quizzes/${quizId}`, a.cookie)).statusCode).toBe(404);

    const mine = (await call('GET', '/api/quizzes', o.cookie)).json() as { id: string }[];
    expect(mine.map((q) => q.id)).not.toContain(quizId);
    const detail = await call('GET', `/api/games/${first.game.gameId}`, o.cookie);
    expect(detail.statusCode).toBe(200);
    expect((detail.json() as { title: string }).title).toBe('Карпати');
    const events = ((await call('GET', '/api/me/calendar', o.cookie)).json() as { events: CalendarEvent[] }).events;
    expect(events.find((e) => e.title === 'Вечір')?.quiz.id).toBeNull();
    expect(ctx.manager.get(live.code)!.state.phase).toBe(phase);
    expect(ctx.manager.host(ctx.manager.get(live.code)!, { type: 'next' })).toEqual({ ok: true });
    expect(await lastLog()).toMatchObject({ kind: 'quiz_delete', target: o.nickname, details: { title: 'Карпати' } });
  });
});

describe('deleting a question', () => {
  it('removes one, keeps the last one and logs its text', async () => {
    const q1: Question = { ...single, id: 'q1', text: 'Чи Говерла найвища гора України?' };
    const q2: Question = { ...withId(single, 'q2'), text: 'Чи Дніпро впадає в Балтійське море?' };
    const quiz = { ...makeRoundsQuiz([classicRound('r0', [q1, q2])]), title: 'Гори й ріки' };
    const saved = (await call('POST', '/api/quizzes', o.cookie, quiz)).json() as { id: string };

    const removed = await call('DELETE', `/api/admin/quizzes/${saved.id}/questions/q1`, a.cookie);
    expect(removed.statusCode).toBe(200);
    const view = removed.json() as AdminQuizView;
    expect(view.quiz.rounds[0]!.type === 'classic' && view.quiz.rounds[0]!.questions.map((q) => q.id)).toEqual(['q2']);
    expect(view.effects.q2).toBe('last_question');
    expect(await lastLog()).toMatchObject({ kind: 'question_delete', target: o.nickname, details: { title: 'Гори й ріки', text: q1.text } });

    const last = await call('DELETE', `/api/admin/quizzes/${saved.id}/questions/q2`, a.cookie);
    expect(last.statusCode).toBe(409);
    expect(last.json()).toEqual({ error: 'last_question' });
    expect((await call('DELETE', `/api/admin/quizzes/${saved.id}/questions/nope`, a.cookie)).statusCode).toBe(404);
    expect((await call('DELETE', `/api/admin/quizzes/${UUID}/questions/q2`, a.cookie)).statusCode).toBe(404);
  });
});

describe('prizes and awards', () => {
  it('deletes a prize from the stock and one reserved in a lobby', async () => {
    const free = await newPrize(o.cookie, 'Кубок Дністра');
    expect((await call('DELETE', `/api/admin/prizes/${free.id}`, a.cookie)).statusCode).toBe(204);
    expect(((await call('GET', '/api/me/prizes', o.cookie)).json() as PrizeItem[]).map((p) => p.id)).not.toContain(free.id);
    expect(await lastLog()).toMatchObject({ kind: 'prize_delete', target: o.nickname, details: { title: 'Кубок Дністра', content: content('Кубок Дністра') } });
    expect((await call('DELETE', `/api/admin/prizes/${free.id}`, a.cookie)).statusCode).toBe(404);

    const reserved = await newPrize(o.cookie, 'Зарезервований');
    const { game } = await startGame(ctx.app, makeQuiz([single]), o.cookie);
    expect((await call('PUT', `/api/games/by-code/${game.code}/prizes`, o.cookie, { places: [reserved.id, null, null] })).statusCode).toBe(200);
    expect((await call('DELETE', `/api/admin/prizes/${reserved.id}`, a.cookie)).statusCode).toBe(204);
    const info = (await call('GET', `/api/games/by-code/${game.code}/prizes`, o.cookie)).json() as PrizePlacesInfo;
    expect(info.places).toEqual([null, null, null]);
    expect(info.options.map((p) => p.id)).not.toContain(reserved.id);
  });

  it('deletes an award and the current title with the same text', async () => {
    const award = content('Грамота', { title: 'Знавець Карпат' });
    const [row] = await db
      .insert(prizeAward)
      .values({ userId: o.id, prizeId: randomUUID(), gameId: randomUUID(), place: 1, content: award, quizTitle: 'Карпати', nickname: o.nickname, awardedAt: new Date() })
      .returning();
    await db.insert(userTitle).values({ userId: o.id, text: 'Знавець Карпат', gameId: randomUUID(), awardedAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000) });
    const before = (await call('GET', `/api/profiles/${o.id}`, b.cookie)).json() as { showcase: { awards: { id: string }[]; title: unknown } };
    expect(before.showcase.awards.map((x) => x.id)).toContain(row!.id);

    expect((await call('DELETE', `/api/admin/awards/${row!.id}`, a.cookie)).statusCode).toBe(204);
    const after = (await call('GET', `/api/profiles/${o.id}`, b.cookie)).json() as { showcase: { awards: { id: string }[]; title: unknown } };
    expect(after.showcase.awards.map((x) => x.id)).not.toContain(row!.id);
    expect(after.showcase.title).toBeNull();
    expect(await lastLog()).toMatchObject({ kind: 'award_delete', target: o.nickname, details: { title: 'Карпати', content: award } });
    expect((await call('DELETE', `/api/admin/awards/${row!.id}`, a.cookie)).statusCode).toBe(404);
  });

  it('keeps a title with a different text', async () => {
    const [row] = await db
      .insert(prizeAward)
      .values({ userId: b.id, prizeId: randomUUID(), gameId: randomUUID(), place: 2, content: content('Медаль', { title: 'Інше' }), quizTitle: 'Ріки', nickname: b.nickname, awardedAt: new Date() })
      .returning();
    await db.insert(userTitle).values({ userId: b.id, text: 'Знавець рік', gameId: randomUUID(), awardedAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000) });
    expect((await call('DELETE', `/api/admin/awards/${row!.id}`, a.cookie)).statusCode).toBe(204);
    expect(((await call('GET', `/api/admin/users/${b.id}`, a.cookie)).json() as AdminUserDetail).title?.text).toBe('Знавець рік');
  });
});

describe('the log', () => {
  it('lists the newest action first with the admin nickname and no admin email', async () => {
    expect((await call('DELETE', `/api/admin/users/${o.id}/ban`, a.cookie)).statusCode).toBe(204);
    await call('POST', `/api/admin/users/${o.id}/ban`, a.cookie, { reason: '' });
    const response = await call('GET', '/api/admin/log', a.cookie);
    expect(response.statusCode).toBe(200);
    const page = response.json() as AdminList<AdminLogEntry>;
    expect(page.rows[0]).toMatchObject({ kind: 'ban', admin: a.nickname, target: o.nickname, details: { reason: null } });
    expect(response.body).not.toContain(a.email);
    expect(response.body.toLowerCase()).not.toContain(a.email.toLowerCase());
    expect((await call('GET', '/api/admin/log?page=x', a.cookie)).statusCode).toBe(400);
  });
});
