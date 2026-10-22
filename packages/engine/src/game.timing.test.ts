import { describe, expect, it } from 'vitest';
import { buzz } from './blitz';
import { lock, next, pause, recordOf, resume, start, submitAnswer, type GameState } from './game';
import { adjustTime } from './timing';
import { blitzRound, boardRound, classicRound, makeRoundsQuiz, single } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';

const right = { type: 'single', optionId: 'b' } as const;

/** Класичний раунд, `single` з timeLimit 20 і points 1000, відкрито в момент 0. */
function open(speedBonus = true): GameState {
  const quiz = makeRoundsQuiz([classicRound('r1', [single], { speedBonus })]);
  return startRound(lobbyWith(quiz, 'Анна', 'Богдан'), 0);
}

describe('host time changes', () => {
  it('+15 adds to the running timer and to the question total', () => {
    const state = must(adjustTime(open(), 15, 0));
    expect(state.endsAt).toBe(35_000);
    expect(state.startedAt).toBe(0);
    expect(state.plays[0].extraMs).toBe(15_000);
  });

  it('−15 never leaves less than five seconds and is refused at five or less', () => {
    const cut = must(adjustTime(open(), -15, 12_000));
    expect(cut.endsAt).toBe(17_000);
    expect(cut.plays[0].extraMs).toBe(-3000);
    expect(adjustTime(cut, -15, 12_000)).toEqual({ ok: false, error: 'time_limit' });
  });

  it('+15 never leaves more than 120 seconds and is refused at 120', () => {
    let state = open();
    const left: number[] = [];
    for (let i = 0; i < 7; i++) {
      state = must(adjustTime(state, 15, 0));
      left.push(state.endsAt as number);
    }
    expect(left).toEqual([35_000, 50_000, 65_000, 80_000, 95_000, 110_000, 120_000]);
    expect(adjustTime(state, 15, 0)).toEqual({ ok: false, error: 'time_limit' });
  });

  it('a change on pause applies to the stored remainder and survives the resume', () => {
    const paused = must(adjustTime(must(pause(open(), 5000)), 15, 6000));
    expect(paused.remainingMs).toBe(30_000);
    expect(paused.endsAt).toBeNull();
    const resumed = must(resume(paused, 100_000));
    expect(resumed.endsAt).toBe(130_000);
    expect(resumed.startedAt).toBe(95_000);
    const answered = must(submitAnswer(resumed, 'p1', right, 112_500));
    expect(recordOf(answered, 0, 'p1')).toMatchObject({ points: 750, timeMs: 17_500 });
  });

  it('the speed bonus uses the real total time', () => {
    const answered = must(submitAnswer(must(adjustTime(open(), 15, 0)), 'p1', right, 17_500));
    expect(recordOf(answered, 0, 'p1')?.points).toBe(750);
  });

  it('the blitz answer window is not changed', () => {
    const quiz = makeRoundsQuiz([blitzRound('b1', [single], { answerWindow: 15 })]);
    const buzzed = must(buzz(startRound(lobbyWith(quiz, 'Анна', 'Богдан'), 0), 'p1', 1000));
    expect(buzzed.plays[0].blitz?.queue[0].deadline).toBe(16_000);
    const adjusted = must(adjustTime(buzzed, 15, 2000));
    expect(adjusted.endsAt).toBe(35_000);
    expect(adjusted.plays[0].blitz?.queue[0].deadline).toBe(16_000);
  });

  it('adjustTime is refused outside a running question', () => {
    const quiz = makeRoundsQuiz([boardRound('g1', [{ title: 'A', cells: [{ ...single, id: 'c11' }] }])]);
    const intro = must(start(lobbyWith(quiz, 'Анна')));
    expect(intro.phase).toBe('intro');
    expect(adjustTime(intro, 15, 0)).toEqual({ ok: false, error: 'wrong_phase' });
    const board = must(next(intro, 0));
    expect(board.phase).toBe('board');
    expect(adjustTime(board, 15, 0)).toEqual({ ok: false, error: 'wrong_phase' });
    const locked = must(lock(open()));
    expect(adjustTime(locked, 15, 0)).toEqual({ ok: false, error: 'wrong_phase' });
  });
});
