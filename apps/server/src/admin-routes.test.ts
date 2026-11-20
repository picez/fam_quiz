import { randomUUID } from 'node:crypto';
import { blitzRound, bool, classicRound, makeQuiz, makeRoundsQuiz, multi, numeric, order, single, text, withId } from '@quiz/engine/testing';
import { BOT_USER_ID } from '@quiz/shared';
import type { AdminQuizCheck, Announcement, AdminCharts, AdminHealth, AdminList, AdminLiveList, AdminLogEntry, AdminReportItem, LibraryPage, AdminQuizView, AdminStats, AdminUserDetail, CalendarEvent, PrizeContent, PrizeItem, PrizePlacesInfo, Question, Quiz } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as adminModule from './admin';
import { buildApp } from './app';
import { ensureBotAccount } from './bot-account';
import { calendarEvent, prizeAward, profile, user, userBan, userTitle } from './db/schema';
import { TEST_AUTH, signUp, startGame } from './testing/accounts';
import { createQuiz } from './quizzes';
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
const netSpy = vi.fn(async (): Promise<Response> => {
  throw new Error('no network in tests');
});

beforeAll(async () => {
  db = await createTestDb();
  ctx = await buildApp({ db, auth: TEST_AUTH, adminEmails: emails, checkFetch: netSpy });
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
    ['POST', `/api/admin/quizzes/${UUID}/check`],
    ['DELETE', `/api/admin/quizzes/${UUID}`],
    ['DELETE', `/api/admin/quizzes/${UUID}/questions/q1`],
    ['DELETE', `/api/admin/prizes/${UUID}`],
    ['DELETE', `/api/admin/awards/${UUID}`],
    ['GET', '/api/admin/log?page=1'],
    ['POST', `/api/admin/users/${UUID}/achievements`],
    ['DELETE', `/api/admin/users/${UUID}/achievements/first_game`],
    ['POST', `/api/admin/users/${UUID}/xp`],
    ['POST', `/api/admin/users/${UUID}/gifts`],
    ['DELETE', `/api/admin/gifts/${UUID}`],
    ['DELETE', `/api/admin/users/${UUID}`],
    ['GET', `/api/admin/games/${UUID}`],
    ['GET', '/api/admin/bot'],
    ['POST', `/api/admin/bot/quizzes/${UUID}/games`],
    ['POST', '/api/admin/bot/copies'],
    ['POST', '/api/admin/bot/plans'],
    ['PUT', `/api/admin/bot/plans/${UUID}`],
    ['POST', `/api/admin/bot/plans/${UUID}/cancel`],
    ['GET', '/api/admin/bot/people?q=ol'],
    ['DELETE', `/api/admin/bot/quizzes/${UUID}`],
    ['POST', '/api/admin/bot/rooms/123456/start'],
    ['POST', '/api/admin/bot/rooms/123456/kick'],
    ['PUT', '/api/admin/bot/rooms/123456/lobby'],
    ['GET', '/api/admin/live'],
    ['POST', '/api/admin/live/123456/close'],
    ['GET', '/api/admin/charts'],
    ['GET', '/api/admin/health'],
    ['GET', '/api/admin/announcement'],
    ['PUT', '/api/admin/announcement'],
    ['DELETE', '/api/admin/announcement'],
    ['GET', '/api/admin/broadcasts'],
    ['POST', '/api/admin/broadcasts/preview'],
    ['POST', '/api/admin/broadcasts'],
    ['GET', '/api/admin/feed?page=1'],
    ['PUT', `/api/admin/feed/${UUID}/hidden`],
    ['GET', '/api/admin/groups?q=ab&page=1'],
    ['GET', `/api/admin/groups/${UUID}`],
    ['PUT', `/api/admin/groups/${UUID}/hidden`],
    ['DELETE', `/api/admin/groups/${UUID}/members/u1`],
    ['PUT', `/api/admin/groups/${UUID}/owner`],
    ['DELETE', `/api/admin/groups/${UUID}`],
    ['PUT', `/api/admin/groups/${UUID}/items/${UUID}/hidden`],
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

  it('a non-admin check reaches no network', async () => {
    netSpy.mockClear();
    const saved = await call('POST', '/api/quizzes', o.cookie, { ...makeQuiz([single]), title: 'Чужа перевірка' });
    const { id } = saved.json() as { id: string };
    for (const cookie of [undefined, o.cookie]) {
      const response = await call('POST', `/api/admin/quizzes/${id}/check`, cookie);
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual(NOT_FOUND);
    }
    expect(netSpy).not.toHaveBeenCalled();
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

describe('the report queue (39-A2)', () => {
  let author: Person;
  let r1: Person;
  let r2: Person;
  let r3: Person;
  let quizId: string;
  let entryId: string;

  beforeAll(async () => {
    author = await person('Автор');
    [r1, r2, r3] = [await person('Скаржник Один'), await person('Скаржник Два'), await person('Скаржник Три')];
    const questions = [single, multi, bool, text, numeric, order];
    const body = { ...makeRoundsQuiz([classicRound('r1', questions.slice(0, 4), { title: 'Міста' }), blitzRound('r2', questions.slice(4), { title: 'Річки' })]), title: 'Скаржена', description: 'Про міста' };
    quizId = ((await call('POST', '/api/quizzes', author.cookie, body)).json() as { id: string }).id;
    expect((await call('PUT', `/api/library/mine/${quizId}`, author.cookie, { language: 'uk' })).statusCode).toBe(200);
    entryId = ((await call('GET', '/api/library/mine', author.cookie)).json() as { entryId: string }[])[0]!.entryId;
  });

  it('the report queue is for admins only', async () => {
    const routes: [Method, string, unknown][] = [
      ['GET', '/api/admin/reports', undefined],
      ['GET', `/api/admin/reports/quiz/${entryId}`, undefined],
      ['POST', `/api/admin/reports/quiz/${entryId}`, { action: 'hide' }],
      ['POST', `/api/admin/reports/profile/${b.id}`, { action: 'reset_nickname' }],
    ];
    for (const [method, url, payload] of routes) {
      for (const cookie of [undefined, b.cookie]) {
        const response = await call(method, url, cookie, payload);
        expect(response.statusCode, `${method} ${url}`).toBe(404);
        expect(response.json()).toEqual(NOT_FOUND);
      }
    }
    const mine = (await call('GET', '/api/library/mine', author.cookie)).json() as { moderation: string }[];
    expect(mine[0]!.moderation).toBe('ok');
  });

  it('lists reports by object without who reported', async () => {
    for (const [who, reason] of [[r1, 'spam'], [r2, 'personal']] as const) {
      expect((await call('POST', '/api/reports', who.cookie, { target: { kind: 'quiz', entryId }, reason, text: 'коментар ' + who.nickname })).statusCode).toBe(201);
    }
    expect((await call('POST', '/api/reports', r1.cookie, { target: { kind: 'profile', userId: b.id }, reason: 'offensive' })).statusCode).toBe(201);
    const response = await call('GET', '/api/admin/reports', a.cookie);
    expect(response.statusCode).toBe(200);
    const page = response.json() as AdminList<AdminReportItem>;
    expect(page.rows).toHaveLength(2);
    expect(page.rows[0]).toMatchObject({ kind: 'quiz', entryId, quizId, title: 'Скаржена', author: { id: author.id, nickname: author.nickname }, reports: 2, reasons: { spam: 1, personal: 1 } });
    expect(page.rows[1]).toMatchObject({ kind: 'profile', userId: b.id, reports: 1 });
    for (const who of [r1, r2]) {
      expect(response.body).not.toContain(who.id);
      expect(response.body).not.toContain(who.email);
    }
    expect((await call('GET', '/api/admin/reports?page=x', a.cookie)).statusCode).toBe(400);
  });

  it('shows the admin the reported snapshot, not the live quiz, and never the reporters', async () => {
    const live = { ...makeRoundsQuiz([classicRound('r1', [single, multi, bool, text, numeric], { title: 'Чисте' })]), title: 'Чиста копія', description: 'Інше' };
    expect((await call('PUT', `/api/quizzes/${quizId}`, author.cookie, live)).statusCode).toBe(200);
    const response = await call('GET', `/api/admin/reports/quiz/${entryId}`, a.cookie);
    expect(response.statusCode).toBe(200);
    const view = response.json() as AdminQuizView;
    expect(view).toMatchObject({ id: quizId, author: { id: author.id, nickname: author.nickname }, effects: {} });
    expect(view.quiz.title).toBe('Скаржена');
    expect(view.quiz.rounds.map((round) => round.title)).toEqual(['Міста', 'Річки']);
    const [entry] = (await call('GET', '/api/library/mine', author.cookie)).json() as { updatedAt: string }[];
    expect(view.updatedAt).toBe(entry!.updatedAt);
    for (const who of [r1, r2]) {
      expect(response.body).not.toContain(who.id);
      expect(response.body).not.toContain(who.email);
      expect(response.body).not.toContain(who.nickname);
    }
    expect((await call('GET', `/api/admin/reports/quiz/${UUID}`, a.cookie)).statusCode).toBe(404);
    expect((await call('GET', '/api/admin/reports/quiz/not-a-uuid', a.cookie)).statusCode).toBe(404);
  });

  it('rejects a bad action or id, and an unknown entry', async () => {
    expect((await call('POST', `/api/admin/reports/quiz/${entryId}`, a.cookie, { action: 'ban' })).statusCode).toBe(400);
    expect((await call('POST', `/api/admin/reports/quiz/${entryId}`, a.cookie, { action: 'hide', extra: 1 })).statusCode).toBe(400);
    expect((await call('POST', `/api/admin/reports/profile/${b.id}`, a.cookie, { action: 'ban' })).statusCode).toBe(400);
    expect((await call('POST', `/api/admin/reports/quiz/${UUID}`, a.cookie, { action: 'hide' })).statusCode).toBe(404);
    expect((await call('POST', '/api/admin/reports/quiz/not-a-uuid', a.cookie, { action: 'hide' })).statusCode).toBe(404);
    expect((await call('POST', '/api/admin/reports/profile/nobody', a.cookie, { action: 'dismiss' })).statusCode).toBe(404);
  });

  it('an admin nickname cannot be reset', async () => {
    for (const action of ['reset_nickname', 'reset_avatar']) {
      const response = await call('POST', `/api/admin/reports/profile/${a2.id}`, a.cookie, { action });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: 'cannot_ban_admin' });
    }
    expect((await call('POST', `/api/admin/reports/profile/${a.id}`, a.cookie, { action: 'reset_nickname' })).statusCode).toBe(409);
    const [row] = await db.select({ nickname: profile.nickname }).from(profile).where(eq(profile.userId, a2.id));
    expect(row?.nickname).toBe(a2.nickname);
  });

  it('hiding takes the quiz out of the catalog and into the log; the profile actions are logged', async () => {
    expect(((await call('GET', '/api/library')).json() as LibraryPage).items.map((c) => c.id)).toContain(entryId);
    expect((await call('POST', `/api/admin/reports/quiz/${entryId}`, a.cookie, { action: 'hide' })).statusCode).toBe(204);
    expect(((await call('GET', '/api/library')).json() as LibraryPage).items.map((c) => c.id)).not.toContain(entryId);
    expect(await lastLog()).toMatchObject({ kind: 'library_hide', admin: a.nickname, target: author.nickname, details: { title: 'Скаржена' } });
    expect(((await call('GET', '/api/admin/reports', a.cookie)).json() as AdminList<AdminReportItem>).rows.map((r) => r.kind)).toEqual(['profile']);

    expect((await call('POST', `/api/admin/reports/profile/${b.id}`, a.cookie, { action: 'reset_nickname' })).statusCode).toBe(204);
    expect(await lastLog()).toMatchObject({ kind: 'nickname_reset', details: { text: b.nickname } });
    const [row] = await db.select({ nickname: profile.nickname, key: profile.nicknameKey }).from(profile).where(eq(profile.userId, b.id));
    expect(row).toEqual({ nickname: null, key: null });
    expect(((await call('GET', '/api/admin/reports', a.cookie)).json() as AdminList<AdminReportItem>).rows).toEqual([]);

    expect((await call('POST', `/api/admin/reports/quiz/${entryId}`, a.cookie, { action: 'restore' })).statusCode).toBe(204);
    expect(await lastLog()).toMatchObject({ kind: 'library_restore' });
    expect(((await call('GET', '/api/library')).json() as LibraryPage).items.map((c) => c.id)).toContain(entryId);
    expect((await call('POST', `/api/admin/reports/quiz/${entryId}`, a.cookie, { action: 'dismiss' })).statusCode).toBe(204);
    expect(await lastLog()).toMatchObject({ kind: 'report_dismiss', target: author.nickname });
    expect((await call('POST', `/api/admin/reports/profile/${r3.id}`, a.cookie, { action: 'reset_avatar' })).statusCode).toBe(204);
    expect(await lastLog()).toMatchObject({ kind: 'avatar_reset' });
  });
});

describe('live games (39-A1)', () => {
  it('lists rooms with the host nickname and no email', async () => {
    const { game } = await startGame(ctx.app, makeQuiz([single]), o.cookie);
    const response = await call('GET', '/api/admin/live', a.cookie);
    expect(response.statusCode).toBe(200);
    const list = response.json() as AdminLiveList;
    const room = list.rooms.find((r) => r.code === game.code);
    expect(room).toMatchObject({ host: o.nickname, autopilot: false, status: 'lobby', round: null, players: { online: 0, total: 0 } });
    expect(room!.stageUrl).toBe(`/stage/${game.code}#${ctx.manager.get(game.code)!.stageToken}`);
    expect(response.body).not.toContain('@');
  });

  it('closes a running game, logs it once and refuses a finished one', async () => {
    const { game } = await startGame(ctx.app, makeQuiz([single, text]), o.cookie);
    const room = await joinAndStart(game.code);
    const title = room.state.quiz.title;
    const closed = await call('POST', `/api/admin/live/${game.code}/close`, a.cookie);
    expect(closed.statusCode).toBe(204);
    expect(room.state.phase).toBe('finished');
    const logged = await lastLog();
    expect(logged).toMatchObject({ kind: 'game_close', admin: a.nickname, target: o.nickname, details: { title, code: game.code } });
    const again = await call('POST', `/api/admin/live/${game.code}/close`, a.cookie);
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: 'game_finished' });
    const page = (await call('GET', '/api/admin/log', a.cookie)).json() as AdminList<AdminLogEntry>;
    expect(page.rows[0]!.id).toBe(logged.id);
    expect(page.rows.filter((r) => r.kind === 'game_close' && r.details.code === game.code)).toHaveLength(1);
  });

  it('closes a lobby: the room is gone and a second call is 404 without a second log line', async () => {
    const { game } = await startGame(ctx.app, makeQuiz([single]), o.cookie);
    expect((await call('POST', `/api/admin/live/${game.code}/close`, a.cookie)).statusCode).toBe(204);
    expect(ctx.manager.get(game.code)).toBeUndefined();
    const logged = await lastLog();
    expect(logged).toMatchObject({ kind: 'game_close', target: o.nickname, details: { code: game.code } });
    expect((await call('POST', `/api/admin/live/${game.code}/close`, a.cookie)).statusCode).toBe(404);
    expect((await lastLog()).id).toBe(logged.id);
  });

  it('answers 404 to a bad or unknown code and 503 on a frozen manager without a log line', async () => {
    const before = await lastLog();
    const bad = await call('POST', '/api/admin/live/12ab56/close', a.cookie);
    expect(bad.statusCode).toBe(404);
    expect(bad.json()).toEqual(NOT_FOUND);
    const unknown = ctx.manager.get('999999') === undefined ? '999999' : '999998';
    const missing = await call('POST', `/api/admin/live/${unknown}/close`, a.cookie);
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual(NOT_FOUND);
    const other = await buildApp({ db, auth: TEST_AUTH, adminEmails: emails });
    try {
      const host = await signUp(other.app, 'Тарас');
      const { game } = await startGame(other.app, makeQuiz([single]), host.cookie);
      other.manager.freeze();
      const refused = await callOn(other.app, 'POST', `/api/admin/live/${game.code}/close`, a.cookie);
      expect(refused.statusCode).toBe(503);
      expect(refused.json()).toEqual({ error: 'restarting' });
      expect(other.manager.get(game.code)).toBeDefined();
    } finally {
      await other.app.close();
    }
    expect((await lastLog()).id).toBe(before.id);
  });
});

