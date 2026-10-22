import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, roundBrief, type Answer, type Phase, type Question } from '@quiz/shared';
import { buzz } from './blitz';
import { nameAnswer, pickCell } from './board';
import { rollDie, startDice } from './board-dice';
import { turnSchedule } from './board-turns';
import { adjustScore } from './adjust';
import { adjustTime } from './timing';
import { acceptAnswer, endRound, judge, lock, next, override, pause, removePlayer, repick, setConnected, start, submitAnswer, type GameState } from './game';
import { placeWager } from './final';
import { guessWord, takeHint } from './chain';
import { blitzRound, boardRound, bool, chain, classicRound, finalRound, makeQuiz, makeRoundsQuiz, match, multi, order, single, text, withId, withPoints, withVideo } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { hostView, playerView, stageView } from './views';

const T0 = 1_000_000;
const quiz = makeQuiz([single, text]);
const correct = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;

const lobby = () => lobbyWith(quiz, 'Олена', 'Тарас');
const open = () => startRound(lobby(), T0);
const oneAnswered = () => must(submitAnswer(open(), 'p1', correct, T0 + 10_000));
const locked = () => must(submitAnswer(oneAnswered(), 'p2', wrong, T0 + 10_000));
const reveal = () => must(next(locked(), T0 + 20_000));
const leaderboard = () => must(next(reveal(), T0 + 30_000));

describe('lobby views', () => {
  it('lists players and has no question', () => {
    const view = stageView(lobby());
    expect(view.phase).toBe('lobby');
    expect(view.question).toBeNull();
    expect(view.players).toEqual([
      { id: 'p1', nickname: 'Олена', connected: true, streak: 0 },
      { id: 'p2', nickname: 'Тарас', connected: true, streak: 0 },
    ]);
    expect(view.playerCount).toBe(2);
    expect(view.total).toBe(2);
  });

  it('returns null for a player who is not in the game', () => {
    expect(playerView(lobby(), 'nobody')).toBeNull();
  });
});

describe('while a question is open', () => {
  it('shows the question with choices and the deadline', () => {
    const view = stageView(oneAnswered());
    expect(view.question).toEqual({
      type: 'single',
      text: 'Столиця України?',
      imageUrl: null,
      timeLimit: 20,
      video: null,
      points: 1000,
      choices: [
        { id: 'a', text: 'Львів' },
        { id: 'b', text: 'Київ' },
        { id: 'c', text: 'Одеса' },
      ],
      right: [],
      orderLabels: null,
      chain: null,
    });
    expect(view.endsAt).toBe(T0 + 20_000);
    expect(view.answeredCount).toBe(1);
  });

  it('does not leak the correct answer to the stage or to players', () => {
    const state = oneAnswered();
    const stage = stageView(state);
    const player = playerView(state, 'p1');
    expect(JSON.stringify(stage)).not.toContain('correctId');
    expect(JSON.stringify(player)).not.toContain('correctId');
    expect(stage.reveal).toBeNull();
    expect(stage.stats).toBeNull();
    expect(player?.reveal).toBeNull();
  });

  it('shows a player their own answer but not its result', () => {
    const view = playerView(oneAnswered(), 'p1');
    expect(view?.me.answer).toEqual(correct);
    expect(view?.me.result).toBeNull();
    expect(playerView(oneAnswered(), 'p2')?.me.answer).toBeNull();
  });

  it('gives the host the correct answer and live responses', () => {
    const view = hostView(oneAnswered());
    expect(view.correct).toMatchObject({ correctId: 'b' });
    expect(view.responses).toEqual([
      {
        playerId: 'p1',
        nickname: 'Олена',
        answer: correct,
        timeMs: 10_000,
        accepted: true,
        grade: 'correct',
        streakBonus: 0,
        points: 750,
        overridden: false,
      },
    ]);
  });

  it('players see the order labels, other types have none', () => {
    const labelled = { ...order, topLabel: 'Захід', bottomLabel: 'Схід' };
    const view = (question: Question) => stageView(startRound(lobbyWith(makeQuiz([question]), 'Олена'), T0, () => 0.999)).question;
    expect(view(labelled)?.orderLabels).toEqual({ top: 'Захід', bottom: 'Схід' });
    expect(view(order)?.orderLabels).toEqual({ top: '', bottom: '' });
    expect(view(single)?.orderLabels).toBeNull();
  });

  it('picture options keep their pictures in the shown order', () => {
    const pic = '/uploads/abcdefabcdefabcd.png';
    const pictured = { ...single, options: single.options.map((o) => (o.id === 'b' ? { ...o, imageUrl: pic } : o)) };
    const state = startRound(lobbyWith(makeQuiz([pictured], { shuffleOptions: true }), 'Олена'), T0, () => 0);
    const choices = stageView(state).question?.choices ?? [];
    expect(choices.map((c) => c.id)).not.toEqual(['a', 'b', 'c']);
    expect(choices.find((c) => c.id === 'b')?.imageUrl).toBe(pic);
    expect(choices.find((c) => c.id === 'a')).not.toHaveProperty('imageUrl');
    expect(playerView(state, 'p1')?.question?.choices.find((c) => c.id === 'b')?.imageUrl).toBe(pic);
    expect(JSON.stringify(stageView(state))).not.toContain('correctId');
  });

  it('presents order items in the shuffled order', () => {
    const state = startRound(lobbyWith(makeQuiz([order]), 'Олена'), T0, () => 0.999);
    expect(stageView(state).question?.choices.map((c) => c.id)).toEqual(['l', 'k', 'h', 'u']);
  });

  it('shows a match question as left in author order and right in the presented order', () => {
    const state = startRound(lobbyWith(makeQuiz([match]), 'Олена'), T0, () => 0.999);
    const right = [
      { id: 'y', text: 'Полтва' },
      { id: 'z', text: 'Уж' },
      { id: 'x', text: 'Дніпро' },
    ];
    expect(state.presented).toEqual(['y', 'z', 'x']);
    for (const question of [stageView(state).question, playerView(state, 'p1')?.question]) {
      expect(question?.choices).toEqual([
        { id: 'a', text: 'Київ' },
        { id: 'b', text: 'Львів' },
        { id: 'c', text: 'Ужгород' },
      ]);
      expect(question?.right).toEqual(right);
    }
    expect(stageView(open()).question?.right).toEqual([]);
  });

  it('does not leak the pairs of a match question to the stage or to players', () => {
    const state = startRound(lobbyWith(makeQuiz([match]), 'Олена'), T0);
    expect(JSON.stringify(stageView(state).question)).not.toContain('pairs');
    expect(JSON.stringify(playerView(state, 'p1')?.question)).not.toContain('pairs');
    expect(stageView(state).reveal).toBeNull();
    expect(playerView(state, 'p1')?.reveal).toBeNull();
    const revealed = must(next(must(lock(state)), T0 + 20_000));
    expect(revealed.phase).toBe('reveal');
    expect(stageView(revealed).reveal).toHaveProperty('pairs');
  });

  it('does not leak accepted spellings of a text question', () => {
    const state = startRound(lobbyWith(makeQuiz([text]), 'Олена'), T0);
    expect(JSON.stringify(playerView(state, 'p1'))).not.toContain('Одеса');
    expect(JSON.stringify(stageView(state))).not.toContain('Одеса');
  });
});

