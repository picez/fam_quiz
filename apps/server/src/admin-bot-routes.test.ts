import { classicRound, makeQuiz, makeRoundsQuiz, single, think, thinkRound } from '@quiz/engine/testing';
import { BOT_USER_ID, defaultTeams, type AdminBot, type AdminQuizCheck, type AdminList, type AdminLogEntry, type Quiz } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app';
import { ensureBotAccount } from './bot-account';
import { user } from './db/schema';
import { log } from './log';
import { createQuiz, updateQuiz } from './quizzes';
import { TEST_AUTH, signUp } from './testing/accounts';
import { FakeScheduler } from './testing/fake-scheduler';
import { createTestDb } from './testing/test-db';

type Ctx = Awaited<ReturnType<typeof buildApp>>;
type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

let db: Awaited<ReturnType<typeof createTestDb>>;
let ctx: Ctx;
let admin: Awaited<ReturnType<typeof signUp>>;
let olya: Awaited<ReturnType<typeof signUp>>;
const emails = new Set<string>();

const TITLE = 'Річки України 54';
const rivers = (): Quiz => ({
  ...makeRoundsQuiz([classicRound('r0', [single, { ...single, id: 'q2' }, { ...single, id: 'q3' }].map((q) => ({ ...q, timeLimit: 30 })))]),
  title: TITLE,
});

const call = (method: Method, url: string, cookie?: string, payload?: unknown, on: Ctx = ctx) =>
  on.app.inject({ method, url, payload: payload as object, headers: cookie === undefined ? {} : { cookie } });
const asAdmin = (method: Method, url: string, payload?: unknown, on: Ctx = ctx) => call(method, url, admin.cookie, payload, on);
const bot = async () => (await asAdmin('GET', '/api/admin/bot')).json() as AdminBot;
const botQuiz = async (quiz: Quiz = rivers()) => {
  await ensureBotAccount(db);
  return createQuiz(db, BOT_USER_ID, quiz);
};
const lastLog = async () => ((await asAdmin('GET', '/api/admin/log')).json() as AdminList<AdminLogEntry>).rows[0]!;

beforeAll(async () => {
  db = await createTestDb();
  ctx = await buildApp({ db, auth: TEST_AUTH, adminEmails: emails });
  admin = await signUp(ctx.app, 'Адмін 54');
  emails.add(admin.email.toLowerCase());
  await db.update(user).set({ emailVerified: true }).where(eq(user.email, admin.email));
  olya = await signUp(ctx.app, 'Оля');
});
afterAll(async () => {
  await ctx.app.close();
});