describe('charts and health (39-A3)', () => {
  it('gives 30 days and caches them for 10 minutes', async () => {
    const first = (await call('GET', '/api/admin/charts', a.cookie)).json() as AdminCharts;
    expect(first.days).toHaveLength(30);
    expect(first.days.at(-1)!.day).toBe(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date()));
    await startGame(ctx.app, makeQuiz([single]), o.cookie);
    const second = (await call('GET', '/api/admin/charts', a.cookie)).json() as AdminCharts;
    expect(second).toEqual(first);
    expect(JSON.stringify(first)).not.toContain('@');
  });

  it('shows the newest backup from the list, uptime, memory, rooms and connections', async () => {
    const lastModified = new Date('2026-11-16T10:05:00Z');
    const key = 'backups/db/2026-11-16T10-05-00Z-m0040.jsonl.gz';
    const withList = await buildApp({ db, auth: TEST_AUTH, adminEmails: emails, backupList: async () => [{ key, size: 3_500_000, lastModified }] });
    try {
      const health = (await callOn(withList.app, 'GET', '/api/admin/health', a.cookie)).json() as AdminHealth;
      expect(health.backup).toEqual({ state: 'ok', at: '2026-11-16T10:05:00.000Z', bytes: 3_500_000 });
      expect(health.uptimeSec).toBeGreaterThanOrEqual(0);
      expect(health.memory.rss).toBeGreaterThan(0);
      expect(typeof health.rooms).toBe('number');
      expect(typeof health.connections).toBe('number');
    } finally {
      await withList.app.close();
    }
    const off = (await call('GET', '/api/admin/health', a.cookie)).json() as AdminHealth;
    expect(off.backup).toEqual({ state: 'off' });
    let down = true;
    const broken = await buildApp({
      db,
      auth: TEST_AUTH,
      adminEmails: emails,
      backupList: async () => {
        if (down) throw new Error('r2 down');
        return [{ key, size: 3_500_000, lastModified }];
      },
    });
    try {
      const response = await callOn(broken.app, 'GET', '/api/admin/health', a.cookie);
      expect(response.statusCode).toBe(200);
      expect((response.json() as AdminHealth).backup).toEqual({ state: 'error' });
      // Збій не кешується на 10 хв: щойно сховище ожило, наступний запит бачить копію.
      down = false;
      const healed = (await callOn(broken.app, 'GET', '/api/admin/health', a.cookie)).json() as AdminHealth;
      expect(healed.backup).toEqual({ state: 'ok', at: '2026-11-16T10:05:00.000Z', bytes: 3_500_000 });
    } finally {
      await broken.app.close();
    }
  });
});