describe('after the question is locked', () => {
  it('hides the points of the current question from the player score until reveal', () => {
    expect(playerView(locked(), 'p1')?.me.score).toBe(0);
    expect(playerView(locked(), 'p1')?.me.result).toBeNull();
    expect(JSON.stringify(playerView(locked(), 'p1'))).not.toContain('correctId');
  });

  it('reveals the correct answer, the result and the score', () => {
    const view = playerView(reveal(), 'p1');
    expect(view?.reveal).toMatchObject({ correctId: 'b' });
    expect(view?.me.result).toEqual({ accepted: true, accuracy: 1, grade: 'correct', streakBonus: 0, points: 750 });
    expect(view?.me.score).toBe(750);
    expect(playerView(reveal(), 'p2')?.me.result).toEqual({ accepted: false, accuracy: 0, grade: 'wrong', streakBonus: 0, points: 0 });
  });

  it('gives the stage answer statistics on reveal', () => {
    expect(stageView(reveal()).stats).toEqual({ answered: 2, accepted: 1, counts: { b: 1, a: 1 } });
  });

  it('ignores unknown option ids in statistics', () => {
    const forged = must(submitAnswer(oneAnswered(), 'p2', { type: 'single', optionId: 'zzz' }, T0 + 10_000));
    const stats = stageView(must(next(forged, T0 + 20_000))).stats;
    expect(stats?.counts).toEqual({ b: 1 });
    expect(stats?.answered).toBe(2);
  });

  it('ignores unknown option ids of a multi-choice answer in statistics', () => {
    const open = startRound(lobbyWith(makeQuiz([multi]), 'Олена'), T0);
    const forged = must(submitAnswer(open, 'p1', { type: 'multi', optionIds: ['a', 'zzz'] }, T0 + 1000));
    expect(stageView(must(next(forged, T0 + 2000))).stats?.counts).toEqual({ a: 1 });
  });
});

describe('standings', () => {
  it('are hidden from stage and players on reveal', () => {
    expect(stageView(reveal()).standings).toBeNull();
    expect(playerView(reveal(), 'p1')?.standings).toBeNull();
    expect(playerView(reveal(), 'p1')?.me.rank).toBeNull();
  });

  it('appear on the leaderboard with the player rank', () => {
    const standings = stageView(leaderboard()).standings;
    expect(standings?.map((s) => [s.nickname, s.score, s.rank])).toEqual([
      ['Олена', 750, 1],
      ['Тарас', 0, 2],
    ]);
    expect(playerView(leaderboard(), 'p2')?.me.rank).toBe(2);
  });

  it('are always available to the host', () => {
    expect(hostView(open()).standings).toHaveLength(2);
    expect(hostView(reveal()).players.map((p) => p.score)).toEqual([750, 0]);
  });
});

describe('rounds', () => {
  const rules = { ...DEFAULT_RULES, penalty: 'minus' as const, partial: 0.5 };
  const twoRounds = () =>
    makeRoundsQuiz([
      classicRound('r1', [single, text], { title: 'Розминка' }),
      classicRound('r2', [single, bool], { title: 'Фінал', rules }),
    ]);
  /** Рухає гру далі (закриває відкрите запитання, інакше next), доки не настане потрібний етап. */
  const goTo = (state: GameState, phase: Phase, round: number) => {
    let current = state;
    for (let i = 0; i < 40 && !(current.phase === phase && current.roundIndex === round); i += 1) {
      current = must(current.phase === 'question' ? lock(current) : next(current, T0));
    }
    return current;
  };
  const started = () => must(start(lobbyWith(twoRounds(), 'Олена', 'Тарас')));
  const atIntro2 = () => goTo(started(), 'intro', 1);

  it('every role sees the round description and its rules brief on the intro', () => {
    const quiz = makeRoundsQuiz([
      { ...blitzRound('b1', [single], { attempts: 2 }), description: 'Хто швидший' },
      classicRound('c1', [single]),
    ]);
    const state = must(start(lobbyWith(quiz, 'Анна')));
    for (const view of [stageView(state), hostView(state), playerView(state, state.players[0].id)]) {
      expect(view?.round).toMatchObject({ description: 'Хто швидший', brief: roundBrief(quiz.rounds[0]) });
    }
    const second = goTo(state, 'intro', 1);
    expect(stageView(second).round?.description).toBe('');
  });

  it('the round info carries the time range of timed questions', () => {
    const quiz = makeRoundsQuiz([
      classicRound('r1', [withId(single, 'a'), { ...withId(multi, 'b'), timeLimit: 30 }, withVideo(withId(bool, 'c'))]),
      classicRound('r2', [withVideo(withId(single, 'd'))]),
    ]);
    const state = must(start(lobbyWith(quiz, 'Анна')));
    expect(stageView(state).round?.times).toEqual({ min: 20, max: 30 });
    expect(stageView(goTo(state, 'intro', 1)).round?.times).toBeNull();
  });

  it('has no round in the lobby', () => {
    expect(stageView(lobbyWith(twoRounds(), 'Олена')).round).toBeNull();
  });

  it('shows round info and no previous question in the intro of the second round', () => {
    const state = atIntro2();
    for (const view of [stageView(state), playerView(state, 'p1'), hostView(state)]) {
      expect(view?.round).toEqual({
        index: 1,
        total: 2,
        title: 'Фінал',
        type: 'classic',
        partial: true,
        description: '',
        brief: roundBrief(state.quiz.rounds[1]),
        times: { min: 20, max: 20 },
      });
      expect(view?.question).toBeNull();
      expect(view?.total).toBe(2);
      expect(view?.answeredCount).toBe(0);
    }
    expect(stageView(state).reveal).toBeNull();
    expect(stageView(state).stats).toBeNull();
    expect(hostView(state).correct).toBeNull();
    expect(hostView(state).responses).toEqual([]);
    expect(playerView(state, 'p1')?.me.answer).toBeNull();
    expect(playerView(state, 'p1')?.me.result).toBeNull();
  });

  it('shows no question, reveal or stats when the game ends from the intro of the last round', () => {
    const state = must(endRound(atIntro2(), T0));
    expect(state.phase).toBe('finished');
    for (const view of [stageView(state), playerView(state, 'p1'), hostView(state)]) {
      expect(view?.question).toBeNull();
      expect(view?.answeredCount).toBe(0);
    }
    expect(stageView(state).reveal).toBeNull();
    expect(stageView(state).stats).toBeNull();
    expect(playerView(state, 'p1')?.reveal).toBeNull();
    expect(playerView(state, 'p1')?.me.result).toBeNull();
    expect(hostView(state).correct).toBeNull();
    expect(stageView(state).standings).toHaveLength(2);
  });

  it('keeps the last question at finished when the game ends within its round', () => {
    const state = must(endRound(goTo(started(), 'reveal', 1), T0));
    expect(state.phase).toBe('finished');
    expect(stageView(state).reveal).not.toBeNull();
  });

  it('numbers questions within the round', () => {
    const first = goTo(atIntro2(), 'question', 1);
    expect(stageView(first).questionIndex).toBe(0);
    const second = goTo(must(next(must(lock(first)), T0)), 'question', 1);
    expect(stageView(second).questionIndex).toBe(1);
    expect(stageView(second).total).toBe(2);
    expect(stageView(second).round?.partial).toBe(true);
  });

  it('shows standings on round_end and no question', () => {
    const state = goTo(started(), 'round_end', 0);
    expect(stageView(state).standings).toHaveLength(2);
    expect(playerView(state, 'p1')?.standings).toHaveLength(2);
    expect(stageView(state).question).toBeNull();
    expect(stageView(state).reveal).toBeNull();
    expect(stageView(state).stats).toBeNull();
    expect(stageView(state).total).toBe(2);
    expect(hostView(state).round?.index).toBe(0);
  });

  it('hides penalty and streak bonus of the current question while locked, and exposes grade on reveal', () => {
    const questions = [0, 1, 2].map((i) => ({ ...single, id: `s${i}` }));
    const streakQuiz = makeRoundsQuiz([
      classicRound('r1', questions, { rules: { ...DEFAULT_RULES, penalty: 'minus', streak: { length: 2, bonus: { kind: 'percent', value: 50 } } } }),
    ]);
    let state = startRound(lobbyWith(streakQuiz, 'Олена', 'Тарас'), T0);
    state = must(submitAnswer(state, 'p1', correct, T0));
    state = must(submitAnswer(state, 'p2', wrong, T0));
    state = goTo(state, 'question', 0);
    state = must(submitAnswer(state, 'p1', correct, T0));
    state = must(submitAnswer(state, 'p2', wrong, T0));
    expect(state.phase).toBe('locked');
    const p1 = playerView(state, 'p1');
    expect(p1?.me.score).toBe(1000);
    expect(playerView(state, 'p2')?.me.score).toBe(-1000);
    expect(p1?.me.result).toBeNull();
    expect(stageView(state).players.map((p) => p.streak)).toEqual([1, 0]);
    const revealed = must(next(state, T0));
    expect(playerView(revealed, 'p1')?.me.result).toMatchObject({ grade: 'correct', streakBonus: 500, points: 1500 });
    expect(playerView(revealed, 'p2')?.me.result).toMatchObject({ grade: 'wrong', streakBonus: 0, points: -1000 });
    expect(hostView(revealed).responses[0]).toMatchObject({ grade: 'correct', streakBonus: 500 });
    expect(stageView(revealed).players.map((p) => p.streak)).toEqual([2, 0]);
  });
});

