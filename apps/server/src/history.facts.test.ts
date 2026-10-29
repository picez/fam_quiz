import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { defaultTeams, factTable, gameAwards } from '@quiz/shared';
import { factInput } from '@quiz/engine';
import { blitzRound, bluff, boardRound, classicRound, finalRound, makeQuiz, makeRoundsQuiz, poll, single, text, withId, withVideo } from '@quiz/engine/testing';
import { buildApp } from './app';
import { hostGame, hostGameWithFacts } from './history';
import type { Db } from './db/client';
import { answer, AWAY_ATTEMPT, game, PENALTY_ATTEMPT, user, VOTE_ATTEMPT } from './db/schema';
import { TEST_AUTH, signUp } from './testing/accounts';
import { FakeScheduler } from './testing/fake-scheduler';
import { seedGame } from './testing/history-rows';
import { createTestDb } from './testing/test-db';
import { TEAM_HOST, recordedTeamGame, toEnd, toQuestion } from './testing/team-game';

let ctx: Awaited<ReturnType<typeof buildApp>>;
let db: Db;

beforeAll(async () => {
  db = await createTestDb();
  ctx = await buildApp({ db, auth: TEST_AUTH });
});

afterAll(async () => {
  await ctx.app.close();
});

const hostAccount = async () => {
  const host = await signUp(ctx.app, 'Ведуча');
  const [account] = await db.select().from(user).where(eq(user.email, host.email));
  return account.id;
};

