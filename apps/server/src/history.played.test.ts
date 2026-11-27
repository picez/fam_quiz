import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { defaultTeams, type PlayedGameDetail } from '@quiz/shared';
import { cloud, classicRound, makeQuiz, makeRoundsQuiz, single, text } from '@quiz/engine/testing';
import { buildApp } from './app';
import type { Db } from './db/client';
import { game } from './db/schema';
import { playedGameDetail } from './history';
import { TEST_AUTH, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';
import { TEAM_USERS, recordedTeamGame, toEnd, toQuestion } from './testing/team-game';

let ctx: Awaited<ReturnType<typeof buildApp>>;
let db: Db;

beforeAll(async () => {
  db = await createTestDb();
  ctx = await buildApp({ db, auth: TEST_AUTH });
});

afterAll(async () => {
  await ctx.app.close();
});

const get = (url: string, cookie?: string) => ctx.app.inject({ method: 'GET', url, headers: cookie === undefined ? {} : { cookie } });
const post = (url: string, payload: object, cookie?: string) => ctx.app.inject({ method: 'POST', url, payload, headers: cookie === undefined ? {} : { cookie } });

/** Дві відповіді: Олена (акаунт) — правильно на обидва, Тарас (акаунт) — помиляється в першому й мовчить у другому. */
async function playedGame(finish = true) {
  const host = await signUp(ctx.app, 'Ведуча');
  const olena = await signUp(ctx.app, 'Олена');
  const taras = await signUp(ctx.app, 'Тарас');
  const quiz = makeQuiz([single, text], { speedBonus: false });
  const quizId = ((await post('/api/quizzes', quiz, host.cookie)).json() as { id: string }).id;
  const created = (await post('/api/games', { quizId }, host.cookie)).json() as { gameId: string; code: string };
  const joinAs = async (nickname: string, cookie?: string) =>
    ((await post(`/api/games/by-code/${created.code}/join`, { nickname }, cookie)).json() as { playerId: string }).playerId;
  const olenaId = await joinAs('Олена', olena.cookie);
  const tarasId = await joinAs('Тарас', taras.cookie);
  const room = ctx.manager.get(created.code)!;
  for (const playerId of [olenaId, tarasId]) ctx.manager.connect(room, { role: 'player', playerId });
  const step = (type: 'start' | 'lock' | 'next') => expect(ctx.manager.host(room, { type })).toEqual({ ok: true });
  step('start');
  step('next');
  ctx.manager.answer(room, olenaId, { type: 'single', optionId: 'b' });
  ctx.manager.answer(room, tarasId, { type: 'single', optionId: 'a' });
  step('next');
  step('next');
  step('next');
  ctx.manager.answer(room, olenaId, { type: 'text', value: 'Одеса' });
  step('lock');
  if (finish) {
    step('next');
    step('next');
  }
  await ctx.recorder.idle();
  return { host, olena, taras, gameId: created.gameId };
}

describe('played game for its player (79)', () => {
  it('gives the final standings and only the viewer’s own answers', async () => {
    const { olena, taras, gameId } = await playedGame();
    const response = await get(`/api/me/history/${gameId}`, olena.cookie);
    expect(response.statusCode).toBe(200);
    const mine = response.json() as PlayedGameDetail;
    expect(mine).toMatchObject({ gameId, title: 'Тестова вікторина', nickname: 'Олена', rank: 1, team: null, teams: false, playerCount: 2 });
    expect(mine.standings.map((row) => [row.rank, row.nickname, row.me])).toEqual([
      [1, 'Олена', true],
      [2, 'Тарас', false],
    ]);
    expect(mine.standings[0]).not.toHaveProperty('participantId');
    expect(mine.standings[0]).not.toHaveProperty('breakdown');
    expect(mine.questions.map((q) => q.mine.map((a) => [a.answer, a.accepted]))).toEqual([
      [[{ type: 'single', optionId: 'b' }, true]],
      [[{ type: 'text', value: 'Одеса' }, true]],
    ]);
    expect(mine.questions[0]!.question.type).toBe('single');
    const body = JSON.stringify(mine);
    expect(body).not.toContain('@');
    expect(body).not.toContain('"optionId":"a"');

    const theirs = (await get(`/api/me/history/${gameId}`, taras.cookie)).json() as PlayedGameDetail;
    expect(theirs.nickname).toBe('Тарас');
    expect(theirs.rank).toBe(2);
    expect(theirs.questions.map((q) => q.mine.map((a) => a.accepted))).toEqual([[false], []]);
    expect(JSON.stringify(theirs)).not.toContain('"value":"Одеса"');
  });

  it('is not found for someone who did not play, for an unfinished game and for a bad id; a guest is 401', async () => {
    const { host, gameId } = await playedGame();
    const stranger = await signUp(ctx.app, 'Чужий');
    expect((await get(`/api/me/history/${gameId}`, stranger.cookie)).statusCode).toBe(404);
    // Ведучий не грав: свою гру він бачить у «Проведених», тут — ні.
    expect((await get(`/api/me/history/${gameId}`, host.cookie)).statusCode).toBe(404);
    expect((await get('/api/me/history/not-a-uuid', stranger.cookie)).statusCode).toBe(404);
    expect((await get(`/api/me/history/${gameId}`)).statusCode).toBe(401);

    const open = await playedGame(false);
    await db.update(game).set({ status: 'running' }).where(eq(game.id, open.gameId));
    expect((await get(`/api/me/history/${open.gameId}`, open.olena.cookie)).statusCode).toBe(404);
  });

  it('a team member sees the team’s answers and own votes, not a teammate’s votes', async () => {
    const t = await recordedTeamGame(makeRoundsQuiz([classicRound('r1', [single, cloud], { speedBonus: false })], { teams: defaultTeams(2) }));
    const { manager, room, members } = t;
    toQuestion(manager, room);
    expect(manager.answer(room, members['Оля']!, { type: 'single', optionId: 'b' })).toEqual({ ok: true });
    expect(manager.answer(room, members['Віра']!, { type: 'single', optionId: 'a' })).toEqual({ ok: true });
    toQuestion(manager, room);
    for (const [name, word] of [
      ['Оля', 'каштани'],
      ['Петро', 'Дніпро'],
      ['Віра', 'Лавра'],
    ] as const) {
      expect(manager.answer(room, members[name]!, { type: 'wordcloud', words: [word] })).toEqual({ ok: true });
    }
    toEnd(manager, room);
    await t.recorder.idle();
    expect(t.errors).toEqual([]);

    const detail = await playedGameDetail(t.db, TEAM_USERS.Оля, room.id);
    expect(detail).not.toBeNull();
    expect(detail!.teams).toBe(true);
    expect(detail!.team).toBe(detail!.standings.find((row) => row.me)!.nickname);
    expect(detail!.standings.find((row) => row.me)!.members).toEqual(['Оля', 'Петро']);
    expect(detail!.questions[0]!.mine.map((a) => a.answer)).toEqual([{ type: 'single', optionId: 'b' }]);
    expect(detail!.questions[1]!.mine.map((a) => a.answer)).toEqual([{ type: 'wordcloud', words: ['каштани'] }]);
    expect(JSON.stringify(detail)).not.toContain('Дніпро');
    expect(JSON.stringify(detail)).not.toContain('Лавра');
  });
});