describe('blitz views', () => {
  const blitzGame = (options: Parameters<typeof blitzRound>[2] = {}) =>
    startRound(lobbyWith(makeRoundsQuiz([blitzRound('b1', [single, text], options)]), 'Анна', 'Богдан', 'Віра'), 0);
  const nicknames = (queue: { nickname: string }[] | undefined) => queue?.map((entry) => entry.nickname);

  it('stage and players see the blitz queue but not the winner before the reveal', () => {
    let state = must(buzz(blitzGame({ check: 'manual' }), 'p1', 1000));
    state = must(buzz(state, 'p2', 1500));
    expect(nicknames(stageView(state).blitz?.queue)).toEqual(['Анна', 'Богдан']);
    state = must(judge(must(submitAnswer(state, 'p1', wrong, 2000)), 'p1', false, 2000));
    state = must(judge(must(submitAnswer(state, 'p2', correct, 2500)), 'p2', true, 2500));
    expect(state.phase).toBe('locked');
    expect(stageView(state).blitz?.winner).toBeNull();
    expect(playerView(state, 'p3')?.blitz?.winner).toBeNull();
    expect(hostView(state).blitz?.winner?.playerId).toBe('p2');
    state = must(next(state, 3000));
    expect(state.phase).toBe('reveal');
    expect(stageView(state).blitz?.winner?.nickname).toBe('Богдан');
    expect(playerView(state, 'p3')?.blitz?.winner?.nickname).toBe('Богдан');
  });

  it('a re-buzzed player sees an empty answer, not the previous wrong attempt', () => {
    let state = must(buzz(blitzGame({ attempts: 2, check: 'manual' }), 'p1', 1000));
    state = must(judge(must(submitAnswer(state, 'p1', wrong, 1500)), 'p1', false, 1500));
    state = must(buzz(state, 'p1', 2000));
    const me = playerView(state, 'p1')?.me;
    expect(me?.answer).toBeNull();
    expect(me?.blitz?.position).toBe(1);
  });

  it('the player sees their place, attempts and whether they can buzz', () => {
    let state = must(buzz(blitzGame({ attempts: 2, answerWindow: 15, check: 'manual' }), 'p2', 1000));
    state = must(buzz(state, 'p1', 1500));
    expect(playerView(state, 'p1')?.me.blitz).toEqual({
      position: 2,
      attemptsUsed: 0,
      attemptsLeft: 2,
      canBuzz: false,
      deadline: 16500,
      canAnswer: false,
      grade: null,
    });
    expect(playerView(state, 'p3')?.me.blitz?.canBuzz).toBe(true);
    state = must(judge(must(submitAnswer(state, 'p2', wrong, 2000)), 'p2', false, 2000));
    expect(playerView(state, 'p2')?.me.blitz).toEqual({
      position: null,
      attemptsUsed: 1,
      attemptsLeft: 1,
      canBuzz: true,
      deadline: null,
      canAnswer: false,
      grade: 'wrong',
    });
  });

  it('canBuzz is false when paused or when no attempts are left', () => {
    let state = must(buzz(blitzGame({ attempts: 1, check: 'manual' }), 'p1', 1000));
    state = must(judge(must(submitAnswer(state, 'p1', wrong, 2000)), 'p1', false, 2000));
    expect(playerView(state, 'p1')?.me.blitz).toMatchObject({ attemptsLeft: 0, canBuzz: false });
    const paused = must(pause(blitzGame({ check: 'manual' }), 1000));
    expect(playerView(paused, 'p1')?.me.blitz?.canBuzz).toBe(false);
  });

  it("player and stage views of a blitz question never include other players' answers", () => {
    let state = blitzGame({ check: 'manual' });
    state = must(buzz(state, 'p1', 1000));
    state = must(buzz(state, 'p2', 1100));
    state = must(submitAnswer(state, 'p1', correct, 1200));
    state = must(submitAnswer(state, 'p2', wrong, 1300));
    // Усім видно лише відповідь голови черги (spotlight); відповідь p2 в черзі нікому, крім нього.
    expect(JSON.stringify(stageView(state))).not.toContain('"optionId":"a"');
    expect(JSON.stringify(playerView(state, 'p3'))).not.toContain('"optionId":"a"');
    expect(playerView(state, 'p2')?.me.answer).toEqual(wrong);
  });

  it('the host sees queued answers and checked attempts', () => {
    let state = blitzGame({ check: 'manual' });
    state = must(buzz(state, 'p1', 1000));
    state = must(submitAnswer(state, 'p1', wrong, 1200));
    const queued = hostView(state).blitz;
    expect(queued?.manual).toBe(true);
    expect(queued?.queue[0]).toMatchObject({ playerId: 'p1', answer: wrong });
    state = must(judge(state, 'p1', false, 1500));
    const checked = hostView(state).blitz;
    expect(checked?.queue).toEqual([]);
    expect(checked?.attempts[0]).toMatchObject({ playerId: 'p1', grade: 'wrong', points: 0 });
  });

  it('stage and other players see names, times and verdicts in the instant queue but no picks before the reveal', () => {
    let state = must(submitAnswer(blitzGame(), 'p1', wrong, 2400));
    state = must(submitAnswer(state, 'p2', correct, 3100));
    state = must(acceptAnswer(state, 'p1', 4000));
    for (const view of [stageView(state), playerView(state, 'p3')!]) {
      expect(view.blitz).toMatchObject({ instant: true, winner: null });
      expect(view.blitz?.rows).toEqual([
        { playerId: 'p1', nickname: 'Анна', timeMs: 2400, grade: 'wrong', answer: null },
        { playerId: 'p2', nickname: 'Богдан', timeMs: 3100, grade: null, answer: null },
      ]);
      expect(view.spotlight).toBeNull();
      expect(JSON.stringify(view)).not.toContain('"optionId"');
    }
    const closed = must(acceptAnswer(state, 'p2', 5000));
    expect(closed.phase).toBe('locked');
    expect(stageView(closed).blitz?.winner?.nickname).toBe('Богдан');
    expect(playerView(closed, 'p3')?.blitz?.winner?.nickname).toBe('Богдан');
    expect(JSON.stringify(stageView(closed))).not.toContain('"optionId"');
    expect(JSON.stringify(playerView(closed, 'p3'))).not.toContain('"optionId"');
    const revealed = must(next(closed, 6000));
    expect(stageView(revealed).blitz?.rows.map((r) => r.answer)).toEqual([wrong, correct]);
  });

  it('the answerer sees their own pick and verdict, and can answer only once', () => {
    let state = blitzGame();
    expect(playerView(state, 'p1')?.me.blitz).toMatchObject({ canAnswer: true, canBuzz: false, position: null, grade: null });
    state = must(submitAnswer(state, 'p1', wrong, 1000));
    expect(playerView(state, 'p1')?.me).toMatchObject({ answer: wrong, blitz: { canAnswer: false, position: 1, grade: null } });
    state = must(acceptAnswer(state, 'p1', 2000));
    expect(playerView(state, 'p1')?.me).toMatchObject({ answer: wrong, blitz: { canAnswer: false, position: null, grade: 'wrong' } });
  });

  it('a pause keeps the answer input (the server refuses while paused)', () => {
    const paused = must(pause(blitzGame(), 500));
    expect(playerView(paused, 'p1')).toMatchObject({ paused: true, me: { blitz: { canAnswer: true } } });
    expect(submitAnswer(paused, 'p1', wrong, 600)).toMatchObject({ ok: false });
  });

  it('after repick the head can answer again', () => {
    const state = must(repick(must(submitAnswer(blitzGame(), 'p1', wrong, 1000)), 'p1', 2000));
    expect(playerView(state, 'p1')?.me).toMatchObject({ answer: null, blitz: { canAnswer: true, position: 1, deadline: 17_000 } });
  });

  it('an unchecked answer stays visible to its author after the question closes', () => {
    const state = must(lock(must(submitAnswer(blitzGame(), 'p1', correct, 1000))));
    expect(playerView(state, 'p1')?.me.answer).toEqual(correct);
    expect(stageView(state).blitz?.rows).toEqual([{ playerId: 'p1', nickname: 'Анна', timeMs: 1000, grade: null, answer: null }]);
  });

  it('the host sees every pick and the head as the pending spotlight', () => {
    let state = must(submitAnswer(blitzGame(), 'p1', wrong, 1000));
    state = must(submitAnswer(state, 'p2', correct, 2000));
    const host = hostView(state);
    expect(host.blitz?.rows.map((r) => r.answer)).toEqual([wrong, correct]);
    expect(host.spotlight).toMatchObject({ playerId: 'p1', answer: wrong, grade: null });
    expect(hostView(must(lock(state))).spotlight).toBeNull();
  });

  it('the button blitz keeps its old view', () => {
    const state = must(buzz(blitzGame({ check: 'manual' }), 'p1', 1000));
    expect(stageView(state).blitz).toMatchObject({ instant: false, rows: [] });
    expect(playerView(state, 'p2')?.me.blitz?.canAnswer).toBe(false);
  });

  it('classic views carry no blitz data', () => {
    const state = open();
    expect(stageView(state).blitz).toBeNull();
    expect(playerView(state, 'p1')?.me.blitz).toBeNull();
    expect(hostView(state).blitz).toBeNull();
  });
});