describe('history facts (12d)', () => {
  it('the same game gives the same awards and participant table in the history as at the finish', async () => {
    const scheduler = new FakeScheduler();
    const localDb = await createTestDb();
    const local = await buildApp({ db: localDb, auth: TEST_AUTH, scheduler });
    const send = (url: string, payload: object, cookie?: string) =>
      local.app.inject({ method: 'POST', url, payload, headers: cookie === undefined ? {} : { cookie } });
    const host = await signUp(local.app, 'Ведуча');
    const [account] = await localDb.select().from(user).where(eq(user.email, host.email));
    const quiz = makeRoundsQuiz(
      [
        classicRound('r1', [single, poll, bluff], { speedBonus: false }),
        blitzRound('b1', [withId(single, 'bq')], { attempts: 2, check: 'manual' }),
        finalRound('f', withId(single, 'fq')),
      ],
      { buffs: ['double'] },
    );
    const quizId = ((await send('/api/quizzes', quiz, host.cookie)).json() as { id: string }).id;
    const created = (await send('/api/games', { quizId }, host.cookie)).json() as { gameId: string; code: string };
    const room = local.manager.get(created.code);
    if (room === undefined) throw new Error('room missing');
    const ids: Record<string, string> = {};
    for (const name of ['Оля', 'Петро', 'Віра', 'Марко']) {
      ids[name] = ((await send(`/api/games/by-code/${created.code}/join`, { nickname: name })).json() as { playerId: string }).playerId;
      local.manager.connect(room, { role: 'player', playerId: ids[name] });
    }
    const { Оля: olya, Петро: petro, Віра: vira, Марко: marko } = ids;
    const host$ = (type: 'start' | 'next' | 'lock' | 'bluff-all') => local.manager.host(room, { type });
    const right = { type: 'single', optionId: 'b' } as const;
    const wrong = { type: 'single', optionId: 'a' } as const;
    const optionId = (textOf: string) => room.state.plays[room.state.questionIndex].bluff?.options.find((o) => o.text === textOf)?.id ?? '';

    expect(host$('start')).toEqual({ ok: true });
    expect(local.manager.host(room, { type: 'adjust', playerId: olya, points: 300 })).toEqual({ ok: true });
    expect(local.manager.buyDebuff(room, olya, petro, 'fog')).toEqual({ ok: true });

    const done = new Set<number>();
    for (let guard = 0; guard < 80 && room.state.phase !== 'finished'; guard++) {
      const { phase, questionIndex } = room.state;
      const play = room.state.plays[questionIndex];
      if (phase === 'wager') {
        for (const [id, amount] of [[olya, 200], [petro, 100], [vira, 50]] as const) local.manager.wager(room, id, amount);
      } else if (phase === 'question' && !done.has(questionIndex)) {
        done.add(questionIndex);
        // Виходи з гри (12e): Оля 3,5 с на першому запитанні, Петро рівно 2 с на bluff; Віра 1,5 с — нижче порогу.
        // Голос опитування — рядок VOTE_ATTEMPT, не відповідь: позначка на опитуванні в базі не рахується (рушій її теж пропускає).
        // У фіналі Віра мовчить (штрафний рядок): її вихід теж рахується.
        const away =
          questionIndex === 0
            ? { [olya]: 3500, [vira]: 1500 }
            : play.question.type === 'bluff'
              ? { [petro]: 2000 }
              : play.final !== undefined
                ? { [vira]: 5000 }
                : {};
        if (Object.keys(away).length > 0) {
          const plays = [...room.state.plays];
          plays[questionIndex] = { ...play, away: Object.fromEntries(Object.entries(away).map(([id, ms]) => [id, { ms, count: 1, since: null }])) };
          room.state = { ...room.state, plays };
        }
        if (play.question.type === 'poll') {
          // Голоси опитування — не відповіді.
          for (const id of [olya, petro, vira]) local.manager.answer(room, id, { type: 'poll', optionId: 'a' });
        } else if (play.question.type === 'bluff') {
          expect(local.manager.lie(room, olya, 'Рим')).toEqual({ ok: true });
          expect(local.manager.lie(room, petro, 'Мілан')).toEqual({ ok: true });
          expect(local.manager.lie(room, vira, 'Париж')).toEqual({ ok: true });
          expect(local.manager.bluff(room, olya, optionId('Мілан'))).toEqual({ ok: true });
          expect(local.manager.bluff(room, petro, optionId('Барселона'))).toEqual({ ok: true });
          expect(local.manager.bluff(room, vira, optionId('Мілан'))).toEqual({ ok: true });
        } else if (play.blitz !== undefined) {
          // Петро: дві спроби, друга правильна.
          for (const [choice, correct] of [['a', false], ['b', true]] as const) {
            expect(local.manager.buzz(room, petro)).toEqual({ ok: true });
            expect(local.manager.answer(room, petro, { type: 'single', optionId: choice })).toEqual({ ok: true });
            expect(local.manager.host(room, { type: 'judge', playerId: petro, correct })).toEqual({ ok: true });
          }
        } else if (play.final !== undefined) {
          // Віра мовчить: мовчання у фіналі — не рядок.
          local.manager.answer(room, olya, right);
          local.manager.answer(room, petro, wrong);
        } else {
          expect(local.manager.buff(room, olya, 'double')).toEqual({ ok: true });
          local.manager.answer(room, olya, right);
          local.manager.answer(room, petro, wrong);
          local.manager.answer(room, vira, right);
          // Марко відповідає на перше запитання найшвидше, а потім його вилучають.
          if (questionIndex === 0) local.manager.answer(room, marko, right);
        }
        if (room.state.phase === 'question') host$('lock');
      } else if (phase === 'reveal' && questionIndex === 0 && room.state.players.some((p) => p.id === marko)) {
        expect(local.manager.host(room, { type: 'kick', playerId: marko })).toEqual({ ok: true });
      } else if (phase === 'reveal' && play.question.type === 'bluff') {
        host$('bluff-all');
        host$('next');
      } else host$('next');
    }
    expect(room.state.phase).toBe('finished');
    await local.recorder.idle();

    const found = await hostGameWithFacts(localDb, account.id, created.gameId);
    const detail = found?.detail;
    const live = factInput(room.state);
    expect(live.players.map((p) => p.id)).not.toContain(marko);
    expect(live.questions.some((q) => !q.scored)).toBe(true);
    // Вхід з бази той самий, що в рушія: учасники, запитання, рядки (порядок рядків — не дані), дебафи.
    const byKey = (rows: typeof live.rows) => [...rows].sort((a, b) => a.questionIndex - b.questionIndex || a.playerId.localeCompare(b.playerId) || a.attempt - b.attempt);
    expect(found?.factInput.players).toEqual(live.players);
    expect(found?.factInput.questions).toEqual(live.questions);
    expect(byKey(found?.factInput.rows ?? [])).toEqual(byKey(live.rows));
    expect(found?.factInput.debuffs).toEqual(live.debuffs);
    // Позначки «відволікався» (12e): ті самі й у тому самому вигляді; поріг — від 2 с.
    const byAway = (rows: typeof live.away) => [...rows].sort((a, b) => a.questionIndex - b.questionIndex || a.playerId.localeCompare(b.playerId));
    expect(live.away).toEqual(expect.arrayContaining([{ playerId: olya, questionIndex: 0 }]));
    expect(live.away.some((a) => a.playerId === vira && a.questionIndex === 0)).toBe(false);
    // Рядок-штраф (мовчання у фіналі) теж дає позначку, як у грі.
    const finalIndex = room.state.plays.findIndex((p) => p.final !== undefined);
    expect(live.away).toEqual(expect.arrayContaining([{ playerId: vira, questionIndex: finalIndex }]));
    expect(byAway(found?.factInput.away ?? [])).toEqual(byAway(live.away));
    // Перевірка, що гра справді дала рядки всіх видів.
    expect(live.rows.some((r) => r.attempt === 1)).toBe(true);
    expect(live.rows.some((r) => r.bluff !== null)).toBe(true);
    expect(live.rows.some((r) => r.wager !== null && r.wager > 0)).toBe(true);
    expect(live.rows.some((r) => r.buff === 'double')).toBe(true);
    expect(live.debuffs).toEqual([{ by: olya, target: petro }]);
    expect(gameAwards(live).map((a) => a.kind)).toContain('bluffer');

    expect(detail?.facts.awards).toEqual(gameAwards(live));
    expect(detail?.facts.table).toEqual(factTable(live));
    await local.app.close();
  });

  it('a silent risk, a right and a wrong risk give the same facts live and in the history; the silent one is no answer row (12h)', async () => {
    const scheduler = new FakeScheduler();
    const localDb = await createTestDb();
    const local = await buildApp({ db: localDb, auth: TEST_AUTH, scheduler });
    const send = (url: string, payload: object, cookie?: string) =>
      local.app.inject({ method: 'POST', url, payload, headers: cookie === undefined ? {} : { cookie } });
    const host = await signUp(local.app, 'Ведуча');
    const [account] = await localDb.select().from(user).where(eq(user.email, host.email));
    const quiz = makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2')], { speedBonus: false })], { buffs: ['risk'] });
    const quizId = ((await send('/api/quizzes', quiz, host.cookie)).json() as { id: string }).id;
    const created = (await send('/api/games', { quizId }, host.cookie)).json() as { gameId: string; code: string };
    const room = local.manager.get(created.code);
    if (room === undefined) throw new Error('room missing');
    const ids: Record<string, string> = {};
    for (const name of ['Оля', 'Петро', 'Віра']) {
      ids[name] = ((await send(`/api/games/by-code/${created.code}/join`, { nickname: name })).json() as { playerId: string }).playerId;
      local.manager.connect(room, { role: 'player', playerId: ids[name] });
    }
    const { Оля: olya, Петро: petro, Віра: vira } = ids;
    const right = { type: 'single', optionId: 'b' } as const;
    const wrong = { type: 'single', optionId: 'a' } as const;
    expect(local.manager.host(room, { type: 'start' })).toEqual({ ok: true });
    const done = new Set<number>();
    for (let guard = 0; guard < 40 && room.state.phase !== 'finished'; guard++) {
      const { phase, questionIndex } = room.state;
      if (phase === 'question' && !done.has(questionIndex)) {
        done.add(questionIndex);
        if (questionIndex === 0) {
          // Оля бере «Ризик», відволікається на 3 с і мовчить; Петро — «Ризик» і правильно; Віра — правильно без бафу.
          const plays = [...room.state.plays];
          plays[0] = { ...plays[0], away: { [olya]: { ms: 3000, count: 1, since: null } } };
          room.state = { ...room.state, plays };
          expect(local.manager.buff(room, olya, 'risk')).toEqual({ ok: true });
          expect(local.manager.buff(room, petro, 'risk')).toEqual({ ok: true });
          local.manager.answer(room, petro, right);
          local.manager.answer(room, vira, right);
          scheduler.advance(60_000);
        } else {
          // Віра — «Ризик» і неправильно; Оля й Петро — правильно.
          expect(local.manager.buff(room, vira, 'risk')).toEqual({ ok: true });
          for (const [id, given] of [[vira, wrong], [olya, right], [petro, right]] as const) local.manager.answer(room, id, given);
        }
        expect(room.state.phase).not.toBe('question');
      } else local.manager.host(room, { type: 'next' });
    }
    expect(room.state.phase).toBe('finished');
    await local.recorder.idle();

    const live = factInput(room.state);
    expect(room.state.plays[0].answers[olya]).toMatchObject({ answer: null, buff: 'risk', points: -1000 });
    expect(live.rows.filter((r) => r.buff === 'risk').map((r) => [r.playerId, r.questionIndex, r.accepted])).toEqual(
      expect.arrayContaining([
        [petro, 0, true],
        [vira, 1, false],
      ]),
    );
    expect(live.rows).toEqual(expect.not.arrayContaining([expect.objectContaining({ playerId: olya, questionIndex: 0 })]));
    const found = await hostGameWithFacts(localDb, account.id, created.gameId);
    const byKey = (rows: typeof live.rows) => [...rows].sort((a, b) => a.questionIndex - b.questionIndex || a.playerId.localeCompare(b.playerId) || a.attempt - b.attempt);
    expect(found?.factInput.players).toEqual(live.players);
    expect(found?.factInput.questions).toEqual(live.questions);
    expect(byKey(found?.factInput.rows ?? [])).toEqual(byKey(live.rows));
    expect(found?.factInput.away).toEqual(live.away);
    expect(found?.detail.facts.awards).toEqual(gameAwards(live));
    expect(found?.detail.facts.table).toEqual(factTable(live));
    // Рахунок кожного — сума його рядків у базі; у «відповіли» мовчання не входить.
    const stored = await localDb.select().from(answer);
    for (const p of found?.detail.standings ?? []) {
      const id = ids[p.nickname];
      expect(p.score).toBe(stored.filter((a) => a.participantId === id).reduce((sum, a) => sum + a.points, 0));
      expect(p.score).toBe(room.state.players.find((q) => q.id === id)?.score);
    }
    expect(found?.detail.questions[0].answered).toBe(2);
    await local.app.close();
  });

  it('a marked player who never answered: a classic silence and a blitz non-presser without a penalty give the same away facts live and in the history', async () => {
    const scheduler = new FakeScheduler();
    const localDb = await createTestDb();
    const local = await buildApp({ db: localDb, auth: TEST_AUTH, scheduler });
    const send = (url: string, payload: object, cookie?: string) =>
      local.app.inject({ method: 'POST', url, payload, headers: cookie === undefined ? {} : { cookie } });
    const host = await signUp(local.app, 'Ведуча');
    const [account] = await localDb.select().from(user).where(eq(user.email, host.email));
    const quiz = makeRoundsQuiz([
      classicRound('r1', [single, poll], { speedBonus: false }),
      blitzRound('b1', [withId(single, 'bq')], { attempts: 1, check: 'manual' }),
    ]);
    const quizId = ((await send('/api/quizzes', quiz, host.cookie)).json() as { id: string }).id;
    const created = (await send('/api/games', { quizId }, host.cookie)).json() as { gameId: string; code: string };
    const room = local.manager.get(created.code);
    if (room === undefined) throw new Error('room missing');
    const ids: Record<string, string> = {};
    for (const name of ['Оля', 'Петро']) {
      ids[name] = ((await send(`/api/games/by-code/${created.code}/join`, { nickname: name })).json() as { playerId: string }).playerId;
      local.manager.connect(room, { role: 'player', playerId: ids[name] });
    }
    const { Оля: olya, Петро: petro } = ids;
    const right = { type: 'single', optionId: 'b' } as const;
    expect(local.manager.host(room, { type: 'start' })).toEqual({ ok: true });
    const done = new Set<number>();
    for (let guard = 0; guard < 40 && room.state.phase !== 'finished'; guard++) {
      const { phase, questionIndex } = room.state;
      const play = room.state.plays[questionIndex];
      if (phase === 'question' && !done.has(questionIndex)) {
        done.add(questionIndex);
        // Оля поза грою на кожному запитанні й ніде не відповідає; на опитуванні її позначка не рахується ніде.
        const plays = [...room.state.plays];
        plays[questionIndex] = { ...play, away: { [olya]: { ms: 3500, count: 1, since: null } } };
        room.state = { ...room.state, plays };
        if (play.question.type === 'poll') local.manager.answer(room, petro, { type: 'poll', optionId: 'a' });
        else if (play.blitz !== undefined) {
          expect(local.manager.buzz(room, petro)).toEqual({ ok: true });
          expect(local.manager.answer(room, petro, right)).toEqual({ ok: true });
          expect(local.manager.host(room, { type: 'judge', playerId: petro, correct: true })).toEqual({ ok: true });
        } else local.manager.answer(room, petro, right);
        if (room.state.phase === 'question') local.manager.host(room, { type: 'lock' });
      } else local.manager.host(room, { type: 'next' });
    }
    expect(room.state.phase).toBe('finished');
    await local.recorder.idle();

    const live = factInput(room.state);
    expect(live.away).toEqual([
      { playerId: olya, questionIndex: 0 },
      { playerId: olya, questionIndex: 2 },
    ]);
    const found = await hostGameWithFacts(localDb, account.id, created.gameId);
    expect(found?.factInput.away).toEqual(live.away);
    expect(found?.factInput.rows).toEqual(expect.not.arrayContaining([expect.objectContaining({ playerId: olya })]));
    expect(found?.detail.facts.table).toEqual(factTable(live));
    // Рядок лише з позначкою: 0 балів, без відповіді; не відповідь у деталях; рахунок — сума рядків.
    const stored = await localDb.select().from(answer).where(eq(answer.participantId, olya));
    expect(stored.map((a) => [a.questionIndex, a.attempt, a.points, a.payload, a.accepted, a.awayMs])).toEqual(
      expect.arrayContaining([
        [0, AWAY_ATTEMPT, 0, null, false, 3500],
        [2, AWAY_ATTEMPT, 0, null, false, 3500],
      ]),
    );
    expect(stored).toHaveLength(2);
    const olyaRow = found?.detail.standings.find((s) => s.nickname === 'Оля');
    expect(olyaRow?.score).toBe(stored.reduce((sum, a) => sum + a.points, 0));
    expect(olyaRow?.correct).toBe(0);
    for (const q of found?.detail.questions ?? []) {
      expect(q.responses.map((r) => r.nickname)).not.toContain('Оля');
      expect(q.answered).toBe(1);
    }
    await local.app.close();
  });

  it('penalty rows count as away marks, votes do not (a blitz non-presser, a silent final entry)', async () => {
    const hostId = await hostAccount();
    const { gameId, participantIds } = await seedGame(db, {
      hostId,
      startedAt: new Date(2026, 0, 4),
      questionsPlayed: 3,
      players: [
        {
          userId: null,
          nickname: 'Оля',
          score: 0,
          rank: 1,
          rows: [
            { questionIndex: 0, attempt: PENALTY_ATTEMPT, accepted: false, points: -200, awayMs: 2600 },
            { questionIndex: 1, attempt: PENALTY_ATTEMPT, accepted: false, points: -100, awayMs: 1900 },
            { questionIndex: 2, attempt: VOTE_ATTEMPT, accepted: false, points: 0, awayMs: 3000 },
          ],
        },
      ],
    });
    const found = await hostGameWithFacts(db, hostId, gameId);
    expect(found?.factInput.away).toEqual([{ playerId: participantIds[0], questionIndex: 0 }]);
  });

  it('an old game without times of buffs, wagers and bluff payloads still gives accuracy and best streak', async () => {
    const hostId = await hostAccount();
    const { gameId, participantIds } = await seedGame(db, {
      hostId,
      startedAt: new Date(2026, 0, 3),
      snapshot: makeQuiz([single, withId(single, 's2'), withId(single, 's3')]),
      questionsPlayed: 3,
      players: [
        {
          userId: null,
          nickname: 'Тарас',
          score: 3000,
          rank: 1,
          rows: [0, 1, 2].map((questionIndex) => ({ questionIndex, accepted: true, points: 1000 })),
        },
        {
          userId: null,
          nickname: 'Олена',
          score: 1000,
          rank: 2,
          rows: [
            { questionIndex: 0, accepted: false, points: 0 },
            { questionIndex: 1, accepted: true, points: 1000 },
          ],
        },
      ],
    });
    const facts = (await hostGame(db, hostId, gameId))?.facts;
    expect(facts?.table).toMatchObject([
      { playerId: participantIds[0], nickname: 'Тарас', correct: 3, answered: 3, bestStreak: 3 },
      { playerId: participantIds[1], nickname: 'Олена', correct: 1, answered: 2, bestStreak: 1 },
    ]);
    const kinds = facts?.awards.map((a) => a.kind) ?? [];
    expect(kinds).toContain('streak');
    expect(kinds).not.toContain('bluffer');
    expect(kinds).not.toContain('gullible');
  });

  it('a broken snapshot: the table comes from the rows, awards have no lightning and no hardest question', async () => {
    const hostId = await hostAccount();
    const { gameId } = await seedGame(db, {
      hostId,
      startedAt: new Date(),
      snapshot: { title: 'Зіпсована', rounds: [{ id: 'r1', type: 'classic', questions: [{}, {}, {}] }] },
      questionsPlayed: 3,
      players: [
        { userId: null, nickname: 'Тарас', score: 2000, rank: 1, rows: [0, 1, 2].map((questionIndex) => ({ questionIndex, accepted: questionIndex !== 1, points: 1000 })) },
        { userId: null, nickname: 'Олена', score: 0, rank: 2, rows: [0, 1, 2].map((questionIndex) => ({ questionIndex, accepted: false, points: 0 })) },
      ],
    });
    const facts = (await hostGame(db, hostId, gameId))?.facts;
    expect(facts?.table.map((r) => [r.nickname, r.correct, r.answered, r.avgMs])).toEqual([
      ['Тарас', 2, 3, null],
      ['Олена', 0, 3, null],
    ]);
    const kinds = facts?.awards.map((a) => a.kind) ?? [];
    expect(kinds).not.toContain('lightning');
    expect(kinds).not.toContain('hardest');
  });

  it('a team game: the participants are the teams, not the people', async () => {
    const t = await recordedTeamGame(makeRoundsQuiz([classicRound('r1', [single, withId(single, 's2')], { speedBonus: false })], { teams: defaultTeams(2) }));
    const { manager, room, members } = t;
    for (let i = 0; i < 2; i++) {
      toQuestion(manager, room);
      expect(manager.answer(room, members['Оля'], { type: 'single', optionId: 'b' })).toEqual({ ok: true });
      expect(manager.answer(room, members['Віра'], { type: 'single', optionId: 'a' })).toEqual({ ok: true });
    }
    toEnd(manager, room);
    await t.recorder.idle();
    expect(t.errors).toEqual([]);

    const detail = await hostGame(t.db, TEAM_HOST, room.id);
    expect(detail?.facts.table.map((r) => [r.playerId, r.nickname, r.correct])).toEqual([
      [t.teams[0], 'Червоні', 2],
      [t.teams[1], 'Сині', 0],
    ]);
    const live = factInput(room.state);
    expect(detail?.facts.table).toEqual(factTable(live));
    expect(detail?.facts.awards).toEqual(gameAwards(live));
  });

  it('a video question and a voice cell have no answer time: the average leaves them out', async () => {
    const hostId = await hostAccount();
    const quiz = makeRoundsQuiz([
      classicRound('r1', [withVideo(single, { id: 'dQw4w9WgXcQ', start: 0 }), withId(text, 't2')]),
      // Поле 3 × 3: v1 — усна клітинка, v2 — звичайна.
      boardRound(
        'rb',
        ['Природа', 'Наука', 'Україна'].map((title, c) => ({
          title,
          cells: [0, 1, 2].map((n) => {
            const question = withId(single, c === 0 && n < 2 ? `v${n + 1}` : `b${c}${n}`);
            return c === 0 && n === 0 ? { question, answerMode: 'voice' as const } : question;
          }),
        })),
      ),
    ]);
    const { gameId, participantIds } = await seedGame(db, {
      hostId,
      startedAt: new Date(),
      snapshot: quiz,
      questionsPlayed: 4,
      players: [{ userId: null, nickname: 'Олена', score: 4000, rank: 1 }],
    });
    const [olena] = participantIds;
    await db
      .update(game)
      .set({
        plays: [
          { roundIndex: 0, questionId: single.id },
          { roundIndex: 0, questionId: 't2' },
          { roundIndex: 1, questionId: 'v1', cell: { cellId: 'v1', chooserId: olena } },
          { roundIndex: 1, questionId: 'v2', cell: { cellId: 'v2', chooserId: olena } },
        ],
      })
      .where(eq(game.id, gameId));
    await db.insert(answer).values(
      [1000, 4000, 9000, 6000].map((timeMs, questionIndex) => ({
        participantId: olena,
        questionIndex,
        attempt: 0,
        roundIndex: questionIndex < 2 ? 0 : 1,
        payload: null,
        timeMs,
        accepted: true,
        points: 1000,
        wager: null,
        buff: null,
        spareId: null,
        overridden: false,
      })),
    );
    const detail = await hostGame(db, hostId, gameId);
    expect(detail?.questions).toHaveLength(4);
    expect(detail?.facts.table).toEqual([{ playerId: olena, nickname: 'Олена', correct: 4, answered: 4, avgMs: 5000, bestStreak: 2 }]);
  });
});
