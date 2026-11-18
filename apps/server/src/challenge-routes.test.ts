import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { classicRound, makeQuiz, makeRoundsQuiz, poll, single, truthRound, withId } from '@quiz/engine/testing';
import type { ChallengeAttemptStart, ChallengeCheck, ChallengeMine, ChallengePreview, ChallengeResultRow, ContinueResponse } from '@quiz/shared';
import { buildApp } from './app';
import type { Db } from './db/client';
import { challenge, challengeAttempt, game, user } from './db/schema';
import { TEST_AUTH, signUp } from './testing/accounts';
import { FakeScheduler } from './testing/fake-scheduler';
import { createTestDb } from './testing/test-db';
import type { Room } from './rooms/manager';

let ctx: Awaited<ReturnType<typeof buildApp>>;
let db: Db;
const scheduler = new FakeScheduler();

beforeAll(async () => {
  db = await createTestDb();
  ctx = await buildApp({ db, auth: TEST_AUTH, scheduler });
});

afterAll(async () => {
  await ctx.app.close();
});

// Кожен тест — зі своєї адреси: ліміт CREATE_LIMIT (20 за хвилину) рахується за адресою.
let address = 0;
let ip = '10.0.0.1';
const nextAddress = () => {
  address += 1;
  ip = `10.0.${Math.floor(address / 250)}.${(address % 250) + 1}`;
};

type Method = 'GET' | 'POST' | 'DELETE';
const call = (method: Method, url: string, cookie?: string, payload?: object) =>
  ctx.app.inject({ method, url, payload, remoteAddress: ip, headers: cookie === undefined ? {} : { cookie } });

async function account(name: string) {
  const made = await signUp(ctx.app, name);
  const [row] = await db.select().from(user).where(eq(user.email, made.email));
  return { ...made, id: row.id };
}
type Account = Awaited<ReturnType<typeof account>>;

const soloQuiz = () => makeQuiz([single, withId(single, 'q2'), withId(single, 'q3')]);

async function saveQuiz(owner: Account, quiz: object): Promise<string> {
  const saved = await call('POST', '/api/quizzes', owner.cookie, quiz);
  expect(saved.statusCode).toBe(201);
  return (saved.json() as { id: string }).id;
}

/** Олена створює виклик зі своєї вікторини. */
async function ready(owner: Account, quiz: object = soloQuiz()) {
  const quizId = await saveQuiz(owner, quiz);
  const created = await call('POST', `/api/quizzes/${quizId}/challenge`, owner.cookie);
  expect(created.statusCode).toBe(201);
  return { quizId, mine: created.json() as ChallengeMine };
}

const attempt = (code: string, who: Account) => call('POST', `/api/challenges/${code}/attempt`, who.cookie);
const preview = async (code: string, who: Account) => (await call('GET', `/api/challenges/${code}`, who.cookie)).json() as ChallengePreview;

async function gameIdOf(code: string, who: Account): Promise<string> {
  const [row] = await db
    .select({ gameId: challengeAttempt.gameId })
    .from(challengeAttempt)
    .innerJoin(challenge, eq(challenge.id, challengeAttempt.challengeId))
    .where(and(eq(challenge.code, code), eq(challengeAttempt.userId, who.id)));
  return row.gameId;
}

/** Старт спроби й гра до першого закритого запитання (контрольна точка є, гра не скінчилась). */
function playToCheckpoint(room: Room, playerId: string) {
  ctx.manager.connect(room, { role: 'player', playerId });
  if (room.state.phase === 'lobby') expect(ctx.manager.author(room, playerId, { type: 'start' })).toEqual({ ok: true });
  // Продовжена гра чекає на автора.
  if (room.state.autopilot?.hold === 'author') expect(ctx.manager.author(room, playerId, { type: 'resume' })).toEqual({ ok: true });
  const plays = room.state.plays.length;
  for (let guard = 0; guard < 200 && !(room.state.plays.length > plays && room.checkpoint !== null); guard++) scheduler.advance(1000);
  expect(room.state.plays.length).toBeGreaterThan(plays);
  expect(room.state.phase).not.toBe('finished');
}