describe('board views', () => {
  const q = (id: string, points: number) => withPoints(withId(single, id), points);
  const field = (options = {}) =>
    boardRound(
      'g1',
      [
        { title: 'Міста', cells: [q('c11', 100), { mark: 'x2', question: q('c12', 200) }] },
        { title: 'Річки', cells: [q('c21', 100), q('c22', 200), { mark: 'x3', question: q('c23', 300) }] },
      ],
      options,
    );
  const onBoard = (options = {}): GameState => {
    const intro = must(start(lobbyWith(makeRoundsQuiz([field(options)]), 'Анна', 'Богдан', 'Віра')));
    return must(next(intro, 0));
  };
  const picked = (cell: string, options = {}) => must(pickCell(onBoard(options), null, cell, 0, Math.random));

  it("every role sees each cell's mark, kind, answer mode and penalty but never its question", () => {
    const state = onBoard();
    for (const view of [stageView(state), playerView(state, 'p2')!, hostView(state)]) {
      const cells = view.board!.categories.flatMap((c) => c.cells);
      expect(view.board?.categories[0].cells[1].mark).toBe('x2');
      expect(view.board?.categories[1].cells[2].mark).toBe('x3');
      for (const cell of cells) expect(Object.keys(cell).sort()).toEqual(['answerMode', 'id', 'kind', 'mark', 'penalty', 'played', 'price']);
    }
    for (const json of [JSON.stringify(stageView(state)), JSON.stringify(playerView(state, 'p2'))]) {
      expect(json).not.toContain(single.text);
      expect(json).not.toContain('correctId');
      expect(json).not.toContain('"type":"single"');
    }
  });

  it('a chosen cell shows its mark to everyone and stays shown', () => {
    const state = picked('c12');
    expect(stageView(state).board?.cell).toMatchObject({ id: 'c12', mark: 'x2', price: 200 });
    expect(playerView(state, 'p2')?.board?.cell).toMatchObject({ mark: 'x2', price: 200 });
    const revealed = must(next(must(lock(state)), 0));
    expect(stageView(revealed).board?.categories[0].cells[1]).toMatchObject({ mark: 'x2', played: true });
    const done = must(next(must(next(revealed, 0)), 0));
    expect(done.phase).toBe('board');
    const view = stageView(done).board;
    expect(view?.cell).toBeNull();
    expect(view?.categories[0].cells[1]).toMatchObject({ id: 'c12', mark: 'x2', played: true });
    expect(view?.categories[0].cells[0]).toMatchObject({ mark: 'none', played: false });
  });

  it('the board view shows the order, whose turn it is and categories of different length', () => {
    const view = stageView(onBoard()).board;
    expect(view?.order.map((p) => p.nickname)).toEqual(['Анна', 'Богдан', 'Віра']);
    expect(view?.turn?.nickname).toBe('Анна');
    expect(view?.categories.map((c) => c.cells.length)).toEqual([2, 3]);
    expect(view?.categories.map((c) => c.cells.map((cell) => cell.price))).toEqual([[100, 200], [100, 200, 300]]);
    expect(stageView(onBoard()).question).toBeNull();
    expect(stageView(picked('c11')).board?.turn?.nickname).toBe('Анна');
  });

  it('the turn is null when the chooser was kicked during the question', () => {
    const kicked = must(removePlayer(picked('c11'), 'p1'));
    expect(stageView(kicked).board?.turn).toBeNull();
    expect(playerView(kicked, 'p2')?.board?.turn).toBeNull();
  });

  it('players see every cell kind, answer mode and penalty from the start', () => {
    const cells = [{ question: q('c11', 100), kind: 'blitz' as const, penalty: 'all' as const, answerMode: 'voice' as const }, q('c12', 200), q('c13', 300)];
    const round = boardRound('g1', [{ title: 'A', cells }], { answerMode: 'phone' });
    const intro = must(start(lobbyWith(makeRoundsQuiz([round]), 'Анна', 'Богдан', 'Віра')));
    const state = must(next(intro, 0));
    for (const view of [stageView(state), playerView(state, 'p2')!, hostView(state)]) {
      expect(view.board?.categories[0].cells[0]).toMatchObject({ kind: 'blitz', answerMode: 'voice', penalty: 'all' });
      // Власного способу немає, тож береться спосіб раунду.
      expect(view.board?.categories[0].cells[1]).toMatchObject({ kind: 'normal', answerMode: 'phone', penalty: 'none' });
    }
    const open = must(pickCell(state, null, 'c11', 0, Math.random));
    expect(stageView(open).board?.cell).toMatchObject({ kind: 'blitz', answerMode: 'voice', penalty: 'all' });
    expect(playerView(open, 'p2')?.board?.categories[0].cells[0].kind).toBe('blitz');
  });

  it('the view carries the full time limit with ±15 s and whether the clock is held', () => {
    const state = picked('c11', { check: 'manual' });
    expect(stageView(state)).toMatchObject({ limitMs: 20_000, held: false });
    expect(stageView(must(adjustTime(state, 15, 1000))).limitMs).toBe(35_000);
    const pending = must(submitAnswer(state, 'p1', { type: 'single', optionId: 'b' }, 0));
    expect(stageView(pending)).toMatchObject({ held: true });
    expect(playerView(pending, 'p2')?.held).toBe(true);
    expect(stageView(must(lock(state))).limitMs).toBeNull();
    expect(stageView(onBoard()).limitMs).toBeNull();
  });

  it('the host grades by hand on a voice cell even in a phone round', () => {
    const round = boardRound('g1', [{ title: 'A', cells: [{ question: q('c11', 100), answerMode: 'voice' }, q('c12', 200)] }], { answerMode: 'phone', check: 'auto' });
    const state = must(next(must(start(lobbyWith(makeRoundsQuiz([round]), 'Анна', 'Богдан', 'Віра'))), 0));
    expect(hostView(must(pickCell(state, null, 'c11', 0, Math.random))).board?.manual).toBe(true);
    expect(hostView(must(pickCell(state, null, 'c12', 0, Math.random))).board?.manual).toBe(false);
  });

  it('the host sees a phone answer waiting for a grade', () => {
    const state = must(submitAnswer(picked('c11', { check: 'manual' }), 'p1', { type: 'single', optionId: 'b' }, 0));
    const host = hostView(state).board;
    expect(host?.manual).toBe(true);
    expect(host?.answer).toEqual({ type: 'single', optionId: 'b' });
    expect(playerView(state, 'p1')?.me.answer).toEqual({ type: 'single', optionId: 'b' });
    expect(hostView(picked('c11')).board).toMatchObject({ manual: false, answer: null });
    expect(hostView(picked('c11', { answerMode: 'voice' })).board?.manual).toBe(true);
  });

  it('the host names the option a voice player said: orange for everyone, the verdict only on reveal', () => {
    const named = must(nameAnswer(picked('c11', { answerMode: 'voice' }), { type: 'single', optionId: 'a' }));
    const pending = { playerId: 'p1', nickname: 'Анна', answer: { type: 'single', optionId: 'a' }, grade: null };
    expect(stageView(named).spotlight).toEqual(pending);
    expect(playerView(named, 'p2')?.spotlight).toEqual(pending);
    expect(hostView(named).spotlight).toEqual(pending);
    const judged = must(override(named, 'p1', 'wrong', 1000));
    expect(judged.phase).toBe('locked');
    expect(stageView(judged).spotlight?.grade).toBeNull();
    expect(stageView(judged).spotlight?.answer).toEqual(pending.answer);
    const revealed = must(next(judged, 2000));
    expect(stageView(revealed).spotlight).toEqual({ ...pending, grade: 'wrong' });
  });

  it('a voice cell judged without a mark shows the verdict alone on reveal', () => {
    const revealed = must(next(must(override(picked('c11', { answerMode: 'voice' }), 'p1', 'correct', 1000)), 2000));
    expect(stageView(revealed).spotlight).toEqual({ playerId: 'p1', nickname: 'Анна', answer: null, grade: 'correct' });
  });

  it('the absent chooser has a skip time that a pause removes', () => {
    const state = must(setConnected(onBoard(), 'p1', false, 1000));
    expect(stageView(state).board?.skipAt).toBe(31_000);
    expect(stageView(must(pause(state, 2000))).board?.skipAt).toBeNull();
    expect(stageView(onBoard()).board?.skipAt).toBeNull();
  });

  /** rng, що дає задані грані кубика по черзі. */
  const faces = (...values: number[]) => {
    const queue = values.map((v) => (v - 1) / 6 + 0.01);
    return () => queue.shift() ?? 0;
  };
  const roll = (state: GameState, id: string, face: number) => must(rollDie(state, id, faces(face)));
  const boardIntro = () => must(start(lobbyWith(makeRoundsQuiz([field()]), 'Анна', 'Богдан', 'Віра')));
  /** Анна 5, Богдан 5, Віра 2: Анна й Богдан перекидають. */
  const tied = () => roll(roll(roll(must(startDice(boardIntro())), 'p1', 5), 'p2', 5), 'p3', 2);

  it('everyone sees the dice rows in join order with every throw and who still rolls', () => {
    const state = tied();
    for (const view of [stageView(state), playerView(state, 'p3')!, hostView(state)]) {
      expect(view.board?.dice).toEqual({
        rows: [
          { playerId: 'p1', nickname: 'Анна', throws: [5], waiting: true },
          { playerId: 'p2', nickname: 'Богдан', throws: [5], waiting: true },
          { playerId: 'p3', nickname: 'Віра', throws: [2], waiting: false },
        ],
        tieBreak: true,
        done: false,
      });
      expect(view.board?.schedule).toEqual([]);
    }
  });

  it('once the order is set the board view carries the circles with nicknames', () => {
    const state = roll(roll(tied(), 'p2', 6), 'p1', 1);
    const named = (id: string, nickname: string) => ({ playerId: id, nickname });
    const { circles, repeats } = turnSchedule(state);
    for (const view of [stageView(state), playerView(state, 'p1')!, hostView(state)]) {
      expect(view.board?.dice).toMatchObject({ tieBreak: false, done: true });
      expect(view.board?.dice?.rows.map((r) => r.throws)).toEqual([[5, 1], [5, 6], [2]]);
      expect(view.board?.schedule[0]).toEqual({
        number: 1,
        order: [named('p2', 'Богдан'), named('p1', 'Анна'), named('p3', 'Віра')],
        done: 0,
      });
      expect(view.board?.schedule).toHaveLength(circles.length);
      expect(view.board?.scheduleRepeats).toBe(repeats);
    }
  });

  it('without dice the board view has dice null and a schedule from the join order', () => {
    const view = stageView(boardIntro()).board;
    expect(view?.dice).toBeNull();
    expect(view?.schedule[0].order.map((p) => p.nickname)).toEqual(['Анна', 'Богдан', 'Віра']);
    expect(view?.schedule[0].done).toBe(0);
  });

  it('classic and blitz views carry no board data', () => {
    expect(stageView(open()).board).toBeNull();
    expect(playerView(open(), 'p1')?.board).toBeNull();
    expect(hostView(open()).board).toBeNull();
    const blitz = startRound(lobbyWith(makeRoundsQuiz([blitzRound('b1', [single])]), 'Анна'), 0);
    expect(stageView(blitz).board).toBeNull();
  });
});

