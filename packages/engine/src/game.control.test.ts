import { describe, expect, it } from 'vitest';
import { end, lock, next, override, pause, recordOf, resume, submitAnswer, tick } from './game';
import { makeQuiz, single, text } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';

const T0 = 1_000_000;
const correct = { type: 'single', optionId: 'b' } as const;
const started = () => startRound(lobbyWith(makeQuiz([single, text]), 'Олена', 'Тарас'), T0);

describe('pause and resume', () => {
  it('freezes the remaining time of an open question', () => {
    const paused = must(pause(started(), T0 + 5000));
    expect(paused.paused).toBe(true);
    expect(paused.remainingMs).toBe(15_000);
    expect(paused.endsAt).toBeNull();
  });

  it('refuses answers and ignores the timer while paused', () => {
    const paused = must(pause(started(), T0 + 5000));
    expect(submitAnswer(paused, 'p1', correct, T0 + 6000)).toEqual({ ok: false, error: 'paused' });
    expect(tick(paused, T0 + 999_999).phase).toBe('question');
  });

  it('continues with the same remaining time and the same elapsed time', () => {
    const resumed = must(resume(must(pause(started(), T0 + 5000)), T0 + 60_000));
    expect(resumed.paused).toBe(false);
    expect(resumed.endsAt).toBe(T0 + 75_000);

    const answered = must(submitAnswer(resumed, 'p1', correct, T0 + 61_000));
    expect(recordOf(answered, 0, 'p1')?.timeMs).toBe(6000);
    expect(recordOf(answered, 0, 'p1')?.points).toBe(850);
  });

  it('locks on resume if everyone still connected has already answered', () => {
    const answered = must(submitAnswer(started(), 'p1', correct, T0 + 1000));
    const paused = must(pause(answered, T0 + 2000));
    const offline = { ...paused, players: paused.players.map((p) => (p.id === 'p2' ? { ...p, connected: false } : p)) };
    expect(must(resume(offline, T0 + 9000)).phase).toBe('locked');
  });

  it('blocks next while paused outside a question', () => {
    const paused = must(pause(must(lock(started())), T0));
    expect(paused.remainingMs).toBeNull();
    expect(next(paused, T0)).toEqual({ ok: false, error: 'paused' });
    expect(must(next(must(resume(paused, T0)), T0)).phase).toBe('reveal');
  });

  it('is rejected in the lobby, when already paused, and resume when not paused', () => {
    const lobby = lobbyWith(makeQuiz([single]), 'Олена');
    expect(pause(lobby, T0)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(pause(must(pause(started(), T0)), T0)).toEqual({ ok: false, error: 'paused' });
    expect(resume(started(), T0)).toEqual({ ok: false, error: 'wrong_phase' });
  });
});

describe('override', () => {
  const textQuiz = makeQuiz([text]);
  const onReveal = () => {
    const open = startRound(lobbyWith(textQuiz, 'Олена', 'Тарас'), T0);
    const first = must(submitAnswer(open, 'p1', { type: 'text', value: 'одеса' }, T0 + 10_000));
    const locked = must(submitAnswer(first, 'p2', { type: 'text', value: 'Адеса' }, T0 + 10_000));
    return must(next(locked, T0 + 20_000));
  };

  it('accepts a rejected answer and recalculates points with the original time', () => {
    const state = must(override(onReveal(), 'p2', 'correct'));
    expect(recordOf(state, 0, 'p2')).toMatchObject({
      accepted: true,
      accuracy: 1,
      grade: 'correct',
      basePoints: 750,
      points: 750,
      overridden: true,
    });
    expect(state.players.map((p) => p.score)).toEqual([750, 750]);
  });

  it('rejects an accepted answer and removes its points', () => {
    const state = must(override(onReveal(), 'p1', 'wrong'));
    expect(recordOf(state, 0, 'p1')).toMatchObject({
      accepted: false,
      accuracy: 0,
      grade: 'wrong',
      basePoints: 0,
      points: 0,
      overridden: true,
    });
    expect(state.players.map((p) => p.score)).toEqual([0, 0]);
  });

  it('is allowed only on reveal', () => {
    const locked = must(lock(startRound(lobbyWith(textQuiz, 'Олена'), T0)));
    expect(override(locked, 'p1', 'correct')).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('reports a player who gave no answer', () => {
    const reveal = must(next(must(lock(startRound(lobbyWith(textQuiz, 'Олена'), T0))), T0));
    expect(override(reveal, 'p1', 'correct')).toEqual({ ok: false, error: 'not_found' });
  });
});

describe('end', () => {
  it('finishes the game from an open question and counts it as closed', () => {
    const answered = must(submitAnswer(started(), 'p1', correct, T0 + 10_000));
    const finished = must(end(answered));
    expect(finished.phase).toBe('finished');
    expect(finished.endsAt).toBeNull();
    expect(finished.players.map((p) => [p.score, p.totalTimeMs])).toEqual([
      [750, 10_000],
      [0, 20_000],
    ]);
  });

  it('clears a pause', () => {
    expect(must(end(must(pause(started(), T0)))).paused).toBe(false);
  });

  it('is rejected in the lobby and after the game has finished', () => {
    expect(end(lobbyWith(makeQuiz([single]), 'Олена'))).toEqual({ ok: false, error: 'wrong_phase' });
    expect(end(must(end(started())))).toEqual({ ok: false, error: 'wrong_phase' });
  });
});