describe('admin bot routes (54)', () => {
  it('the admin copies an own quiz to the bot and the original stays', async () => {
    const saved = await call('POST', '/api/quizzes', admin.cookie, rivers());
    const { id } = saved.json() as { id: string };
    const copy = await asAdmin('POST', '/api/admin/bot/copies', { quizId: id });
    expect(copy.statusCode).toBe(201);
    const listed = await bot();
    expect(listed.quizzes.find((q) => q.id === (copy.json() as { id: string }).id)).toMatchObject({ title: TITLE, rounds: 1, questions: 3, truth: false });
    expect((await call('GET', `/api/quizzes/${id}`, admin.cookie)).statusCode).toBe(200);
    expect(await lastLog()).toMatchObject({ kind: 'bot_copy', target: 'Квіз-бот', details: { title: TITLE } });

    const before = (await lastLog()).id;
    const theirs = ((await call('POST', '/api/quizzes', olya.cookie, rivers())).json() as { id: string }).id;
    expect((await asAdmin('POST', '/api/admin/bot/copies', { quizId: theirs })).statusCode).toBe(404);
    expect((await asAdmin('POST', '/api/admin/bot/copies', { quizId: 'abc' })).statusCode).toBe(400);
    expect((await lastLog()).id).toBe(before);
  });

  it('a copy is a clear error, not a 500, when someone else holds the bot email', async () => {
    const own = await createTestDb();
    const app = await buildApp({ db: own, auth: TEST_AUTH, adminEmails: emails });
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => undefined);
    try {
      const mine = await signUp(app.app, 'Адмін 54 б');
      emails.add(mine.email.toLowerCase());
      await own.update(user).set({ emailVerified: true }).where(eq(user.email, mine.email));
      await own.insert(user).values({ id: 'squatter-54', name: 'Зайняв', email: 'quiz-bot@quiz.invalid' });
      const { id } = (await call('POST', '/api/quizzes', mine.cookie, rivers(), app)).json() as { id: string };
      const refused = await call('POST', '/api/admin/bot/copies', mine.cookie, { quizId: id }, app);
      expect(refused.statusCode).toBe(409);
      expect(refused.json()).toEqual({ error: 'bot_unavailable' });
    } finally {
      warn.mockRestore();
      await app.app.close();
    }
  });

  it('the admin starts a bot game, gets the code and the stage, and the log has it', async () => {
    const id = await botQuiz();
    const started = await asAdmin('POST', `/api/admin/bot/quizzes/${id}/games`);
    expect(started.statusCode).toBe(201);
    const { code, stageUrl } = started.json() as { code: string; stageUrl: string };
    expect(code).toMatch(/^\d{6}$/);
    const room = ctx.manager.get(code)!;
    expect(stageUrl).toBe(`/stage/${code}#${room.stageToken}`);
    expect(room.hostUserId).toBe(BOT_USER_ID);
    expect(await lastLog()).toMatchObject({ kind: 'bot_game_start', details: { title: TITLE, code } });
    const body = await asAdmin('GET', '/api/admin/bot');
    const listed = body.json() as AdminBot;
    expect(listed.rooms.find((r) => r.code === code)).toMatchObject({ status: 'lobby', players: { online: 0, total: 0 }, title: TITLE, stageUrl });
    expect(listed.bot.ready).toBe(true);
    expect(body.body).not.toContain('@');
    ctx.manager.botAct(code, 'end');
  });

  it('a fourth unfinished bot room is refused without a log line', async () => {
    const id = await botQuiz();
    const codes: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const made = await asAdmin('POST', `/api/admin/bot/quizzes/${id}/games`);
      expect(made.statusCode).toBe(201);
      codes.push((made.json() as { code: string }).code);
    }
    const before = (await lastLog()).id;
    const refused = await asAdmin('POST', `/api/admin/bot/quizzes/${id}/games`);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({ error: 'bot_rooms_full' });
    expect((await lastLog()).id).toBe(before);
    for (const code of codes) expect((await asAdmin('POST', `/api/admin/bot/rooms/${code}/end`)).statusCode).toBe(204);
  });

  it('a full server refuses a bot game with server_busy and no log line', async () => {
    const id = await botQuiz();
    const small = await buildApp({ db, auth: TEST_AUTH, adminEmails: emails, maxRooms: 1 });
    try {
      const first = await asAdmin('POST', `/api/admin/bot/quizzes/${id}/games`, undefined, small);
      expect(first.statusCode).toBe(201);
      expect(small.manager.size).toBe(1);
      const before = (await lastLog()).id;
      const refused = await asAdmin('POST', `/api/admin/bot/quizzes/${id}/games`, undefined, small);
      expect(refused.statusCode).toBe(503);
      expect(refused.json()).toEqual({ error: 'server_busy' });
      expect(small.manager.size).toBe(1);
      expect((await lastLog()).id).toBe(before);
      small.manager.botAct((first.json() as { code: string }).code, 'end');
    } finally {
      await small.app.close();
    }
  });

  it('a blocked quiz is not started', async () => {
    const wordless = makeRoundsQuiz([thinkRound('r1', [think('t1', []), think('t2', [{ word: 'червоний', synonyms: [] }]), think('t3', [{ word: 'червоний', synonyms: [] }])]), classicRound('r2', [single])]);
    const id = await botQuiz({ ...wordless, title: 'Без слів 54' });
    const before = (await lastLog()).id;
    const refused = await asAdmin('POST', `/api/admin/bot/quizzes/${id}/games`);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({ error: 'autopilot_blocked' });
    expect((await lastLog()).id).toBe(before);
  });

  it('room actions: start needs a player, then pause, resume and end', async () => {
    const id = await botQuiz();
    const { code } = (await asAdmin('POST', `/api/admin/bot/quizzes/${id}/games`)).json() as { code: string };
    const act = (action: string, c = code) => asAdmin('POST', `/api/admin/bot/rooms/${c}/${action}`);
    const noPlayers = await act('start');
    expect(noPlayers.statusCode).toBe(409);
    expect(noPlayers.json()).toEqual({ error: 'no_players' });
    const joined = ctx.manager.join(code, 'Оля');
    expect(joined.ok).toBe(true);
    // Без з'єднань автопілот сам стає на паузу («нікого немає»).
    if (joined.ok) ctx.manager.connect(ctx.manager.get(code)!, { role: 'player', playerId: joined.playerId });
    const logged = async (kind: string) => expect(await lastLog()).toMatchObject({ kind, details: { title: TITLE, code } });
    expect((await act('start')).statusCode).toBe(204);
    await logged('bot_room_start');
    const status = async () => (await bot()).rooms.find((r) => r.code === code)?.status;
    expect(await status()).toBe('playing');
    expect((await act('pause')).statusCode).toBe(204);
    await logged('bot_room_pause');
    expect(await status()).toBe('paused');
    expect((await act('resume')).statusCode).toBe(204);
    await logged('bot_room_resume');
    expect((await act('end')).statusCode).toBe(204);
    await logged('bot_room_end');
    expect(await status()).toBe('finished');

    const plain = ((await call('POST', '/api/games', admin.cookie, { quizId: ((await call('POST', '/api/quizzes', admin.cookie, makeQuiz([single]))).json() as { id: string }).id })).json() as { code: string }).code;
    for (const bad of ['12ab56', '999999', plain]) expect((await act('start', bad)).statusCode, bad).toBe(404);
    expect((await act('lock')).statusCode).toBe(404);
    // kick без тіла — 400, а не 404: дія відома, але потребує playerId.
    const bodiless = await act('kick');
    expect(bodiless.statusCode).toBe(400);
    expect(bodiless.json()).toEqual({ error: 'invalid_payload' });

    const other = await buildApp({ db, auth: TEST_AUTH, adminEmails: emails });
    try {
      other.manager.freeze();
      const refused = await asAdmin('POST', `/api/admin/bot/rooms/${code}/start`, undefined, other);
      expect(refused.statusCode).toBe(503);
      expect(refused.json()).toEqual({ error: 'restarting' });
    } finally {
      await other.app.close();
    }
  });

  it('the admin deletes a bot quiz and a live room plays on', async () => {
    const id = await botQuiz();
    const { code } = (await asAdmin('POST', `/api/admin/bot/quizzes/${id}/games`)).json() as { code: string };
    expect((await asAdmin('DELETE', `/api/admin/bot/quizzes/${id}`)).statusCode).toBe(204);
    expect(await lastLog()).toMatchObject({ kind: 'bot_quiz_delete', details: { title: TITLE } });
    expect(ctx.manager.get(code)?.state.phase).toBe('lobby');
    expect((await asAdmin('DELETE', `/api/admin/bot/quizzes/${id}`)).statusCode).toBe(404);
    const mine = ((await call('POST', '/api/quizzes', admin.cookie, rivers())).json() as { id: string }).id;
    expect((await asAdmin('DELETE', `/api/admin/bot/quizzes/${mine}`)).statusCode).toBe(404);
    expect((await call('GET', `/api/quizzes/${mine}`, admin.cookie)).statusCode).toBe(200);
    ctx.manager.botAct(code, 'end');
  });

  it('a quiz of the bot is not reachable through the owner routes', async () => {
    const id = await botQuiz();
    expect((await call('GET', `/api/quizzes/${id}`, admin.cookie)).statusCode).toBe(404);
  });

  it('the bot list carries the last check', async () => {
    const broken: Quiz = {
      ...makeRoundsQuiz([classicRound('r0', [{ ...single, timeLimit: 30, imageUrl: '/uploads/abcdefghijklmnop.png' }, { ...single, id: 'q2', timeLimit: 30 }])]),
      title: 'Бот із битою картинкою',
    };
    const id = await botQuiz(broken);
    const row = async () => (await bot()).quizzes.find((q) => q.id === id)!;
    expect((await row()).check).toBeNull();
    const done = await asAdmin('POST', `/api/admin/quizzes/${id}/check`);
    expect(done.statusCode).toBe(200);
    expect((done.json() as AdminQuizCheck).errors).toBe(1);
    expect((await row()).check).toEqual({ errors: 1, warnings: 0 });
    expect(await updateQuiz(db, BOT_USER_ID, id, rivers())).toBe(true);
    expect((await row()).check).toBeNull();
  });

  it('the room card lists people and lobby, never the answers', async () => {
    const right = { ...single, timeLimit: 30, options: single.options.map((o) => (o.id === single.correctId ? { ...o, text: 'Дніпро 62' } : o)) };
    const id = await botQuiz({ ...makeRoundsQuiz([classicRound('r0', [right, { ...right, id: 'q2' }])]), title: TITLE });
    const scheduler = new FakeScheduler();
    const own = await buildApp({ db, auth: TEST_AUTH, adminEmails: emails, scheduler });
    try {
      const { code } = (await asAdmin('POST', `/api/admin/bot/quizzes/${id}/games`, undefined, own)).json() as { code: string };
      const joined = own.manager.join(code, 'Оля');
      if (!joined.ok) throw new Error(joined.error);
      own.manager.connect(own.manager.get(code)!, { role: 'player', playerId: joined.playerId });
      const card = async () => ((await asAdmin('GET', '/api/admin/bot', undefined, own)).json() as AdminBot).rooms.find((r) => r.code === code)!;
      expect(await card()).toMatchObject({
        lobby: { listed: true, password: null },
        people: [{ id: joined.playerId, nickname: 'Оля', online: true, team: null }],
        teams: null,
        continued: false,
        question: false,
      });
      expect((await asAdmin('POST', `/api/admin/bot/rooms/${code}/start`, undefined, own)).statusCode).toBe(204);
      for (let i = 0; i < 20 && own.manager.get(code)!.state.phase !== 'question'; i += 1) scheduler.advance(1000);
      expect((await card()).question).toBe(true);
      const raw = (await asAdmin('GET', '/api/admin/bot', undefined, own)).body;
      expect(raw).not.toContain('Дніпро 62');
      expect(raw).not.toContain(right.text);
      own.manager.botAct(code, 'end');
    } finally {
      await own.app.close();
    }
  });

  it('skip, +30 s and end round, each logged', async () => {
    const id = await botQuiz();
    const scheduler = new FakeScheduler();
    const own = await buildApp({ db, auth: TEST_AUTH, adminEmails: emails, scheduler });
    try {
      const { code } = (await asAdmin('POST', `/api/admin/bot/quizzes/${id}/games`, undefined, own)).json() as { code: string };
      const act = (action: string) => asAdmin('POST', `/api/admin/bot/rooms/${code}/${action}`, undefined, own);
      const joined = own.manager.join(code, 'Оля');
      if (!joined.ok) throw new Error(joined.error);
      own.manager.connect(own.manager.get(code)!, { role: 'player', playerId: joined.playerId });
      expect((await act('start')).statusCode).toBe(204);
      for (let i = 0; i < 20 && own.manager.get(code)!.state.phase !== 'question'; i += 1) scheduler.advance(1000);
      expect((await act('time')).statusCode).toBe(204);
      expect(await lastLog()).toMatchObject({ kind: 'bot_room_time', details: { title: TITLE, code } });
      expect((await act('skip')).statusCode).toBe(204);
      expect(await lastLog()).toMatchObject({ kind: 'bot_room_skip', details: { title: TITLE, code } });
      const before = (await lastLog()).id;
      const again = await act('skip');
      expect(again.statusCode).toBe(409);
      expect(again.json()).toEqual({ error: 'wrong_phase' });
      expect((await lastLog()).id).toBe(before);

      for (let i = 0; i < 60 && own.manager.get(code)!.state.phase !== 'question'; i += 1) scheduler.advance(1000);
      expect((await act('pause')).statusCode).toBe(204);
      const paused = await act('end-round');
      expect(paused.statusCode).toBe(409);
      expect(paused.json()).toEqual({ error: 'paused' });
      expect((await act('resume')).statusCode).toBe(204);
      expect((await act('end-round')).statusCode).toBe(204);
      expect(await lastLog()).toMatchObject({ kind: 'bot_room_end_round', details: { title: TITLE, code } });
      own.manager.botAct(code, 'end');
    } finally {
      await own.app.close();
    }
  });

  it('kick by player id with the nickname in the log', async () => {
    const id = await botQuiz();
    const { code } = (await asAdmin('POST', `/api/admin/bot/quizzes/${id}/games`)).json() as { code: string };
    const joined = ctx.manager.join(code, 'Оля');
    if (!joined.ok) throw new Error(joined.error);
    const before = (await lastLog()).id;
    const unknown = await asAdmin('POST', `/api/admin/bot/rooms/${code}/kick`, { playerId: 'nobody' });
    expect(unknown.statusCode).toBe(409);
    expect((await lastLog()).id).toBe(before);
    const release = await asAdmin('POST', `/api/admin/bot/rooms/${code}/release`, { playerId: joined.playerId });
    expect(release.statusCode).toBe(409);
    expect(release.json()).toEqual({ error: 'not_allowed' });
    expect((await lastLog()).id).toBe(before);
    expect((await asAdmin('POST', `/api/admin/bot/rooms/${code}/kick`, { playerId: joined.playerId })).statusCode).toBe(204);
    expect(await lastLog()).toMatchObject({ kind: 'bot_room_kick', details: { title: TITLE, code, text: 'Оля' } });
    expect(ctx.manager.get(code)!.state.players).toEqual([]);
    ctx.manager.botAct(code, 'end');
  });

  it('team form in a team quiz', async () => {
    const id = await botQuiz({ ...makeRoundsQuiz([classicRound('r0', [{ ...single, timeLimit: 30 }])], { teams: defaultTeams(2) }), title: TITLE });
    const { code } = (await asAdmin('POST', `/api/admin/bot/quizzes/${id}/games`)).json() as { code: string };
    const card = async () => (await bot()).rooms.find((r) => r.code === code)!;
    expect((await card()).teams).toEqual({ form: 'pick' });
    const set = await asAdmin('POST', `/api/admin/bot/rooms/${code}/team-form`, { form: 'dice' });
    expect(set.statusCode).toBe(204);
    expect((await card()).teams).toEqual({ form: 'dice' });
    expect(await lastLog()).toMatchObject({ kind: 'bot_room_teams', details: { title: TITLE, code } });
    expect((await asAdmin('POST', `/api/admin/bot/rooms/${code}/team-form`, { form: 'host' })).statusCode).toBe(400);
    ctx.manager.botAct(code, 'end');
  });

  it('lobby: password and visibility, logged without the password', async () => {
    const id = await botQuiz();
    const { code } = (await asAdmin('POST', `/api/admin/bot/quizzes/${id}/games`)).json() as { code: string };
    const put = (payload: unknown, c = code, on: Ctx = ctx) => asAdmin('PUT', `/api/admin/bot/rooms/${c}/lobby`, payload, on);
    const saved = await put({ listed: false, password: 'сова62' });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual({ listed: false, password: 'сова62' });
    const entry = await lastLog();
    expect(entry).toMatchObject({ kind: 'bot_room_lobby', details: { title: TITLE, code, listed: false, locked: true } });
    expect(JSON.stringify(entry)).not.toContain('сова62');
    expect((await bot()).rooms.find((r) => r.code === code)!.lobby).toEqual({ listed: false, password: 'сова62' });
    const same = await put({ listed: false, password: 'сова62' });
    expect(same.statusCode).toBe(200);
    expect((await lastLog()).id).toBe(entry.id);
    expect((await put({ listed: true, password: 'abc' })).statusCode).toBe(400);
    expect((await put({ listed: true })).statusCode).toBe(400);

    const plain = ((await call('POST', '/api/games', admin.cookie, { quizId: ((await call('POST', '/api/quizzes', admin.cookie, makeQuiz([single]))).json() as { id: string }).id })).json() as { code: string }).code;
    expect((await put({ listed: true, password: null }, plain)).statusCode).toBe(404);
    expect((await put({ listed: true, password: null }, 'abc')).statusCode).toBe(404);

    const other = await buildApp({ db, auth: TEST_AUTH, adminEmails: emails });
    try {
      other.manager.freeze();
      const refused = await put({ listed: true, password: null }, code, other);
      expect(refused.statusCode).toBe(503);
      expect(refused.json()).toEqual({ error: 'restarting' });
    } finally {
      await other.app.close();
    }

    const joined = ctx.manager.join(code, 'Оля');
    if (!joined.ok) throw new Error(joined.error);
    ctx.manager.connect(ctx.manager.get(code)!, { role: 'player', playerId: joined.playerId });
    expect((await asAdmin('POST', `/api/admin/bot/rooms/${code}/start`)).statusCode).toBe(204);
    const late = await put({ listed: true, password: null });
    expect(late.statusCode).toBe(409);
    expect(late.json()).toEqual({ error: 'wrong_phase' });
    ctx.manager.botAct(code, 'end');
  });

  it('gives only 404 to non-admins and guests', async () => {
    expect((await call('GET', '/api/admin/bot')).statusCode).toBe(404);
    expect((await call('GET', '/api/admin/bot', olya.cookie)).statusCode).toBe(404);
    expect(await db.select({ id: user.id }).from(user).where(eq(user.id, BOT_USER_ID))).toHaveLength(1);
  });
});