describe('spotlight views', () => {
  const field = (options = {}, question: Question = single) =>
    boardRound('g1', [{ title: 'Міста', cells: [withId(question, 'c11')] }], options);
  const picked = (options = {}, question: Question = single) => {
    const intro = must(start(lobbyWith(makeRoundsQuiz([field(options, question)]), 'Анна', 'Богдан', 'Віра')));
    return must(pickCell(must(next(intro, 0)), null, 'c11', 0, Math.random));
  };
  const answered = (options = {}, answer: Answer = wrong, question: Question = single) =>
    must(submitAnswer(picked(options, question), 'p1', answer, 5000));
  const blitzGame = (options: Parameters<typeof blitzRound>[2] = {}) =>
    startRound(lobbyWith(makeRoundsQuiz([blitzRound('b1', [single, text], options)]), 'Анна', 'Богдан', 'Віра'), 0);

  it('everyone sees the pending board answer in orange and the stopped timer', () => {
    const state = answered();
    const views = [stageView(state), playerView(state, 'p2'), hostView(state)];
    for (const view of views) {
      expect(view?.spotlight).toEqual({ playerId: 'p1', nickname: 'Анна', answer: wrong, grade: null });
      expect(view?.endsAt).toBeNull();
      expect(view?.remainingMs).toBe(15_000);
    }
  });

  it('the pending match answer shows the player links and no pairs', () => {
    const links = [
      { left: 'a', right: 'x' },
      { left: 'b', right: 'z' },
      { left: 'c', right: 'y' },
    ];
    const state = answered({}, { type: 'match', links }, match);
    expect(stageView(state).spotlight).toMatchObject({ answer: { type: 'match', links }, grade: null });
    expect(JSON.stringify(stageView(state))).not.toContain('"pairs"');
    expect(JSON.stringify(playerView(state, 'p2'))).not.toContain('"pairs"');
  });

  it('a hold under a host pause still shows the frozen remainder', () => {
    const state = must(pause(answered(), 9000));
    expect(stageView(state).remainingMs).toBe(15_000);
    expect(stageView(state).endsAt).toBeNull();
    expect(stageView(state).spotlight?.grade).toBeNull();
  });

  it('after accept everyone sees the verdict and the correct answer at the reveal', () => {
    const state = must(acceptAnswer(answered(), 'p1', 6000));
    expect(state.phase).toBe('reveal');
    expect(stageView(state).spotlight).toEqual({ playerId: 'p1', nickname: 'Анна', answer: wrong, grade: 'wrong' });
    expect(playerView(state, 'p2')?.spotlight?.grade).toBe('wrong');
    expect(stageView(state).reveal).toMatchObject({ correctId: 'b' });
  });

  it('a locked phone answer stays orange with no verdict', () => {
    const state = must(lock(answered({ check: 'manual' })));
    expect(state.phase).toBe('locked');
    expect(stageView(state).spotlight).toMatchObject({ playerId: 'p1', grade: null });
    expect(stageView(must(lock(picked()))).spotlight).toBeNull();
  });

  it('a locked spotlight is empty once the pending chooser was kicked', () => {
    const state = must(lock(must(removePlayer(answered({ check: 'manual' }), 'p1'))));
    expect(state.phase).toBe('locked');
    expect(stageView(state).spotlight).toBeNull();
  });

  it('stage and player views never carry the correct answer before the reveal', () => {
    const typed: Answer = { type: 'text', value: 'Одеса' };
    const state = answered({}, typed, text);
    for (const json of [JSON.stringify(stageView(state)), JSON.stringify(playerView(state, 'p2'))]) {
      expect(json).not.toContain('accepted');
      expect(json).not.toContain('"correct"');
      expect(json).toContain('Одеса');
    }
    let blitz = must(buzz(blitzGame({ attempts: 2, check: 'manual' }), 'p1', 1000));
    blitz = must(judge(must(submitAnswer(blitz, 'p1', wrong, 2000)), 'p1', false, 2000));
    for (const view of [stageView(blitz), playerView(blitz, 'p2')]) {
      expect(view?.spotlight?.grade).toBe('wrong');
      expect(view?.reveal).toBeNull();
      expect(JSON.stringify(view)).not.toContain('correctId');
    }
  });

  it('the button blitz spotlight shows the pending head, then the last attempt', () => {
    let state = must(buzz(blitzGame({ attempts: 2, check: 'manual' }), 'p1', 1000));
    state = must(submitAnswer(state, 'p1', wrong, 2000));
    expect(stageView(state).spotlight).toEqual({ playerId: 'p1', nickname: 'Анна', answer: wrong, grade: null });
    state = must(judge(state, 'p1', false, 3000));
    expect(stageView(state).spotlight).toEqual({ playerId: 'p1', nickname: 'Анна', answer: wrong, grade: 'wrong' });
    state = must(buzz(state, 'p2', 4000));
    state = must(submitAnswer(state, 'p2', correct, 4500));
    expect(playerView(state, 'p3')?.spotlight).toEqual({ playerId: 'p2', nickname: 'Богдан', answer: correct, grade: null });
    expect(stageView(blitzGame()).spotlight).toBeNull();
  });

  it('the blitz window is hidden from the player while an answer is pending', () => {
    let state = must(buzz(blitzGame({ answerWindow: 15, attempts: 2, check: 'manual' }), 'p1', 1000));
    state = must(buzz(state, 'p2', 1500));
    expect(playerView(state, 'p2')?.me.blitz?.deadline).toBe(16_500);
    state = must(submitAnswer(state, 'p1', wrong, 2000));
    expect(playerView(state, 'p2')?.me.blitz?.deadline).toBeNull();
    expect(playerView(state, 'p3')?.me.blitz?.canBuzz).toBe(true);
    expect(stageView(state).endsAt).toBeNull();
  });

  it('voice board, classic and lobby views have no spotlight', () => {
    expect(stageView(picked({ answerMode: 'voice' })).spotlight).toBeNull();
    expect(hostView(picked({ answerMode: 'voice' })).spotlight).toBeNull();
    expect(stageView(open()).spotlight).toBeNull();
    expect(playerView(reveal(), 'p1')?.spotlight).toBeNull();
    expect(hostView(lobby()).spotlight).toBeNull();
  });
});