describe('author routes (44)', () => {
  it('author creates, checks and lists', async () => {
    nextAddress();
    const olena = await account('Олена');
    const taras = await account('Тарас');
    const quizId = await saveQuiz(olena, makeRoundsQuiz([classicRound('r1', [single, poll]), truthRound('r2')]));

    const check = await call('GET', `/api/quizzes/${quizId}/challenge`, olena.cookie);
    expect(check.statusCode).toBe(200);
    const body = check.json() as ChallengeCheck;
    expect(body.empty).toBe(false);
    expect(body.active).toBeNull();
    expect(body.skipped.rounds).toEqual([{ index: 1, type: 'truth', reason: 'type' }]);
    expect(body.skipped.questions).toEqual([{ index: 0, count: 1 }]);

    const created = await call('POST', `/api/quizzes/${quizId}/challenge`, olena.cookie);
    expect(created.statusCode).toBe(201);
    const mine = created.json() as ChallengeMine;
    expect(mine).toMatchObject({ quizId, played: 0 });
    expect(mine.code).toMatch(/^[a-z2-9]{12}$/);
    expect(((await call('GET', `/api/quizzes/${quizId}/challenge`, olena.cookie)).json() as ChallengeCheck).active).toEqual(mine);

    const list = await call('GET', '/api/challenges', olena.cookie);
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual([mine]);

    const pollOnly = await saveQuiz(olena, makeQuiz([poll]));
    expect(((await call('GET', `/api/quizzes/${pollOnly}/challenge`, olena.cookie)).json() as ChallengeCheck).empty).toBe(true);
    const empty = await call('POST', `/api/quizzes/${pollOnly}/challenge`, olena.cookie);
    expect(empty.statusCode).toBe(409);
    expect(empty.json()).toEqual({ error: 'challenge_empty' });

    expect((await call('GET', `/api/quizzes/${quizId}/challenge`, taras.cookie)).statusCode).toBe(404);
    expect((await call('POST', `/api/quizzes/${quizId}/challenge`, taras.cookie)).statusCode).toBe(404);
    expect(await (await call('GET', '/api/challenges', taras.cookie)).json()).toEqual([]);
    expect((await call('GET', `/api/quizzes/${quizId}/challenge`)).statusCode).toBe(401);
    expect((await call('POST', `/api/quizzes/${quizId}/challenge`)).statusCode).toBe(401);
    expect((await call('GET', '/api/challenges')).statusCode).toBe(401);
  });
});

