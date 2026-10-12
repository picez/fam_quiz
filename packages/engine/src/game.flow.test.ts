import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  createGame,
  lock,
  next,
  recordOf,
  removePlayer,
  setConnected,
  start,
  submitAnswer,
  tick,
} from './game';
import { makeQuiz, order, single, text } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';

const T0 = 1_000_000;
const quiz = makeQuiz([single, text]);
const correct = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;

const started = () => must(start(lobbyWith(quiz, 'Олена', 'Тарас'), T0));
const scores = (state: { players: { score: number; totalTimeMs: number }[] }) =>
  state.players.map((p) => [p.score, p.totalTimeMs]);

describe('start', () => {
  it('requires at least one player', () => {
    expect(start(createGame(quiz), T0)).toEqual({ ok: false, error: 'no_players' });
  });

  it('opens the first question with a deadline', () => {
    const state = started();
    expect(state.phase).toBe('question');
    expect(state.questionIndex).toBe(0);
    expect(state.startedAt).toBe(T0);
    expect(state.endsAt).toBe(T0 + 20_000);
    expect(state.presented).toEqual(['a', 'b', 'c']);
  });

  it('cannot be called twice', () => {
    expect(start(started(), T0)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('closes the room to new players', () => {
    expect(addPlayer(started(), { id: 'p3', nickname: 'Ірина' })).toEqual({ ok: false, error: 'wrong_phase' });
  });
});

describe('submitAnswer', () => {
  it('records a correct answer scored by speed, without touching totals yet', () => {
    const state = must(submitAnswer(started(), 'p1', correct, T0 + 10_000));
    expect(recordOf(state, 0, 'p1')).toEqual({
      answer: correct,
      timeMs: 10_000,
      accepted: true,
      accuracy: 1,
      points: 750,
      overridden: false,
    });
    expect(state.phase).toBe('question');
    expect(state.players[0].score).toBe(0);
  });

  it('gives full points regardless of time when the speed bonus is off', () => {
    const flat = makeQuiz([single], { speedBonus: false });
    const state = must(submitAnswer(must(start(lobbyWith(flat, 'Олена', 'Тарас'), T0)), 'p1', correct, T0 + 19_000));
    expect(recordOf(state, 0, 'p1')?.points).toBe(1000);
  });

  it('rejects a second answer from the same player', () => {
    const state = must(submitAnswer(started(), 'p1', correct, T0 + 1000));
    expect(submitAnswer(state, 'p1', wrong, T0 + 2000)).toEqual({ ok: false, error: 'already_answered' });
  });

  it('accepts an answer exactly at the deadline and rejects one a millisecond later', () => {
    const state = must(submitAnswer(started(), 'p1', correct, T0 + 20_000));
    expect(recordOf(state, 0, 'p1')?.points).toBe(500);
    expect(submitAnswer(state, 'p2', correct, T0 + 20_001)).toEqual({ ok: false, error: 'time_over' });
  });

  it('rejects an answer of the wrong type', () => {
    expect(submitAnswer(started(), 'p1', { type: 'boolean', value: true }, T0 + 1000)).toEqual({
      ok: false,
      error: 'type_mismatch',
    });
  });

  it('rejects an unknown player', () => {
    expect(submitAnswer(started(), 'nobody', correct, T0 + 1000)).toEqual({ ok: false, error: 'not_found' });
  });

  it('rejects an answer outside the question phase', () => {
    expect(submitAnswer(lobbyWith(quiz, 'Олена'), 'p1', correct, T0)).toEqual({ ok: false, error: 'wrong_phase' });
  });
});

describe('locking', () => {
  it('locks automatically once every connected player has answered', () => {
    const afterFirst = must(submitAnswer(started(), 'p1', correct, T0 + 10_000));
    const state = must(submitAnswer(afterFirst, 'p2', wrong, T0 + 4000));
    expect(state.phase).toBe('locked');
    expect(state.endsAt).toBeNull();
    expect(scores(state)).toEqual([
      [750, 10_000],
      [0, 4000],
    ]);
  });

  it('tick locks at the deadline and not before', () => {
    expect(tick(started(), T0 + 19_999).phase).toBe('question');
    expect(tick(started(), T0 + 20_000).phase).toBe('locked');
  });

  it('counts the full time limit for a player who did not answer', () => {
    const state = tick(must(submitAnswer(started(), 'p1', correct, T0 + 5000)), T0 + 20_000);
    expect(scores(state)).toEqual([
      [875, 5000],
      [0, 20_000],
    ]);
  });

  it('lets the host lock early', () => {
    expect(must(lock(started())).phase).toBe('locked');
    expect(lock(lobbyWith(quiz, 'Олена'))).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('locks when the last player who has not answered disconnects', () => {
    const state = must(submitAnswer(started(), 'p1', correct, T0 + 1000));
    expect(must(setConnected(state, 'p2', false)).phase).toBe('locked');
  });

  it('locks when the last player who has not answered is removed', () => {
    const state = must(submitAnswer(started(), 'p1', correct, T0 + 1000));
    expect(must(removePlayer(state, 'p2')).phase).toBe('locked');
  });

  it('keeps waiting for the timer when everyone disconnects without answering', () => {
    const state = must(setConnected(must(setConnected(started(), 'p1', false)), 'p2', false));
    expect(state.phase).toBe('question');
  });
});

describe('next', () => {
  const bothAnswered = () =>
    must(submitAnswer(must(submitAnswer(started(), 'p1', correct, T0 + 1000)), 'p2', wrong, T0 + 1000));

  it('walks locked → reveal → leaderboard → next question → finished', () => {
    const reveal = must(next(bothAnswered(), T0 + 30_000));
    expect(reveal.phase).toBe('reveal');

    const leaderboard = must(next(reveal, T0 + 40_000));
    expect(leaderboard.phase).toBe('leaderboard');

    const second = must(next(leaderboard, T0 + 50_000));
    expect(second.phase).toBe('question');
    expect(second.questionIndex).toBe(1);
    expect(second.endsAt).toBe(T0 + 70_000);
    expect(second.presented).toEqual([]);

    const lastReveal = must(next(must(lock(second)), T0 + 80_000));
    expect(lastReveal.phase).toBe('reveal');

    const finished = must(next(lastReveal, T0 + 90_000));
    expect(finished.phase).toBe('finished');
    expect(next(finished, T0 + 100_000)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('skips the leaderboard when it is shown only at the end', () => {
    const atEnd = makeQuiz([single, text], { leaderboard: 'end' });
    const locked = must(lock(must(start(lobbyWith(atEnd, 'Олена'), T0))));
    const reveal = must(next(locked, T0));
    const second = must(next(reveal, T0 + 1000));
    expect(second.phase).toBe('question');
    expect(second.questionIndex).toBe(1);
  });

  it('is not allowed while a question is open', () => {
    expect(next(started(), T0)).toEqual({ ok: false, error: 'wrong_phase' });
  });
});

describe('presented order', () => {
  it('never shows order items in the correct order', () => {
    const identity = () => 0.999;
    const state = must(start(lobbyWith(makeQuiz([order]), 'Олена'), T0, identity));
    expect(state.presented).toEqual(['l', 'k', 'h', 'u']);
  });

  it('shuffles options when the quiz asks for it', () => {
    const shuffled = makeQuiz([single], { shuffleOptions: true });
    const state = must(start(lobbyWith(shuffled, 'Олена'), T0, () => 0));
    expect(state.presented).toEqual(['b', 'c', 'a']);
  });
});