describe('blitz cell views', () => {
  const field = (cell = {}, options = {}) =>
    boardRound('g1', [{ title: 'Міста', cells: [{ kind: 'blitz', question: withId(single, 'c11'), ...cell }, withId(text, 'c12')] }], options);
  const picked = (cell = {}, options = {}) => {
    const intro = must(start(lobbyWith(makeRoundsQuiz([field(cell, options)]), 'Анна', 'Богдан', 'Віра')));
    return must(pickCell(must(next(intro, 0)), null, 'c11', 0, Math.random));
  };

  it('a button blitz cell shows the queue, own buzz state and the pending answer to everyone, never the correct answer', () => {
    const state = must(submitAnswer(must(buzz(picked({}, { check: 'manual' }), 'p2', 1000)), 'p2', wrong, 2000));
    const stage = stageView(state);
    const player = playerView(state, 'p3');
    expect(player?.me.blitz).toMatchObject({ canBuzz: true, attemptsLeft: null, position: null });
    expect(stage.blitz?.queue[0].nickname).toBe('Богдан');
    expect(stage.spotlight).toEqual({ playerId: 'p2', nickname: 'Богдан', answer: wrong, grade: null });
    expect(hostView(state).blitz).toMatchObject({ voice: false, manual: true });
    for (const json of [JSON.stringify(stage), JSON.stringify(player)]) expect(json).not.toContain('correctId');
  });

  it('a voice blitz cell marks the queue for the host to judge and shows no spotlight', () => {
    const state = must(buzz(picked({ answerMode: 'voice' }), 'p2', 1000));
    expect(hostView(state).blitz).toMatchObject({ voice: true, manual: true });
    expect(stageView(state).spotlight).toBeNull();
    const judged = must(judge(state, 'p2', false, 2000));
    expect(stageView(judged).spotlight).toBeNull();
    expect(hostView(judged).blitz?.attempts).toMatchObject([{ playerId: 'p2', grade: 'wrong' }]);
  });
});

