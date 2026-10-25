import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { bluff, blitzRound, classicRound, clues, cloud, finalRound, makeQuiz, poll, wall, makeRoundsQuiz, pin, single, slider, survey, surveyCloud, text, withId, withReveal, survivalQuestions, survivalRound, survivalTrials, wipeoutLadder, wipeoutRound, ladderRound } from '@quiz/engine/testing';
import { buildApp } from './app';
import { createTestDb } from './testing/test-db';
import { TEST_AUTH, signUp, startGame } from './testing/accounts';
import { playToEnd } from './testing/final-game';
import { playLadderQuestion } from './testing/ladder-game';
import { playSurvivalQuestion } from './testing/survival-game';
import { playWipeout } from './testing/wipeout-game';
import { follow, game, participant, profile, user } from './db/schema';
import { ensureProfile, profileFacts, saveProfile } from './profiles';
import { markInterrupted } from './recorder';
import type { Room } from './rooms/manager';
import { questionsOf } from '@quiz/shared';
import { seedGame } from './testing/history-rows';

const addUser = (db: Awaited<ReturnType<typeof createTestDb>>, id: string, name: string) =>
  db.insert(user).values({ id, name, email: `${id}@example.com` });

describe('default nickname', () => {
  it('makes a default nickname from the first name of the account', async () => {
    const db = await createTestDb();
    await addUser(db, 'u1', 'Олена Петренко');
    await addUser(db, 'u2', '  Олена   Коваль ');
    await addUser(db, 'u3', 'Анна-Марія Шевченко');

    expect(await ensureProfile(db, 'u1')).toEqual({ id: 'u1', nickname: 'Олена', avatar: null });
    expect(await ensureProfile(db, 'u1')).toEqual({ id: 'u1', nickname: 'Олена', avatar: null });
    expect((await ensureProfile(db, 'u2'))?.nickname).toBe('Олена 2');
    expect((await ensureProfile(db, 'u3'))?.nickname).toBe('Анна-Марія');
    expect(await db.select().from(profile)).toHaveLength(3);
  });

  it('falls back to the whole name when the first word is too short', async () => {
    const db = await createTestDb();
    await addUser(db, 'u1', 'Я Петро');
    await addUser(db, 'u2', '   ');

    expect((await ensureProfile(db, 'u1'))?.nickname).toBe('Я Петро');
    expect((await ensureProfile(db, 'u2'))?.nickname).toBe('Гравець');
  });

  it('adds a number when the default nickname is taken', async () => {
    const db = await createTestDb();
    await addUser(db, 'u1', 'Олена');
    await addUser(db, 'u2', 'Олена');
    await addUser(db, 'u3', 'олена');

    expect((await ensureProfile(db, 'u1'))?.nickname).toBe('Олена');
    expect((await ensureProfile(db, 'u2'))?.nickname).toBe('Олена 2');
    expect((await ensureProfile(db, 'u3'))?.nickname).toBe('олена 3');
  });

  it('fits a long name with its number into 20 characters and replaces an unusable one', async () => {
    const db = await createTestDb();
    await addUser(db, 'u1', 'Олександра-Анастасія Ш');
    await addUser(db, 'u2', 'Олександра-Анастасія Ш');
    await addUser(db, 'u3', 'Я');

    expect((await ensureProfile(db, 'u1'))?.nickname).toBe('Олександра-Анастасія');
    expect((await ensureProfile(db, 'u2'))?.nickname).toBe('Олександра-Анастас 2');
    expect((await ensureProfile(db, 'u3'))?.nickname).toBe('Гравець');
  });

  it('two simultaneous first reads create one profile', async () => {
    const db = await createTestDb();
    await addUser(db, 'u1', 'Олена');

    const [a, b] = await Promise.all([ensureProfile(db, 'u1'), ensureProfile(db, 'u1')]);
    expect(a).toEqual(b);
    expect(await db.select().from(profile).where(eq(profile.userId, 'u1'))).toHaveLength(1);
  });

  it('has no profile for an unknown user', async () => {
    const db = await createTestDb();
    expect(await ensureProfile(db, 'nobody')).toBeNull();
  });
});

