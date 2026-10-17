import { DEFAULT_RULES, type BlitzRound, type RoundRules } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { buzz } from './blitz';
import { lock, next, override, start, submitAnswer, tick, type GameState } from './game';
import { blitzRound, makeRoundsQuiz, single, text } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';

const right = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;
const rules = (patch: Partial<RoundRules>) => ({ ...DEFAULT_RULES, ...patch, partial: null });
const copies = (...ids: string[]) => ids.map((id) => ({ ...single, id }));
type Options = Partial<Omit<BlitzRound, 'id' | 'type' | 'questions'>>;

/** Гра з одним раундом бліцу, перше запитання відкрите в момент 0. */
function open(options: Options = {}, questions = [single, text]): GameState {
  const quiz = makeRoundsQuiz([blitzRound('b1', questions, options)]);
  return must(start(lobbyWith(quiz, 'Анна', 'Богдан', 'Віра'), 0));
}

/** Натискання й відповідь одного гравця. */
function buzzAndAnswer(state: GameState, playerId: string, answer: typeof right | typeof wrong, now: number) {
  return must(submitAnswer(must(buzz(state, playerId, now)), playerId, answer, now));
}

/** Іде далі, доки не відкриється наступне запитання. */
function toQuestion(state: GameState): GameState {
  let current = must(next(state, 0));
  while (current.phase !== 'question') current = must(next(current, 0));
  return current;
}

const score = (state: GameState, playerId: string) => state.players.find((p) => p.id === playerId)?.score;

describe('blitz queue', () => {
  it('the first correct answer in the queue wins the question', () => {
    let state = must(buzz(open(), 'p1', 1000));
    state = must(buzz(state, 'p2', 1500));
    state = must(submitAnswer(state, 'p2', right, 1600));
    expect(state.phase).toBe('question');
    expect(state.plays[0].blitz?.attempts).toEqual([]);
    state = must(submitAnswer(state, 'p1', wrong, 2000));
    expect(state.phase).toBe('locked');
    expect(state.plays[0].blitz?.attempts.map((a) => [a.playerId, a.grade])).toEqual([
      ['p1', 'wrong'],
      ['p2', 'correct'],
    ]);
    expect(state.players.find((p) => p.id === 'p2')?.score).toBe(1000);
    expect(state.players.find((p) => p.id === 'p1')?.score).toBe(0);
  });

  it('a wrong attempt costs the question price when the penalty is on', () => {
    let state = open({ rules: rules({ penalty: 'minus', multiplier: 2 }) });
    state = buzzAndAnswer(state, 'p1', wrong, 1000);
    state = buzzAndAnswer(state, 'p2', right, 2000);
    expect(state.phase).toBe('locked');
    expect(score(state, 'p1')).toBe(-2000);
    expect(score(state, 'p2')).toBe(2000);
  });

  it('a player with attempts left can buzz again and goes to the end of the queue', () => {
    let state = must(buzz(open({ attempts: 2 }), 'p1', 1000));
    state = must(buzz(state, 'p3', 1500));
    state = must(submitAnswer(state, 'p1', wrong, 2000));
    state = must(buzz(state, 'p1', 2500));
    expect(state.plays[0].blitz?.queue.map((entry) => entry.playerId)).toEqual(['p3', 'p1']);
    state = must(submitAnswer(state, 'p3', wrong, 3000));
    state = must(submitAnswer(state, 'p1', wrong, 3500));
    expect(state.plays[0].blitz?.attempts.map((a) => a.playerId)).toEqual(['p1', 'p3', 'p1']);
    expect(buzz(state, 'p1', 4000)).toEqual({ ok: false, error: 'no_attempts' });
  });

  it('buzzing twice without answering is refused', () => {
    const state = must(buzz(open(), 'p1', 1000));
    expect(buzz(state, 'p1', 1200)).toEqual({ ok: false, error: 'already_queued' });
  });

  it('an answer without buzzing is refused', () => {
    const state = open();
    expect(submitAnswer(state, 'p1', { type: 'single', optionId: 'b' }, 1000)).toEqual({
      ok: false,
      error: 'not_in_queue',
    });
  });

  it('a missed answer window counts as a wrong attempt with the penalty', () => {
    let state = must(buzz(open({ answerWindow: 5, rules: rules({ penalty: 'minus' }) }), 'p1', 1000));
    expect(tick(state, 5999)).toBe(state);
    state = tick(state, 6000);
    expect(state.plays[0].blitz?.attempts).toEqual([
      { playerId: 'p1', answer: null, timeMs: 1000, grade: 'wrong', points: -1000 },
    ]);
    expect(state.plays[0].answers.p1).toMatchObject({ answer: null, grade: 'wrong', points: -1000 });
    expect(state.phase).toBe('question');
  });

  it('after the timer the queue is still checked but nobody can buzz', () => {
    let state = must(buzz(open({ answerWindow: 15 }), 'p1', 19000));
    expect(buzz(state, 'p2', 20001)).toEqual({ ok: false, error: 'time_over' });
    state = tick(state, 20000);
    expect(state.phase).toBe('question');
    state = must(submitAnswer(state, 'p1', right, 25000));
    expect(state.plays[0].blitz?.attempts.map((a) => a.grade)).toEqual(['correct']);
    expect(state.phase).toBe('locked');
  });

  it('with the window off an unanswered buzz burns out with the question timer', () => {
    let state = must(buzz(open({ answerWindow: null }), 'p1', 1000));
    expect(tick(state, 19999).phase).toBe('question');
    state = tick(state, 20000);
    expect(state.plays[0].blitz?.attempts).toEqual([
      { playerId: 'p1', answer: null, timeMs: 1000, grade: 'wrong', points: 0 },
    ]);
    expect(state.phase).toBe('locked');
  });

  it('the question closes when nobody can buzz any more', () => {
    let state = open({ attempts: 1 });
    state = buzzAndAnswer(state, 'p1', wrong, 1000);
    state = buzzAndAnswer(state, 'p2', wrong, 2000);
    expect(state.phase).toBe('question');
    state = buzzAndAnswer(state, 'p3', wrong, 3000);
    expect(state.phase).toBe('locked');
    expect(state.plays[0].blitz?.attempts.some((a) => a.grade === 'correct')).toBe(false);
    expect(state.players.map((p) => p.score)).toEqual([0, 0, 0]);
  });

  it('lock drops the unchecked queue without points', () => {
    let state = must(buzz(open({ rules: rules({ penalty: 'minus' }) }), 'p1', 1000));
    state = must(submitAnswer(must(buzz(state, 'p2', 1500)), 'p2', right, 1600));
    state = must(lock(state));
    expect(state.plays[0].blitz).toEqual({ queue: [], attempts: [] });
    expect(state.plays[0].answers).toEqual({});
    expect(state.players.map((p) => p.score)).toEqual([0, 0, 0]);
  });
});