describe('video views', () => {
  const openWith = (question: Question) =>
    startRound(lobbyWith(makeRoundsQuiz([classicRound('r1', [question])]), 'Анна', 'Богдан'), 0);

  it('players see the video and no timer on a video question, never the correct answer', () => {
    const state = openWith(withVideo(single, { id: 'dQw4w9WgXcQ', start: 90 }));
    const stage = stageView(state);
    expect(stage.question).toMatchObject({ video: { id: 'dQw4w9WgXcQ', start: 90 }, timeLimit: null });
    expect(stage.endsAt).toBeNull();
    expect(stage.remainingMs).toBeNull();
    expect(playerView(state, 'p1')?.question?.video).toEqual({ id: 'dQw4w9WgXcQ', start: 90 });
    expect(JSON.stringify(stage)).not.toContain('correctId');
  });

  it('an untimed video question has no full time in the question phase', () => {
    const state = openWith(withVideo(single, { id: 'dQw4w9WgXcQ', start: 90 }));
    expect(state.phase).toBe('question');
    expect(stageView(state).limitMs).toBeNull();
    expect(playerView(state, 'p1')?.limitMs).toBeNull();
    expect(hostView(state).limitMs).toBeNull();
  });

  it('the host sees when an absent answerer will close an untimed cell', () => {
    const cells = [withVideo(withPoints(withId(single, 'c11'), 100)), withPoints(withId(single, 'c12'), 200)];
    const intro = must(start(lobbyWith(makeRoundsQuiz([boardRound('g1', [{ title: 'A', cells }])]), 'Анна', 'Богдан', 'Віра')));
    const state = must(setConnected(must(pickCell(must(next(intro, 0)), null, 'c11', 0, Math.random)), 'p1', false, 1000));
    expect(hostView(state).phase).toBe('question');
    expect(hostView(state).board?.skipAt).toBe(31_000);
  });

  it('a question without a video keeps its time limit and video null', () => {
    const stage = stageView(openWith(single));
    expect(stage.question).toMatchObject({ timeLimit: 20, video: null });
    expect(stage.endsAt).toBe(20_000);
  });
});

describe('final round views', () => {
  const rng = () => 0;
  const q2 = withId(withPoints(single, 400), 'q2');
  const f1 = withId(single, 'f1');

  // Класичний раунд: p1 1000, p2 400, p3 -400 до фіналу; далі етап ставок фіналу «Космос».
  function toWagers(check: 'auto' | 'manual' = 'auto'): GameState {
    const quizFinal = makeRoundsQuiz(
      [
        classicRound('r1', [single, q2], { speedBonus: false, rules: { ...DEFAULT_RULES, penalty: 'minus' } }),
        finalRound('f', f1, { title: 'Космос', check }),
      ],
      { leaderboard: 'end' },
    );
    let s = must(start(lobbyWith(quizFinal, 'Анна', 'Богдан', 'Віра')));
    s = must(next(s, 0, rng));
    s = must(submitAnswer(s, 'p1', correct, 1000));
    s = must(next(must(lock(s)), 2000, rng));
    s = must(next(s, 3000, rng));
    s = must(submitAnswer(s, 'p2', correct, 4000));
    s = must(submitAnswer(s, 'p3', wrong, 4000));
    s = must(next(must(lock(s)), 5000, rng));
    s = must(next(s, 6000, rng));
    s = must(next(s, 7000, rng));
    return must(next(s, 8000, rng));
  }

  // Ставки 500 / 400 / 0; p1 правильно, p2 неправильно, p3 мовчить.
  function toAnswered(check: 'auto' | 'manual' = 'auto'): GameState {
    let s = toWagers(check);
    s = must(placeWager(s, 'p1', 500, 9000, rng));
    s = must(placeWager(s, 'p2', 400, 9500, rng));
    s = must(placeWager(s, 'p3', 0, 10_000, rng));
    s = must(submitAnswer(s, 'p1', correct, 11_000));
    return must(submitAnswer(s, 'p2', wrong, 12_000));
  }

  const toReveal = () => must(next(must(lock(toAnswered())), 13_000, rng));

  it('wagers stay secret: the stage and other players only see how many have placed', () => {
    const s = must(placeWager(toWagers(), 'p1', 777, 9000, rng));
    expect(JSON.stringify(stageView(s))).not.toContain('777');
    expect(JSON.stringify(playerView(s, 'p2'))).not.toContain('777');
    expect(stageView(s).final).toEqual({ theme: 'Космос', placed: 1, total: 3, shown: [], left: 0 });
    expect(playerView(s, 'p1')?.me.final).toEqual({ wager: 777, limit: 1000 });
    expect(playerView(s, 'p3')?.me.final).toEqual({ wager: null, limit: 0 });
  });

  it('the reveal shows players one by one without spoilers', () => {
    const entered = toReveal();
    expect(entered.phase).toBe('reveal');
    expect(entered.final?.shown).toBe(0);
    expect(stageView(entered).final).toMatchObject({ shown: [], left: 3 });
    expect(JSON.stringify(stageView(entered))).not.toContain('500');
    expect(playerView(entered, 'p1')?.me.score).toBe(1000);
    expect(playerView(entered, 'p1')?.me.result).toBeNull();
    const s = must(next(entered, 13_500, rng));
    expect(s.final?.shown).toBe(1);
    const stage = stageView(s);
    expect(stage.final?.shown).toEqual([
      { playerId: 'p3', nickname: 'Віра', answer: null, grade: 'wrong', wager: 0, before: -400, after: -400 },
    ]);
    expect(stage.final?.left).toBe(2);
    expect(stage.stats).toBeNull();
    expect(stage.reveal).not.toBeNull();
    const json = JSON.stringify(stage);
    expect(json).not.toContain('500');
    expect(json).not.toContain('"wager":400');
    expect(playerView(s, 'p2')?.me.result).toBeNull();
    expect(playerView(s, 'p2')?.me.score).toBe(400);
    expect(playerView(s, 'p1')?.me.score).toBe(1000);
    expect(playerView(s, 'p3')?.me.result).not.toBeNull();
    const second = must(next(s, 14_000, rng));
    expect(second.final?.shown).toBe(2);
    expect(playerView(second, 'p2')?.me.result).not.toBeNull();
    expect(playerView(second, 'p2')?.me.score).toBe(0);
    expect(playerView(second, 'p1')?.me.result).toBeNull();
    expect(playerView(second, 'p1')?.me.score).toBe(1000);
    expect(stageView(second).final?.shown.map((e) => e.playerId)).toEqual(['p3', 'p2']);
  });

  it('the host sees every wager, every entry and pending manual answers', () => {
    let s = must(placeWager(toWagers('manual'), 'p1', 500, 9000, rng));
    let host = hostView(s).final;
    expect(host?.manual).toBe(true);
    expect(host?.wagers).toEqual([
      { playerId: 'p1', nickname: 'Анна', wager: 500, limit: 1000 },
      { playerId: 'p2', nickname: 'Богдан', wager: null, limit: 400 },
      { playerId: 'p3', nickname: 'Віра', wager: null, limit: 0 },
    ]);
    s = must(placeWager(s, 'p2', 400, 9500, rng));
    s = must(placeWager(s, 'p3', 0, 10_000, rng));
    s = must(submitAnswer(s, 'p1', correct, 11_000));
    s = must(submitAnswer(s, 'p2', wrong, 12_000));
    host = hostView(s).final;
    expect(host?.pending.map((p) => p.playerId)).toEqual(['p1', 'p2']);
    s = must(override(must(lock(s)), 'p1', 'correct'));
    host = hostView(s).final;
    expect(host?.pending.map((p) => p.playerId)).toEqual(['p2']);
    expect(host?.entries.map((e) => [e.playerId, e.wager])).toEqual([
      ['p1', 500],
      ['p2', 400],
    ]);
    const shown = hostView(must(next(toReveal(), 13_500, rng))).final;
    expect(shown?.entries.map((e) => e.playerId)).toEqual(['p3', 'p2', 'p1']);
    expect(shown?.entries.find((e) => e.playerId === 'p1')).toMatchObject({ wager: 500, before: 1000, after: 1500, grade: 'correct' });
    expect(shown?.shown).toHaveLength(1);
  });

  it('the final has no spotlight and no partial button', () => {
    for (const s of [toWagers(), toAnswered(), toReveal()]) {
      expect(stageView(s).spotlight).toBeNull();
      expect(playerView(s, 'p1')?.spotlight).toBeNull();
      expect(hostView(s).round?.partial).toBe(false);
    }
  });

  it('other rounds carry no final data', () => {
    const s = oneAnswered();
    expect(stageView(s).final).toBeNull();
    expect(hostView(s).final).toBeNull();
    expect(playerView(s, 'p1')?.final).toBeNull();
    expect(playerView(s, 'p1')?.me.final).toBeNull();
    expect(stageView(lobby()).final).toBeNull();
  });

  it('a final ended during wagers does not hide scores', () => {
    const s = must(endRound(toWagers(), 9000));
    expect(stageView(s).final).toBeNull();
    expect(playerView(s, 'p1')?.me.score).toBe(1000);
  });
});

