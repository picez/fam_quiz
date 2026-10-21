import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type Answer, type Phase, type Question } from '@quiz/shared';
import { buzz } from './blitz';
import { pickCell } from './board';
import { acceptAnswer, endRound, judge, lock, next, pause, removePlayer, setConnected, start, submitAnswer, type GameState } from './game';
import { blitzRound, boardRound, bool, classicRound, makeQuiz, makeRoundsQuiz, multi, order, single, text, withId, withPoints } from './testing/fixtures';
import { acceptAll, lobbyWith, must } from './testing/helpers';
import { hostView, playerView, stageView } from './views';

const T0 = 1_000_000;
const quiz = makeQuiz([single, text]);
const correct = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;

const lobby = () => lobbyWith(quiz, 'Олена', 'Тарас');
const open = () => must(start(lobby(), T0));
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
      points: 1000,
      choices: [
        { id: 'a', text: 'Львів' },
        { id: 'b', text: 'Київ' },
        { id: 'c', text: 'Одеса' },
      ],
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

  it('presents order items in the shuffled order', () => {
    const state = must(start(lobbyWith(makeQuiz([order]), 'Олена'), T0, () => 0.999));
    expect(stageView(state).question?.choices.map((c) => c.id)).toEqual(['l', 'k', 'h', 'u']);
  });

  it('does not leak accepted spellings of a text question', () => {
    const state = must(start(lobbyWith(makeQuiz([text]), 'Олена'), T0));
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
    const open = must(start(lobbyWith(makeQuiz([multi]), 'Олена'), T0));
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
  const started = () => must(start(lobbyWith(twoRounds(), 'Олена', 'Тарас'), T0));
  const atIntro2 = () => goTo(started(), 'intro', 1);

  it('has no round in the lobby', () => {
    expect(stageView(lobbyWith(twoRounds(), 'Олена')).round).toBeNull();
  });

  it('shows round info and no previous question in the intro of the second round', () => {
    const state = atIntro2();
    for (const view of [stageView(state), playerView(state, 'p1'), hostView(state)]) {
      expect(view?.round).toEqual({ index: 1, total: 2, title: 'Фінал', type: 'classic', partial: true });
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
    let state = must(start(lobbyWith(streakQuiz, 'Олена', 'Тарас'), T0));
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
    must(start(lobbyWith(makeRoundsQuiz([blitzRound('b1', [single, text], options)]), 'Анна', 'Богдан', 'Віра'), 0));
  const nicknames = (queue: { nickname: string }[] | undefined) => queue?.map((entry) => entry.nickname);

  it('stage and players see the blitz queue but not the winner before the reveal', () => {
    let state = must(buzz(blitzGame(), 'p1', 1000));
    state = must(buzz(state, 'p2', 1500));
    expect(nicknames(stageView(state).blitz?.queue)).toEqual(['Анна', 'Богдан']);
    state = must(submitAnswer(state, 'p1', wrong, 2000));
    state = acceptAll(must(submitAnswer(state, 'p2', correct, 2500)), 2500);
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
    let state = must(buzz(blitzGame({ attempts: 2 }), 'p1', 1000));
    state = acceptAll(must(submitAnswer(state, 'p1', wrong, 1500)), 1500);
    state = must(buzz(state, 'p1', 2000));
    const me = playerView(state, 'p1')?.me;
    expect(me?.answer).toBeNull();
    expect(me?.blitz?.position).toBe(1);
  });

  it('the player sees their place, attempts and whether they can buzz', () => {
    let state = must(buzz(blitzGame({ attempts: 2, answerWindow: 15 }), 'p2', 1000));
    state = must(buzz(state, 'p1', 1500));
    expect(playerView(state, 'p1')?.me.blitz).toEqual({
      position: 2,
      attemptsUsed: 0,
      attemptsLeft: 2,
      canBuzz: false,
      deadline: 16500,
    });
    expect(playerView(state, 'p3')?.me.blitz?.canBuzz).toBe(true);
    state = acceptAll(must(submitAnswer(state, 'p2', wrong, 2000)), 2000);
    expect(playerView(state, 'p2')?.me.blitz).toEqual({
      position: null,
      attemptsUsed: 1,
      attemptsLeft: 1,
      canBuzz: true,
      deadline: null,
    });
  });

  it('canBuzz is false when paused or when no attempts are left', () => {
    let state = must(buzz(blitzGame({ attempts: 1 }), 'p1', 1000));
    state = acceptAll(must(submitAnswer(state, 'p1', wrong, 2000)), 2000);
    expect(playerView(state, 'p1')?.me.blitz).toMatchObject({ attemptsLeft: 0, canBuzz: false });
    const paused = must(pause(blitzGame(), 1000));
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
    const intro = must(start(lobbyWith(makeRoundsQuiz([field(options)]), 'Анна', 'Богдан', 'Віра'), 0));
    return must(next(intro, 0));
  };
  const picked = (cell: string, options = {}) => must(pickCell(onBoard(options), null, cell, 0, Math.random));

  it('stage and player views never carry hidden marks or cell questions', () => {
    const state = onBoard();
    const stage = stageView(state);
    const player = playerView(state, 'p2');
    for (const json of [JSON.stringify(stage), JSON.stringify(player)]) {
      expect(json).not.toContain('x2');
      expect(json).not.toContain('x3');
      expect(json).not.toContain(single.text);
      expect(json).not.toContain('correctId');
    }
    expect(stage.board?.categories.flatMap((c) => c.cells).every((cell) => cell.mark === null)).toBe(true);
    expect(player?.board?.categories.flatMap((c) => c.cells).every((cell) => cell.mark === null)).toBe(true);
    expect(hostView(state).board?.categories[0].cells[1].mark).toBe('x2');
    expect(hostView(state).board?.categories[1].cells[2].mark).toBe('x3');
  });

  it('a chosen cell shows its mark to everyone and stays shown', () => {
    const state = picked('c12');
    expect(stageView(state).board?.cell).toMatchObject({ id: 'c12', mark: 'x2', price: 200 });
    expect(playerView(state, 'p2')?.board?.cell).toMatchObject({ mark: 'x2', price: 200 });
    expect(stageView(state).board?.categories[1].cells.every((cell) => cell.mark === null)).toBe(true);
    const revealed = must(next(must(lock(state)), 0));
    expect(stageView(revealed).board?.categories[0].cells[1]).toMatchObject({ mark: 'x2', played: true });
    const done = must(next(must(next(revealed, 0)), 0));
    expect(done.phase).toBe('board');
    const view = stageView(done).board;
    expect(view?.cell).toBeNull();
    expect(view?.categories[0].cells[1]).toMatchObject({ id: 'c12', mark: 'x2', played: true });
    expect(view?.categories[0].cells[0]).toMatchObject({ mark: null, played: false });
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

  it('the host sees a phone answer waiting for a grade', () => {
    const state = must(submitAnswer(picked('c11', { check: 'manual' }), 'p1', { type: 'single', optionId: 'b' }, 0));
    const host = hostView(state).board;
    expect(host?.manual).toBe(true);
    expect(host?.answer).toEqual({ type: 'single', optionId: 'b' });
    expect(playerView(state, 'p1')?.me.answer).toEqual({ type: 'single', optionId: 'b' });
    expect(hostView(picked('c11')).board).toMatchObject({ manual: false, answer: null });
    expect(hostView(picked('c11', { answerMode: 'voice' })).board?.manual).toBe(true);
  });

  it('the absent chooser has a skip time that a pause removes', () => {
    const state = must(setConnected(onBoard(), 'p1', false, 1000));
    expect(stageView(state).board?.skipAt).toBe(31_000);
    expect(stageView(must(pause(state, 2000))).board?.skipAt).toBeNull();
    expect(stageView(onBoard()).board?.skipAt).toBeNull();
  });

  it('classic and blitz views carry no board data', () => {
    expect(stageView(open()).board).toBeNull();
    expect(playerView(open(), 'p1')?.board).toBeNull();
    expect(hostView(open()).board).toBeNull();
    const blitz = must(start(lobbyWith(makeRoundsQuiz([blitzRound('b1', [single])]), 'Анна'), 0));
    expect(stageView(blitz).board).toBeNull();
  });
});

describe('spotlight views', () => {
  const field = (options = {}, question: Question = single) =>
    boardRound('g1', [{ title: 'Міста', cells: [withId(question, 'c11')] }], options);
  const picked = (options = {}, question: Question = single) => {
    const intro = must(start(lobbyWith(makeRoundsQuiz([field(options, question)]), 'Анна', 'Богдан', 'Віра'), 0));
    return must(pickCell(must(next(intro, 0)), null, 'c11', 0, Math.random));
  };
  const answered = (options = {}, answer: Answer = wrong, question: Question = single) =>
    must(submitAnswer(picked(options, question), 'p1', answer, 5000));
  const blitzGame = (options: Parameters<typeof blitzRound>[2] = {}) =>
    must(start(lobbyWith(makeRoundsQuiz([blitzRound('b1', [single, text], options)]), 'Анна', 'Богдан', 'Віра'), 0));

  it('everyone sees the pending board answer in orange and the stopped timer', () => {
    const state = answered();
    const views = [stageView(state), playerView(state, 'p2'), hostView(state)];
    for (const view of views) {
      expect(view?.spotlight).toEqual({ playerId: 'p1', nickname: 'Анна', answer: wrong, grade: null });
      expect(view?.endsAt).toBeNull();
      expect(view?.remainingMs).toBe(15_000);
    }
  });

  it('a hold under a host pause still shows the frozen remainder', () => {
    const state = must(pause(answered(), 9000));
    expect(stageView(state).remainingMs).toBe(15_000);
    expect(stageView(state).endsAt).toBeNull();
    expect(stageView(state).spotlight?.grade).toBeNull();
  });

  it('after accept everyone sees the verdict and the correct answer at the reveal', () => {
    const state = must(acceptAnswer(answered(), 6000));
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

  it('stage and player views never carry the correct answer before the reveal', () => {
    const typed: Answer = { type: 'text', value: 'Одеса' };
    const state = answered({}, typed, text);
    for (const json of [JSON.stringify(stageView(state)), JSON.stringify(playerView(state, 'p2'))]) {
      expect(json).not.toContain('accepted');
      expect(json).not.toContain('"correct"');
      expect(json).toContain('Одеса');
    }
    let blitz = must(buzz(blitzGame({ attempts: 2 }), 'p1', 1000));
    blitz = acceptAll(must(submitAnswer(blitz, 'p1', wrong, 2000)), 2000);
    for (const view of [stageView(blitz), playerView(blitz, 'p2')]) {
      expect(view?.spotlight?.grade).toBe('wrong');
      expect(view?.reveal).toBeNull();
      expect(JSON.stringify(view)).not.toContain('correctId');
    }
  });

  it('the blitz spotlight shows the pending head, then the last attempt', () => {
    let state = must(buzz(blitzGame({ attempts: 2 }), 'p1', 1000));
    state = must(submitAnswer(state, 'p1', wrong, 2000));
    expect(stageView(state).spotlight).toEqual({ playerId: 'p1', nickname: 'Анна', answer: wrong, grade: null });
    state = must(acceptAnswer(state, 3000));
    expect(stageView(state).spotlight).toEqual({ playerId: 'p1', nickname: 'Анна', answer: wrong, grade: 'wrong' });
    state = must(buzz(state, 'p2', 4000));
    state = must(submitAnswer(state, 'p2', correct, 4500));
    expect(playerView(state, 'p3')?.spotlight).toEqual({ playerId: 'p2', nickname: 'Богдан', answer: correct, grade: null });
    expect(stageView(blitzGame()).spotlight).toBeNull();
  });

  it('the blitz window is hidden from the player while an answer is pending', () => {
    let state = must(buzz(blitzGame({ answerWindow: 15, attempts: 2 }), 'p1', 1000));
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