describe('blitz scoring', () => {
  it('blitz streak continues only for winners and survives questions a player skipped', () => {
    const streak = { length: 2, bonus: { kind: 'fixed', value: 300 } } as const;
    let state = open({ rules: rules({ streak }) }, copies('q1', 'q2', 'q3'));
    state = toQuestion(buzzAndAnswer(state, 'p1', right, 1000));
    state = toQuestion(buzzAndAnswer(state, 'p2', right, 1000));
    state = buzzAndAnswer(state, 'p1', right, 1000);
    expect(state.plays.map((play) => play.answers.p1?.streakBonus)).toEqual([0, undefined, 300]);
    expect(state.plays.map((play) => play.answers.p2?.streakBonus)).toEqual([undefined, 0, undefined]);
    expect(score(state, 'p1')).toBe(2300);
    expect(score(state, 'p2')).toBe(1000);
  });

  it('the streak bonus percent is taken from the winning attempt, not from earlier penalties', () => {
    const streak = { length: 2, bonus: { kind: 'percent', value: 50 } } as const;
    let state = open({ attempts: 2, rules: rules({ penalty: 'minus', streak }) }, copies('q1', 'q2'));
    state = toQuestion(buzzAndAnswer(state, 'p1', right, 1000));
    state = buzzAndAnswer(state, 'p1', wrong, 1000);
    expect(score(state, 'p1')).toBe(1000);
    state = buzzAndAnswer(state, 'p1', right, 2000);
    expect(state.phase).toBe('locked');
    expect(state.plays[1].answers.p1).toMatchObject({ basePoints: 0, streakBonus: 500, points: 500 });
    expect(score(state, 'p1')).toBe(1500);
  });

  it('blitz answers do not add to the tie-break time', () => {
    let state = must(buzz(open(), 'p1', 1000));
    state = must(submitAnswer(state, 'p1', right, 4000));
    expect(state.phase).toBe('locked');
    expect(state.players.map((p) => p.totalTimeMs)).toEqual([0, 0, 0]);
  });

  it('the host cannot change a blitz grade after the reveal', () => {
    const revealed = must(next(buzzAndAnswer(open(), 'p2', right, 1000), 0));
    expect(revealed.phase).toBe('reveal');
    expect(override(revealed, 'p2', 'wrong')).toEqual({ ok: false, error: 'wrong_phase' });
  });
});