describe('the challenge by its code (44)', () => {
  it('a guest and a wrong code', async () => {
    nextAddress();
    const olena = await account('Олена');
    const taras = await account('Тарас');
    const { mine } = await ready(olena);
    expect((await call('GET', `/api/challenges/${mine.code}`)).statusCode).toBe(401);
    expect((await call('GET', `/api/challenges/${mine.code}/results`)).statusCode).toBe(401);
    expect((await call('POST', `/api/challenges/${mine.code}/attempt`)).statusCode).toBe(401);

    const made = mine.code === 'abcdefghjkmn' ? 'nmkjhgfedcba' : 'abcdefghjkmn';
    for (const code of ['abc', made]) {
      for (const [method, url] of [
        ['GET', `/api/challenges/${code}`],
        ['GET', `/api/challenges/${code}/results`],
        ['POST', `/api/challenges/${code}/attempt`],
      ] as const) {
        const response = await call(method, url, taras.cookie);
        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({ error: 'challenge_not_found' });
      }
    }
  });

  it('one attempt, the same game on return', async () => {
    nextAddress();
    const olena = await account('Олена');
    const taras = await account('Тарас');
    const iryna = await account('Ірина');
    const { mine } = await ready(olena);

    const first = await attempt(mine.code, taras);
    expect(first.statusCode).toBe(201);
    const start = first.json() as ChallengeAttemptStart;
    const gameId = await gameIdOf(mine.code, taras);
    const room = ctx.manager.roomById(gameId)!;
    expect(room.code).toBe(start.code);
    expect(room.challenge).toMatchObject({ code: mine.code, title: soloQuiz().title });
    expect(room.stageToken).toBe(start.stageToken);
    expect(room.playerTokens.get(start.token)).toBe(start.playerId);
    expect(room.state.autopilot?.authorId).toBe(start.playerId);
    expect(room.state.players.map((p) => p.nickname)).toEqual([expect.stringMatching(/^Тарас/)]);

    const again = await attempt(mine.code, taras);
    expect(again.statusCode).toBe(201);
    const back = again.json() as ChallengeAttemptStart;
    expect(back.code).toBe(start.code);
    expect(back.playerId).toBe(start.playerId);
    expect(back.token).not.toBe(start.token);
    expect(ctx.manager.roomById(gameId)).toBe(room);

    const before = ctx.manager.size;
    const both = await Promise.all([attempt(mine.code, iryna), attempt(mine.code, iryna)]);
    expect(both.map((r) => r.statusCode)).toEqual([201, 201]);
    const [a, b] = both.map((r) => r.json() as ChallengeAttemptStart);
    expect(a.code).toBe(b.code);
    expect(ctx.manager.size).toBe(before + 1);
    expect((await db.select().from(challengeAttempt).where(eq(challengeAttempt.userId, iryna.id))).length).toBe(1);
    expect((await preview(mine.code, olena)).played).toBe(2);
    expect((await preview(mine.code, taras)).mine).toBe('playing');
  });

  it('the code of a challenge room says nothing: the code info is 404 like an unknown code', async () => {
    nextAddress();
    const olena = await account('Олена');
    const taras = await account('Тарас');
    const { mine } = await ready(olena);
    const start = (await attempt(mine.code, taras)).json() as ChallengeAttemptStart;
    for (const who of [undefined, olena.cookie, taras.cookie]) {
      const info = await call('GET', `/api/games/by-code/${start.code}`, who);
      expect(info.statusCode).toBe(404);
      expect(info.json()).toEqual({ error: 'game_not_found' });
    }
    const joined = await call('POST', `/api/games/by-code/${start.code}/join`, olena.cookie, { nickname: 'Олена' });
    expect(joined.statusCode).toBe(404);
  });

  it('a finished attempt cannot be replayed', async () => {
    nextAddress();
    const olena = await account('Олена');
    const taras = await account('Тарас');
    const { mine } = await ready(olena);
    const start = (await attempt(mine.code, taras)).json() as ChallengeAttemptStart;
    const room = ctx.manager.get(start.code)!;
    playToCheckpoint(room, start.playerId);
    expect(ctx.manager.author(room, start.playerId, { type: 'end' })).toEqual({ ok: true });
    await ctx.recorder.idle();
    const refused = await attempt(mine.code, taras);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({ error: 'challenge_done' });
    expect((await preview(mine.code, taras)).mine).toBe('done');
    // Навіть коли кімнати вже немає, а рядок гри «aborted».
    const [row] = await db.select({ status: game.status }).from(game).where(eq(game.id, await gameIdOf(mine.code, taras)));
    expect(['finished', 'aborted']).toContain(row.status);
  });

  it('an aborted attempt cannot be replayed either', async () => {
    nextAddress();
    const olena = await account('Олена');
    const taras = await account('Тарас');
    const { mine } = await ready(olena);
    const start = (await attempt(mine.code, taras)).json() as ChallengeAttemptStart;
    const room = ctx.manager.get(start.code)!;
    playToCheckpoint(room, start.playerId);
    await ctx.recorder.idle();
    // Перервана гра (рядок «aborted»), навіть коли кімната ще жива, — спроба завершена.
    await db.update(game).set({ status: 'aborted' }).where(eq(game.id, room.id));
    const refused = await attempt(mine.code, taras);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({ error: 'challenge_done' });
  });

  it('results stay hidden until you played', async () => {
    nextAddress();
    const olena = await account('Олена');
    const taras = await account('Тарас');
    const iryna = await account('Ірина');
    const { mine } = await ready(olena);
    await attempt(mine.code, taras);
    await attempt(mine.code, olena);

    const hidden = await call('GET', `/api/challenges/${mine.code}/results`, iryna.cookie);
    expect(hidden.statusCode).toBe(403);
    expect(hidden.json()).toEqual({ error: 'challenge_hidden' });
    const seen = await preview(mine.code, iryna);
    expect(seen).toMatchObject({ title: soloQuiz().title, active: true, played: 2, isAuthor: false, mine: 'none', canSeeResults: false, endedAt: null });
    expect(seen.author?.id).toBe(olena.id);
    expect(seen.author?.nickname).toMatch(/^Олена/);

    const own = await call('GET', `/api/challenges/${mine.code}/results`, olena.cookie);
    expect(own.statusCode).toBe(200);
    const authorRows = own.json() as ChallengeResultRow[];
    expect(authorRows).toHaveLength(2);
    expect(authorRows.find((r) => r.me)).toMatchObject({ author: true, done: false, nickname: seen.author?.nickname });
    expect((await preview(mine.code, olena)).isAuthor).toBe(true);

    const theirs = await call('GET', `/api/challenges/${mine.code}/results`, taras.cookie);
    expect(theirs.statusCode).toBe(200);
    const rows = theirs.json() as ChallengeResultRow[];
    expect(rows.map((r) => r.place)).toEqual([1, 2]);
    expect(rows.filter((r) => r.me)).toEqual([expect.objectContaining({ author: false, nickname: expect.stringMatching(/^Тарас/) })]);
    expect(rows.filter((r) => r.author)).toEqual([expect.objectContaining({ me: false, nickname: seen.author?.nickname })]);
    expect((await preview(mine.code, taras)).canSeeResults).toBe(true);
  });

  it('expired and replaced challenges take no attempts', async () => {
    nextAddress();
    const olena = await account('Олена');
    const taras = await account('Тарас');
    const iryna = await account('Ірина');
    const { quizId, mine } = await ready(olena);
    expect((await attempt(mine.code, taras)).statusCode).toBe(201);

    await db.update(challenge).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(challenge.code, mine.code));
    for (const who of [iryna, taras]) {
      const closed = await attempt(mine.code, who);
      expect(closed.statusCode).toBe(409);
      expect(closed.json()).toEqual({ error: 'challenge_closed' });
    }
    expect((await preview(mine.code, taras)).active).toBe(false);
    expect((await call('GET', '/api/challenges', olena.cookie)).json()).toEqual([]);
    expect((await call('GET', `/api/challenges/${mine.code}/results`, taras.cookie)).statusCode).toBe(200);

    await db.update(challenge).set({ expiresAt: new Date(Date.now() + 86_400_000) }).where(eq(challenge.code, mine.code));
    const replaced = await call('POST', `/api/quizzes/${quizId}/challenge`, olena.cookie);
    expect(replaced.statusCode).toBe(201);
    const next = replaced.json() as ChallengeMine;
    expect(next.code).not.toBe(mine.code);
    const closed = await attempt(mine.code, iryna);
    expect(closed.statusCode).toBe(409);
    expect(closed.json()).toEqual({ error: 'challenge_closed' });
    expect((await attempt(mine.code, taras)).statusCode).toBe(409);
    const old = await preview(mine.code, taras);
    expect(old.active).toBe(false);
    expect(old.endedAt).not.toBeNull();
    expect((await call('GET', `/api/challenges/${mine.code}/results`, taras.cookie)).statusCode).toBe(200);
    expect((await attempt(next.code, iryna)).statusCode).toBe(201);
  });

  it('a saved attempt continues from the link and from my games', async () => {
    nextAddress();
    const olena = await account('Олена');
    const taras = await account('Тарас');
    const { mine } = await ready(olena);
    const start = (await attempt(mine.code, taras)).json() as ChallengeAttemptStart;
    const gameId = await gameIdOf(mine.code, taras);
    const room = ctx.manager.get(start.code)!;
    playToCheckpoint(room, start.playerId);
    expect(ctx.manager.author(room, start.playerId, { type: 'save' })).toEqual({ ok: true });
    await ctx.recorder.idle();
    expect(ctx.manager.roomById(gameId)).toBeUndefined();

    const fromLink = await attempt(mine.code, taras);
    expect(fromLink.statusCode).toBe(201);
    const resumed = fromLink.json() as ChallengeAttemptStart;
    const again = ctx.manager.get(resumed.code)!;
    expect(again.id).toBe(gameId);
    expect(again.challenge).toMatchObject({ code: mine.code });
    expect(again.playerTokens.get(resumed.token)).toBe(start.playerId);
    expect((await preview(mine.code, taras)).mine).toBe('playing');

    playToCheckpoint(again, resumed.playerId);
    expect(ctx.manager.author(again, resumed.playerId, { type: 'save' })).toEqual({ ok: true });
    await ctx.recorder.idle();
    const removed = await call('DELETE', `/api/games/${gameId}`, taras.cookie);
    expect(removed.statusCode).toBe(409);
    expect(removed.json()).toEqual({ error: 'challenge_game' });

    const fromGames = await call('POST', `/api/games/${gameId}/continue`, taras.cookie);
    expect(fromGames.statusCode).toBe(201);
    const continued = fromGames.json() as ContinueResponse;
    const third = ctx.manager.get(continued.code)!;
    expect(third.id).toBe(gameId);
    expect(third.challenge).toMatchObject({ code: mine.code });
    expect(ctx.manager.join(third.code, 'Олена', olena.id)).toEqual({ ok: false, error: 'game_not_found' });

    const token = 'token' in continued ? continued.token : '';
    playToCheckpoint(third, third.playerTokens.get(token)!);
    expect(ctx.manager.author(third, third.state.autopilot!.authorId, { type: 'save' })).toEqual({ ok: true });
    await ctx.recorder.idle();
    await db.update(challenge).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(challenge.code, mine.code));
    const late = await attempt(mine.code, taras);
    expect(late.statusCode).toBe(409);
    expect(late.json()).toEqual({ error: 'challenge_closed' });
    const lateGames = await call('POST', `/api/games/${gameId}/continue`, taras.cookie);
    expect(lateGames.statusCode).toBe(409);
    expect(lateGames.json()).toEqual({ error: 'challenge_closed' });
    expect(ctx.manager.roomById(gameId)).toBeUndefined();
  });

  it('a stranger cannot continue somebody else’s attempt: 404 like any other game', async () => {
    nextAddress();
    const olena = await account('Олена');
    const taras = await account('Тарас');
    const { mine } = await ready(olena);
    const start = (await attempt(mine.code, taras)).json() as ChallengeAttemptStart;
    const room = ctx.manager.get(start.code)!;
    playToCheckpoint(room, start.playerId);
    expect(ctx.manager.author(room, start.playerId, { type: 'save' })).toEqual({ ok: true });
    await ctx.recorder.idle();
    const gameId = room.id;
    await db.update(challenge).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(challenge.code, mine.code));
    expect((await call('POST', `/api/games/${gameId}/continue`, olena.cookie)).statusCode).toBe(404);
    expect((await call('DELETE', `/api/games/${gameId}`, olena.cookie)).statusCode).toBe(404);
  });
});