describe('chain views', () => {
  const chainOpen = () => startRound(lobbyWith(makeQuiz([chain]), 'Олена', 'Тарас', 'Віра'), 0);
  const solveAll = (s: GameState, id: string, now: number) =>
    ['Риба', 'Океан', 'Корабель'].reduce((cur, word) => must(guessWord(cur, id, word, now)), s);
  const final = () => {
    let s = must(next(must(start(lobbyWith(makeRoundsQuiz([finalRound('f', chain)]), 'Олена', 'Тарас', 'Віра'))), 0));
    while (s.phase !== 'wager') s = must(next(s, 0));
    for (const id of ['p1', 'p2', 'p3']) s = must(placeWager(s, id, 0, 0, () => 0));
    return s;
  };

  it('shows the first word and only first letters of the chain to everyone', () => {
    const s = chainOpen();
    const masks = [['Р', null, null, null], ['О', null, null, null, null], ['К', null, null, null, null, null, null, null]];
    expect(stageView(s).question?.chain).toEqual({ first: 'Форель', masks, hintSeconds: 5 });
    expect(playerView(s, 'p1')?.me.chain).toEqual({
      solved: 0,
      masks,
      hints: 0,
      hintMs: 5000,
      canHint: true,
      deadline: 20_000,
      remainingMs: null,
      limitMs: 20_000,
      timeMs: null,
    });
    expect(stageView(s).question).toMatchObject({ choices: [], right: [] });
  });

  it("never sends hidden words or another player's hint letters", () => {
    let s = chainOpen();
    s = must(takeHint(s, 'p2', 1000));
    s = must(takeHint(s, 'p2', 1000));
    s = must(guessWord(s, 'p1', 'Риба', 1000));
    s = must(takeHint(s, 'p1', 1000));
    expect(playerView(s, 'p2')?.me.chain?.masks[0]).toEqual(['Р', 'и', 'б', null]);
    expect(playerView(s, 'p1')?.me.chain?.masks[0]).toEqual(['Р', 'и', 'б', 'а']);
    expect(playerView(s, 'p1')?.me.chain?.masks[1]).toEqual(['О', 'к', null, null, null]);
    expect(playerView(s, 'p2')?.me.chain?.masks[1]).toEqual(['О', null, null, null, null]);
    const p2 = JSON.stringify(playerView(s, 'p2')).toLowerCase();
    expect(p2).not.toContain('океан');
    expect(p2).not.toContain('корабель');
    for (const json of [JSON.stringify(stageView(s)), JSON.stringify(playerView(s, 'p3'))]) {
      for (const word of ['риба', 'океан', 'корабель']) expect(json.toLowerCase()).not.toContain(word);
    }
    s = must(lock(s));
    expect(JSON.stringify(stageView(s)).toLowerCase()).not.toContain('океан');
    s = must(next(s, 5000));
    expect(stageView(s).reveal).toMatchObject({ words: chain.words });
  });

  it('shows chain progress to the stage and the host without letters, ranked by time', () => {
    let s = solveAll(chainOpen(), 'p1', 5000);
    s = must(takeHint(s, 'p2', 6000));
    s = must(guessWord(s, 'p2', 'Риба', 6000));
    const rows = [
      { playerId: 'p1', nickname: 'Олена', solved: 3, hints: 0, timeMs: 5000, points: null },
      { playerId: 'p2', nickname: 'Тарас', solved: 1, hints: 1, timeMs: null, points: null },
      { playerId: 'p3', nickname: 'Віра', solved: 0, hints: 0, timeMs: null, points: null },
    ];
    expect(stageView(s).chain).toEqual({ total: 3, rows });
    expect(hostView(s).chain).toEqual({ total: 3, rows });
    expect(playerView(s, 'p3')?.chain).toEqual({ total: 3, rows });
    s = must(next(must(lock(s)), 30_000));
    expect(stageView(s).chain?.rows[0]).toMatchObject({ playerId: 'p1', points: 1000 });
    expect(stageView(s).chain?.rows[1]).toMatchObject({ playerId: 'p2', solved: 1, timeMs: null, points: 0 });
  });

  it('the final keeps chain progress for the host only', () => {
    const s = must(guessWord(final(), 'p1', 'Риба', 1000));
    expect(s.phase).toBe('question');
    expect(stageView(s).chain).toBeNull();
    expect(playerView(s, 'p2')?.chain).toBeNull();
    expect(hostView(s).chain?.rows).toHaveLength(3);
    expect(playerView(s, 'p1')?.me.chain?.solved).toBe(1);
  });

  it('freezes the personal clock on pause with the penalty taken off', () => {
    let s = must(takeHint(chainOpen(), 'p1', 1000));
    s = must(pause(s, 3000));
    expect(playerView(s, 'p1')?.me.chain).toMatchObject({ deadline: null, remainingMs: 17_000 - 5000, canHint: false });
  });

  it('a finished player sees the whole chain and the time; other types have no chain', () => {
    const s = solveAll(chainOpen(), 'p1', 5000);
    expect(playerView(s, 'p1')?.me.chain).toMatchObject({
      solved: 3,
      masks: [['Р', 'и', 'б', 'а'], [...'Океан'], [...'Корабель']],
      timeMs: 5000,
      canHint: false,
    });
    const plain = open();
    expect(stageView(plain).question?.chain).toBeNull();
    expect(playerView(plain, 'p1')?.me.chain).toBeNull();
    expect(stageView(plain).chain).toBeNull();
    expect(hostView(plain).chain).toBeNull();
  });
});

describe('host points views', () => {
  it('every role sees the last host adjustment as a notice', () => {
    const intro = must(start(lobby()));
    expect(stageView(intro).notice).toBeNull();
    expect(playerView(intro, 'p2')?.notice).toBeNull();
    expect(hostView(intro).notice).toBeNull();
    const adjusted = must(adjustScore(intro, 'p1', -100, T0));
    const notice = { seq: 1, at: T0, nickname: 'Олена', points: -100 };
    expect(stageView(adjusted).notice).toEqual(notice);
    expect(playerView(adjusted, 'p2')?.notice).toEqual(notice);
    expect(hostView(adjusted).notice).toEqual(notice);
  });
});