describe('announcement (39-A5)', () => {
  const publicRead = async (cookie?: string) => ((await call('GET', '/api/announcement', cookie)).json() as { announcement: Announcement | null }).announcement;
  const day = () => new Date(Date.now() + 86_400_000).toISOString();

  it('a guest and an account read the active announcement', async () => {
    await call('DELETE', '/api/admin/announcement', a.cookie);
    expect(await publicRead()).toBeNull();
    expect(((await call('GET', '/api/admin/announcement', a.cookie)).json() as { announcement: Announcement | null }).announcement).toBeNull();
    const put = await call('PUT', '/api/admin/announcement', a.cookie, { text: 'Для всіх', url: null, expiresAt: null });
    expect(put.statusCode).toBe(200);
    const shown = put.json() as Announcement;
    expect(await publicRead()).toEqual(shown);
    expect(await publicRead(o.cookie)).toEqual(shown);
    const admin = (await call('GET', '/api/admin/announcement', a.cookie)).json() as { announcement: Announcement | null };
    expect(admin.announcement).toEqual(shown);
    expect(JSON.stringify(shown)).not.toContain('@');
  });

  it('the admin publishes, replaces and clears it, each step in the log', async () => {
    await call('DELETE', '/api/admin/announcement', a.cookie);
    const first = await call('PUT', '/api/admin/announcement', a.cookie, { text: 'Субота — сімейна гра о 19:00', url: '/feed/calendar', expiresAt: day() });
    expect(first.statusCode).toBe(200);
    const one = first.json() as Announcement;
    expect(one.id).toBeTruthy();
    expect(await publicRead()).toEqual(one);
    expect(await lastLog()).toMatchObject({ kind: 'announcement_set', details: { text: 'Субота — сімейна гра о 19:00' } });

    const second = (await call('PUT', '/api/admin/announcement', a.cookie, { text: 'Інакше', url: null, expiresAt: null })).json() as Announcement;
    expect(second.id).not.toBe(one.id);
    expect((await publicRead())?.text).toBe('Інакше');
    expect(await lastLog()).toMatchObject({ kind: 'announcement_set', details: { text: 'Інакше' } });

    expect((await call('DELETE', '/api/admin/announcement', a.cookie)).statusCode).toBe(204);
    expect(await publicRead()).toBeNull();
    expect(await lastLog()).toMatchObject({ kind: 'announcement_clear', details: { text: 'Інакше' } });
    expect((await call('DELETE', '/api/admin/announcement', a.cookie)).statusCode).toBe(204);
    expect((await lastLog()).kind).toBe('announcement_clear');
  });

  it('refuses a past or a too distant limit, a long text and a bad link with 400', async () => {
    const put = (payload: unknown) => call('PUT', '/api/admin/announcement', a.cookie, payload);
    const past = await put({ text: 'Мить тому', expiresAt: new Date(Date.now() - 60_000).toISOString() });
    expect(past.statusCode).toBe(400);
    expect(past.json()).toEqual({ error: 'announcement_expiry' });
    const far = await put({ text: 'Задалеко', expiresAt: new Date(Date.now() + 366 * 86_400_000).toISOString() });
    expect(far.statusCode).toBe(400);
    expect(far.json()).toEqual({ error: 'announcement_expiry' });
    expect((await put({ text: 'а'.repeat(201) })).json()).toEqual({ error: 'invalid_payload' });
    expect((await put({ text: 'Лінк', url: 'javascript:alert(1)' })).json()).toEqual({ error: 'invalid_payload' });
    expect((await put({ text: 'Лінк', url: '/\\evil.example' })).statusCode).toBe(400);
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

describe('preview and check (44b)', () => {
  const MISSING = 'abcdefghijklmnop.png';
  let author: Person;
  beforeAll(async () => {
    // «o» до цього часу забанений журнальним тестом: зберегти вікторину він уже не може.
    author = await person('Автор 44b');
  });
  const withBrokenImage = (title: string) =>
    ({ ...makeRoundsQuiz([classicRound('r0', [{ ...single, timeLimit: 30, imageUrl: `/uploads/${MISSING}` }, { ...single, id: 'q2', timeLimit: 30 }])]), title }) as Quiz;
  const views = async (admin: Person) => {
    const page = (await callOn(ctx.app, 'GET', '/api/admin/log', admin.cookie)).json() as AdminList<AdminLogEntry>;
    return page.rows.filter((r) => r.kind === 'quiz_view');
  };

  it('a view is logged once a minute per admin', async () => {
    const saved = await call('POST', '/api/quizzes', author.cookie, { ...makeQuiz([single]), title: 'Для перегляду' });
    const { id } = saved.json() as { id: string };
    const before = (await views(a)).length;
    expect((await call('GET', `/api/admin/quizzes/${id}`, a.cookie)).statusCode).toBe(200);
    expect(await lastLog()).toMatchObject({ kind: 'quiz_view', target: author.nickname, details: { title: 'Для перегляду' } });
    expect((await call('GET', `/api/admin/quizzes/${id}`, a.cookie)).statusCode).toBe(200);
    expect(await views(a)).toHaveLength(before + 1);
    expect((await call('GET', `/api/admin/quizzes/${id}`, a2.cookie)).statusCode).toBe(200);
    expect(await views(a)).toHaveLength(before + 2);
    expect((await call('GET', `/api/admin/quizzes/${UUID}`, a.cookie)).statusCode).toBe(404);
    expect(await views(a)).toHaveLength(before + 2);
  });

  it('checks a quiz and answers from the cache', async () => {
    const saved = await call('POST', '/api/quizzes', author.cookie, withBrokenImage('З битою картинкою'));
    const { id } = saved.json() as { id: string };
    const first = await call('POST', `/api/admin/quizzes/${id}/check`, a.cookie);
    expect(first.statusCode).toBe(200);
    const result = first.json() as AdminQuizCheck;
    expect(result.quizId).toBe(id);
    expect(result.errors).toBeGreaterThanOrEqual(1);
    expect(result.issues[0]).toMatchObject({ code: 'media_missing', detail: `/uploads/${MISSING}`, questionId: 'q1' });
    const again = (await call('POST', `/api/admin/quizzes/${id}/check`, a.cookie)).json() as AdminQuizCheck;
    expect(again.checkedAt).toBe(result.checkedAt);
    expect((await call('POST', `/api/admin/quizzes/${UUID}/check`, a.cookie)).statusCode).toBe(404);
    expect((await call('POST', '/api/admin/quizzes/not-a-uuid/check', a.cookie)).statusCode).toBe(404);
  });

  it('a round that needs a host is an error only in a bot quiz', async () => {
    const think = (id: string) => ({ id, type: 'think', text: 'Напишіть колір веселки', imageUrl: null, video: null, timeLimit: 30, points: 0, words: [] });
    const thinkRound = { id: 'r1', type: 'think', title: '', lives: 3, points: 3000, questions: [think('k1'), think('k2'), think('k3')] };
    const quiz = { ...makeRoundsQuiz([classicRound('r0', [{ ...single, timeLimit: 30 }]), thinkRound as never]), title: 'Думай інакше' } as Quiz;
    await ensureBotAccount(db);
    const hosted = await createQuiz(db, author.id, quiz);
    const bot = await createQuiz(db, BOT_USER_ID, quiz);
    const codesOf = async (id: string) => ((await call('POST', `/api/admin/quizzes/${id}/check`, a.cookie)).json() as AdminQuizCheck).issues.map((i) => i.code);
    expect(await codesOf(hosted)).not.toContain('autopilot_blocked');
    expect(await codesOf(bot)).toContain('autopilot_blocked');
  });
});
