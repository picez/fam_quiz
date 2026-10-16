import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type Phase } from '@quiz/shared';
import { lock, next, start, submitAnswer, type GameState } from './game';
import { bool, classicRound, makeQuiz, makeRoundsQuiz, multi, order, single, text } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';
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