describe('saving a profile', () => {
  it('nicknames are unique regardless of case, spacing and apostrophes', async () => {
    const db = await createTestDb();
    await addUser(db, 'u1', 'Один');
    await addUser(db, 'u2', 'Два');

    expect(await saveProfile(db, 'u1', { nickname: 'Оля К’', avatar: null })).toMatchObject({ ok: true });
    expect(await saveProfile(db, 'u2', { nickname: "оля к'", avatar: null })).toEqual({ ok: false, error: 'nickname_taken' });
    expect(await saveProfile(db, 'u1', { nickname: 'ОЛЯ К’', avatar: '/uploads/0123456789abcdef.png' })).toEqual({
      ok: true,
      profile: { id: 'u1', nickname: 'ОЛЯ К’', avatar: '/uploads/0123456789abcdef.png' },
    });
  });
});

describe('profile facts', () => {
  let ctx: Awaited<ReturnType<typeof buildApp>>;
  let db: Awaited<ReturnType<typeof createTestDb>>;

  beforeAll(async () => {
    db = await createTestDb();
    ctx = await buildApp({ db, auth: TEST_AUTH });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const post = (url: string, payload: object, cookie?: string) =>
    ctx.app.inject({ method: 'POST', url, payload, headers: cookie === undefined ? {} : { cookie } });

  const idOf = async (email: string) => {
    const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
    return row.id;
  };

  const earned = (achievements: { id: string; earned: boolean }[]) => achievements.filter((a) => a.earned).map((a) => a.id);

  /** Ведуча з двома вікторинами проводить гру [single, text]: Олена (акаунт) правильно обидва, Тарас (гість) помиляється. */
  async function playedGame() {
    const host = await signUp(ctx.app, 'Ведуча');
    const olena = await signUp(ctx.app, 'Олена');
    const quiz = makeQuiz([single, text], { speedBonus: false });
    await post('/api/quizzes', quiz, host.cookie);
    const { game: created } = await startGame(ctx.app, quiz, host.cookie);

    const joinAs = async (nickname: string, cookie?: string) =>
      ((await post(`/api/games/by-code/${created.code}/join`, { nickname }, cookie)).json() as { playerId: string }).playerId;
    const olenaId = await joinAs('Олена', olena.cookie);
    const tarasId = await joinAs('Тарас');

    const room = ctx.manager.get(created.code);
    if (room === undefined) throw new Error('room missing');
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
    step('next');
    step('next');
    await ctx.recorder.idle();
    return { hostId: await idOf(host.email), olenaId: await idOf(olena.email), gameId: created.gameId };
  }

  it('profileFacts counts played games, wins, accuracy, quizzes and hosted games', async () => {
    const { hostId, olenaId, gameId } = await playedGame();

    const olena = await profileFacts(db, olenaId);
    expect(olena.stats).toEqual({ games: 1, wins: 1, accuracy: 100, quizzes: 0, hosted: 0 });
    expect(olena.wins).toEqual([{ gameId, title: 'Тестова вікторина', startedAt: expect.any(String), rank: 1 }]);
    expect(Date.parse(olena.wins[0].startedAt)).not.toBeNaN();
    expect(earned(olena.achievements)).toEqual(['first_game', 'first_win']);
    expect(olena.achievements).toHaveLength(16);

    const host = await profileFacts(db, hostId);
    expect(host.stats).toEqual({ games: 0, wins: 0, accuracy: null, quizzes: 2, hosted: 1 });
    expect(host.wins).toEqual([]);
    expect(earned(host.achievements)).toEqual(['host']);
  });

  it('profileFacts earns blitz, final, comeback and friends achievements from stored games', async () => {
    const ids = Array.from({ length: 7 }, () => randomUUID());
    const [hostId, me, ...others] = ids as [string, string, ...string[]];
    await db.insert(user).values(ids.map((id) => ({ id, name: 'Гравець', email: `${id}@example.com` })));
    await db.insert(follow).values(others.map((followeeId) => ({ followerId: me, followeeId })));
    const snapshot = makeRoundsQuiz([blitzRound('b', [single]), finalRound('f', withId(single, 'f1'))]);
    await seedGame(db, {
      hostId,
      snapshot,
      startedAt: new Date(Date.UTC(2026, 0, 1)),
      players: [
        { userId: me, nickname: 'Я', score: 40, rank: 1, rows: [{ questionIndex: 0, roundIndex: 0, accepted: true, points: 10 }, { questionIndex: 1, roundIndex: 1, accepted: true, points: 30 }] },
        { userId: others[0]!, nickname: 'А', score: 20, rank: 2, rows: [{ questionIndex: 0, roundIndex: 0, accepted: true, points: 20 }] },
        ...others.slice(1).map((userId, i) => ({ userId, nickname: `Б${i}`, score: 0, rank: 3 + i })),
      ],
    });
    const earned = (await profileFacts(db, me)).achievements.filter((a) => a.earned).map((a) => a.id);
    expect(earned).toEqual(expect.arrayContaining(['final_hit', 'comeback', 'friends_5']));
    expect(earned).not.toContain('blitz_win');
  });

  it('a right final answer with a stake earns final_hit even when the bank was empty', async () => {
    const ids = Array.from({ length: 3 }, () => randomUUID());
    const [hostId, me, other] = ids as [string, string, string];
    await db.insert(user).values(ids.map((id) => ({ id, name: 'Гравець', email: `${id}@example.com` })));
    // Обидва відповіли правильно, банк порожній: влучання — лише в того, хто ставив.
    await seedGame(db, {
      hostId,
      snapshot: makeRoundsQuiz([finalRound('f', withId(single, 'f1'), { wagerMode: 'bank' })]),
      startedAt: new Date(Date.UTC(2026, 0, 2)),
      players: [
        { userId: me, nickname: 'Я', score: 0, rank: 1, rows: [{ questionIndex: 0, accepted: true, points: 0, wager: 300 }] },
        { userId: other, nickname: 'Б', score: 0, rank: 1, rows: [{ questionIndex: 0, accepted: true, points: 0, wager: 0 }] },
      ],
    });
    const earned = async (userId: string) => (await profileFacts(db, userId)).achievements.filter((a) => a.earned).map((a) => a.id);
    expect(await earned(me)).toContain('final_hit');
    expect(await earned(other)).not.toContain('final_hit');
  });

  it('a game the host abandoned does not count as hosted', async () => {
    const host = await signUp(ctx.app, 'Ведуча');
    const { game: created } = await startGame(ctx.app, makeQuiz([single, text]), host.cookie);
    const room = ctx.manager.get(created.code);
    if (room === undefined) throw new Error('room missing');
    const { playerId } = (await post(`/api/games/by-code/${created.code}/join`, { nickname: 'Тарас' })).json() as { playerId: string };
    ctx.manager.connect(room, { role: 'player', playerId });
    expect(ctx.manager.host(room, { type: 'start' })).toEqual({ ok: true });
    await ctx.recorder.idle();
    await markInterrupted(db);

    const [row] = await db.select({ status: game.status }).from(game).where(eq(game.id, created.gameId));
    expect(row.status).toBe('aborted');
    const facts = await profileFacts(db, await idOf(host.email));
    expect(facts.stats.hosted).toBe(0);
    expect(earned(facts.achievements)).toEqual([]);
  });

  it('profileFacts counts every game, not only the latest hundred', async () => {
    const hostId = randomUUID();
    const playerId = randomUUID();
    await db.insert(user).values([
      { id: hostId, name: 'Ведуча', email: `${hostId}@example.com` },
      { id: playerId, name: 'Олена', email: `${playerId}@example.com` },
    ]);
    const games = Array.from({ length: 101 }, (_, i) => ({
      id: randomUUID(),
      hostId,
      code: String(100000 + i),
      status: 'finished' as const,
      title: `Гра ${i}`,
      quizSnapshot: {},
      questionsPlayed: 0,
      startedAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
      finishedAt: new Date(Date.UTC(2026, 0, 1, 1, i)),
    }));
    await db.insert(game).values(games);
    await db.insert(participant).values(
      games.map((g) => ({ id: randomUUID(), gameId: g.id, nickname: 'Олена', userId: playerId, score: 0, totalTimeMs: 0, rank: 1 })),
    );

    const facts = await profileFacts(db, playerId);
    expect(facts.stats.games).toBe(101);
    expect(earned(facts.achievements)).toEqual(['first_game', 'games_10', 'games_50', 'games_100']);
  });
  it('a final answer counts like any answer in profile stats, silence does not break a perfect game', async () => {
    const classic = ['s1', 's2', 's3', 's4', 's5'].map((id) => withId(single, id));
    const quiz = makeRoundsQuiz([classicRound('r1', classic, { speedBonus: false }), finalRound('f', withId(single, 'f1'))]);
    const host = await signUp(ctx.app, 'Ведуча');
    const play = async (name: string, finalAnswers: (id: string) => string[]) => {
      const player = await signUp(ctx.app, name);
      const { game: created } = await startGame(ctx.app, quiz, host.cookie);
      const { playerId } = (await post(`/api/games/by-code/${created.code}/join`, { nickname: name }, player.cookie)).json() as { playerId: string };
      const room = ctx.manager.get(created.code);
      if (room === undefined) throw new Error('room missing');
      ctx.manager.connect(room, { role: 'player', playerId });
      playToEnd(ctx.manager, room, [playerId], finalAnswers(playerId), () => 0);
      expect(room.state.phase).toBe('finished');
      await ctx.recorder.idle();
      return profileFacts(db, await idOf(player.email));
    };

    const silent = await play('Мовчазна', () => []);
    expect(silent.stats.accuracy).toBe(83);
    expect(earned(silent.achievements)).toContain('perfect_game');

    const right = await play('Впевнена', (id) => [id]);
    expect(right.stats.accuracy).toBe(100);
    expect(earned(right.achievements)).toEqual(expect.arrayContaining(['perfect_game', 'streak_5']));
  });
  it('profile accuracy and the perfect game count a half-price slider and a late revealing answer as correct (10b)', async () => {
    const quiz = makeQuiz([slider, withReveal(text), ...['s1', 's2', 's3'].map((id) => withId(single, id))], { speedBonus: false });
    const host = await signUp(ctx.app, 'Ведуча');
    const play = async (name: string, sliderValue: number) => {
      const player = await signUp(ctx.app, name);
      const { game: created } = await startGame(ctx.app, quiz, host.cookie);
      const { playerId } = (await post(`/api/games/by-code/${created.code}/join`, { nickname: name }, player.cookie)).json() as { playerId: string };
      const room = ctx.manager.get(created.code);
      if (room === undefined) throw new Error('room missing');
      ctx.manager.connect(room, { role: 'player', playerId });
      const step = (type: 'start' | 'next') => expect(ctx.manager.host(room, { type })).toEqual({ ok: true });
      /** Листає «Далі», доки не відкриється наступне запитання або гра не скінчиться. */
      const advance = () => {
        for (let i = 0; i < 8 && room.state.phase !== 'finished'; i += 1) {
          step('next');
          if (room.state.phase === 'question') break;
        }
      };
      step('start');
      step('next');
      ctx.manager.answer(room, playerId, { type: 'slider', value: sliderValue });
      advance();
      // Картинка, що проявляється: відповідь на 18-й секунді з 20 дає лише 37 % ціни, але лишається правильною.
      vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 18_000 });
      try {
        expect(ctx.manager.answer(room, playerId, { type: 'text', value: 'Одеса' })).toEqual({ ok: true });
        const late = room.state.plays.at(-1)?.answers[playerId];
        expect(late).toMatchObject({ accepted: true, grade: 'correct', points: 370 });
        advance();
        for (const option of ['b', 'b', 'b']) {
          ctx.manager.answer(room, playerId, { type: 'single', optionId: option });
          advance();
        }
        await ctx.recorder.idle();
      } finally {
        vi.useRealTimers();
      }
      return profileFacts(db, await idOf(player.email));
    };

    // 57 при правильних 50 (допуск 2, межа нуля 12) — рівно половина ціни: це ще «правильно».
    const half = await play('Половинна', 57);
    expect(half.stats.accuracy).toBe(100);
    expect(earned(half.achievements)).toContain('perfect_game');

    // 58 лишає 40 % ціни: це не «правильно», тож точність нижча, а гра не бездоганна.
    const near = await play('Близька', 58);
    expect(near.stats.accuracy).toBe(80);
    expect(earned(near.achievements)).not.toContain('perfect_game');
  });
  it('profile accuracy and the perfect game count a correct clue answer at any clue and a half-price pin as correct (10c)', async () => {
    const quiz = makeQuiz([clues, pin, ...['s1', 's2', 's3'].map((id) => withId(single, id))], { speedBonus: false });
    const host = await signUp(ctx.app, 'Ведуча');
    const play = async (name: string, answer: string, x: number) => {
      const player = await signUp(ctx.app, name);
      const { game: created } = await startGame(ctx.app, quiz, host.cookie);
      const { playerId } = (await post(`/api/games/by-code/${created.code}/join`, { nickname: name }, player.cookie)).json() as { playerId: string };
      const room = ctx.manager.get(created.code);
      if (room === undefined) throw new Error('room missing');
      ctx.manager.connect(room, { role: 'player', playerId });
      const step = (type: 'start' | 'next') => expect(ctx.manager.host(room, { type })).toEqual({ ok: true });
      const advance = () => {
        for (let i = 0; i < 8 && room.state.phase !== 'finished'; i += 1) {
          step('next');
          if (room.state.phase === 'question') break;
        }
      };
      step('start');
      step('next');
      // Остання підказка (21 с з інтервалом 5 с): лише 20 % ціни, але відповідь правильна.
      vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 21_000 });
      try {
        expect(ctx.manager.answer(room, playerId, { type: 'clues', value: answer })).toEqual({ ok: true });
        expect(room.state.plays.at(-1)?.answers[playerId]).toMatchObject({ accepted: answer === 'Шевченко', grade: answer === 'Шевченко' ? 'correct' : 'wrong' });
      } finally {
        vi.useRealTimers();
      }
      advance();
      ctx.manager.answer(room, playerId, { type: 'pin', x, y: 0.5 });
      advance();
      for (const option of ['b', 'b', 'b']) {
        ctx.manager.answer(room, playerId, { type: 'single', optionId: option });
        advance();
      }
      await ctx.recorder.idle();
      return profileFacts(db, await idOf(player.email));
    };

    // Точка рівно за половину ціни (9 % при радіусах 3 і 15) — ще «правильно».
    const right = await play('Знавчиня', 'Шевченко', 0.59);
    expect(right.stats.accuracy).toBe(100);
    expect(earned(right.achievements)).toContain('perfect_game');

    const wrong = await play('Помилилась', 'Франко', 0.5);
    expect(wrong.stats.accuracy).toBe(80);
    expect(earned(wrong.achievements)).not.toContain('perfect_game');
  });

  /** Гра з акаунтом на одного гравця: колбек дає відповіді на запитання за номером, решту проходить пульт. */
  const playFor = async (name: string, quiz: ReturnType<typeof makeQuiz>, act: (room: Room, playerId: string, index: number) => void) => {
    const host = await signUp(ctx.app, 'Ведуча');
    const player = await signUp(ctx.app, name);
    const { game: created } = await startGame(ctx.app, quiz, host.cookie);
    const { playerId } = (await post(`/api/games/by-code/${created.code}/join`, { nickname: name }, player.cookie)).json() as { playerId: string };
    const room = ctx.manager.get(created.code);
    if (room === undefined) throw new Error('room missing');
    ctx.manager.connect(room, { role: 'player', playerId });
    expect(ctx.manager.host(room, { type: 'start' })).toEqual({ ok: true });
    for (let index = 0; index < questionsOf(quiz).length; index += 1) {
      for (let i = 0; i < 4 && room.state.phase !== 'question'; i += 1) ctx.manager.host(room, { type: 'next' });
      act(room, playerId, index);
    }
    for (let i = 0; i < 4 && room.state.phase !== 'finished'; i += 1) ctx.manager.host(room, { type: 'next' });
    expect(room.state.phase).toBe('finished');
    await ctx.recorder.idle();
    return profileFacts(db, await idOf(player.email));
  };

  it('profile accuracy ignores poll and cloud votes (10d)', async () => {
    const quiz = makeQuiz([wall, poll, cloud, single], { speedBonus: false });
    const group = (room: Room, id: string) => wall.groups.find((g) => g.id === id)?.tiles.map((t) => room.state.presented.indexOf(t.id)) ?? [];
    const play = (name: string, groups: string[], pick: string) =>
      playFor(name, quiz, (room, playerId, index) => {
        if (index === 0) {
          for (const id of groups) ctx.manager.wall(room, playerId, group(room, id));
          ctx.manager.host(room, { type: 'lock' });
        }
        if (index === 1) ctx.manager.answer(room, playerId, { type: 'poll', optionId: 'a' });
        if (index === 2) ctx.manager.answer(room, playerId, { type: 'wordcloud', words: ['Київ'] });
        if (index === 3) ctx.manager.answer(room, playerId, { type: 'single', optionId: pick });
      });

    // Без опитування й хмари знаменник — 2 (стіна й single).
    const right = await play('Стінолаз', ['gr', 'gm'], 'b');
    expect(right.stats.accuracy).toBe(100);
    const wrong = await play('Промах', ['gr'], 'a');
    expect(wrong.stats.accuracy).toBe(0);
  });

  it('a game with one poll vote and all other answers correct still earns the perfect game and the streak (10d)', async () => {
    const quiz = makeQuiz([single, withId(single, 's2'), poll, withId(single, 's3'), withId(single, 's4'), withId(single, 's5')], { speedBonus: false });
    const facts = await playFor('Бездоганна', quiz, (room, playerId, index) => {
      ctx.manager.answer(room, playerId, index === 2 ? { type: 'poll', optionId: 'c' } : { type: 'single', optionId: 'b' });
    });
    expect(facts.stats.accuracy).toBe(100);
    expect(earned(facts.achievements)).toEqual(expect.arrayContaining(['perfect_game', 'streak_5']));
  });

  it('survey accuracy: half the price is correct, less is not, and a cloud survey counts like any answer (10e)', async () => {
    const quiz = makeQuiz([cloud, surveyCloud, survey], { speedBonus: false });
    const play = (name: string, cloudWords: string[], cloudPick: string, hostPick: string[]) =>
      playFor(name, quiz, (room, playerId, index) => {
        if (index === 0) ctx.manager.answer(room, playerId, { type: 'wordcloud', words: cloudWords });
        if (index === 1) ctx.manager.answer(room, playerId, { type: 'survey', values: [cloudPick] });
        if (index === 2) ctx.manager.answer(room, playerId, { type: 'survey', values: hostPick });
        if (index > 0) {
          if (room.state.phase === 'question') ctx.manager.host(room, { type: 'lock' });
          ctx.manager.host(room, { type: 'next' });
          ctx.manager.host(room, { type: 'survey-all' });
        }
      });
    const olena = await play('Знавчиня', ['каштани', 'Дніпро'], 'каштани', ['Яблуко', 'Банан']);
    expect(olena.stats.accuracy).toBe(100);
    const petro = await play('Промах', ['каштани'], 'Лавра', ['Кавун']);
    expect(petro.stats.accuracy).toBe(0);
  });

  it('bluff accuracy: choosing the truth is correct, choosing a lie is not (10f)', async () => {
    const quiz = makeQuiz([bluff], { speedBonus: false });
    const play = (name: string, wantTruth: boolean) =>
      playFor(name, quiz, (room, playerId) => {
        ctx.manager.lie(room, playerId, 'Рим');
        const options = room.state.plays[0].bluff?.options ?? [];
        const own = options.filter((o) => o.authors.includes(playerId)).map((o) => o.id);
        const pick = options.find((o) => (wantTruth ? o.kind === 'truth' : o.kind === 'spare' && !own.includes(o.id)));
        ctx.manager.bluff(room, playerId, pick?.id ?? '');
        ctx.manager.host(room, { type: 'next' });
        ctx.manager.host(room, { type: 'bluff-all' });
      });
    const petro = await play('Петро', true);
    expect(petro.stats.accuracy).toBe(100);
    const olena = await play('Олена', false);
    expect(olena.stats.accuracy).toBe(0);
  });

  it('wipeout accuracy comes from the answers the player gave: the steps after burning have no rows (10g)', async () => {
    const host = await signUp(ctx.app, 'Ведуча');
    const quiz = makeRoundsQuiz([wipeoutRound('w', wipeoutLadder)]);
    const { game: created } = await startGame(ctx.app, quiz, host.cookie);
    const room = ctx.manager.get(created.code);
    if (room === undefined) throw new Error('room missing');
    const people: Record<string, { playerId: string; email: string }> = {};
    for (const name of ['Згорів', 'Забрав', 'Дійшов', 'Мовчун']) {
      const player = await signUp(ctx.app, name);
      const { playerId } = (await post(`/api/games/by-code/${created.code}/join`, { nickname: name }, player.cookie)).json() as { playerId: string };
      ctx.manager.connect(room, { role: 'player', playerId });
      people[name] = { playerId, email: player.email };
    }
    const id = (name: string) => people[name].playerId;
    playWipeout(ctx.manager, room, { [id('Згорів')]: [0], [id('Забрав')]: [0, 1, 2, 3, 4], [id('Дійшов')]: [0, 1, 2, 3, 4], [id('Мовчун')]: null }, { [id('Забрав')]: 1 });
    expect(room.state.phase).toBe('finished');
    await ctx.recorder.idle();
    const accuracy = async (name: string) => (await profileFacts(db, await idOf(people[name].email))).stats.accuracy;
    // Згорів: 1 з 2 відповідей; Забрав: 2 з 2 (далі не грав); Дійшов: 5 з 5.
    expect(await accuracy('Згорів')).toBe(50);
    expect(await accuracy('Забрав')).toBe(100);
    expect(await accuracy('Дійшов')).toBe(100);
    // Мовчун у грі на першій сходинці, тож його мовчання — одна невдала відповідь; далі він згорів і не грав.
    expect(await accuracy('Мовчун')).toBe(0);
  });
  it('survival accuracy comes from the questions the player was alive for: the ghost questions have no rows and a ghost answer changes nothing (10h)', async () => {
    const host = await signUp(ctx.app, 'Ведуча');
    const quiz = makeRoundsQuiz([survivalRound('rs', survivalQuestions, survivalTrials)]);
    const { game: created } = await startGame(ctx.app, quiz, host.cookie);
    const room = ctx.manager.get(created.code);
    if (room === undefined) throw new Error('room missing');
    const people: Record<string, { playerId: string; email: string }> = {};
    for (const name of ['Привид', 'Вибув', 'Дожив']) {
      const player = await signUp(ctx.app, name);
      const { playerId } = (await post(`/api/games/by-code/${created.code}/join`, { nickname: name }, player.cookie)).json() as { playerId: string };
      ctx.manager.connect(room, { role: 'player', playerId });
      people[name] = { playerId, email: player.email };
    }
    const id = (name: string) => people[name].playerId;
    // s1: Привид помилився й вибув на питанні. s2: він відгадує як привид; Вибув помилився й вибув — лишився Дожив.
    playSurvivalQuestion(ctx.manager, room, { right: [id('Вибув'), id('Дожив')], trial: [] });
    playSurvivalQuestion(ctx.manager, room, { right: [id('Дожив')], ghosts: { [id('Привид')]: true }, trial: [] });
    for (let guard = 0; guard < 4 && room.state.phase !== 'finished'; guard++) ctx.manager.host(room, { type: 'next' });
    expect(room.state.phase).toBe('finished');
    await ctx.recorder.idle();
    const accuracy = async (name: string) => (await profileFacts(db, await idOf(people[name].email))).stats.accuracy;
    // Привид: 0 з 1 (s2 — не його запитання, його правильна відповідь привида не рахується); Вибув: 1 з 2; Дожив: 2 з 2.
    expect(await accuracy('Привид')).toBe(0);
    expect(await accuracy('Вибув')).toBe(50);
    expect(await accuracy('Дожив')).toBe(100);
  });
  it('ladder accuracy counts the contestant answers and only the hall answers given: a silent hall question is not a miss (10i)', async () => {
    const host = await signUp(ctx.app, 'Ведуча');
    const quiz = makeRoundsQuiz([ladderRound('rl')]);
    const { game: created } = await startGame(ctx.app, quiz, host.cookie);
    const room = ctx.manager.get(created.code);
    if (room === undefined) throw new Error('room missing');
    const people: Record<string, { playerId: string; email: string }> = {};
    for (const name of ['Учасник', 'Глядач']) {
      const player = await signUp(ctx.app, name);
      const { playerId } = (await post(`/api/games/by-code/${created.code}/join`, { nickname: name }, player.cookie)).json() as { playerId: string };
      ctx.manager.connect(room, { role: 'player', playerId });
      people[name] = { playerId, email: player.email };
    }
    const id = (name: string) => people[name].playerId;
    ctx.manager.host(room, { type: 'start' });
    expect(ctx.manager.hostLadderPick(room, id('Учасник'))).toEqual({ ok: true });
    // l1: обидва правильно; l2: Глядач мовчить; l3: Учасник помиляється, Глядач мовчить — і це кінець драбини.
    playLadderQuestion(ctx.manager, room, { contestant: true, hall: { [id('Глядач')]: true } });
    expect(ctx.manager.ladderDecide(room, id('Учасник'), false)).toEqual({ ok: true });
    playLadderQuestion(ctx.manager, room, { contestant: true });
    expect(ctx.manager.ladderDecide(room, id('Учасник'), false)).toEqual({ ok: true });
    playLadderQuestion(ctx.manager, room, { contestant: false });
    for (let guard = 0; guard < 4 && room.state.phase !== 'finished'; guard++) ctx.manager.host(room, { type: 'next' });
    expect(room.state.phase).toBe('finished');
    await ctx.recorder.idle();
    const accuracy = async (name: string) => (await profileFacts(db, await idOf(people[name].email))).stats.accuracy;
    // Глядач: 1 з 1 (на l2 і l3 він мовчав); Учасник: 2 з 3.
    expect(await accuracy('Глядач')).toBe(100);
    expect(await accuracy('Учасник')).toBe(67);
  });
});
