import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '@quiz/shared';
import { nextDeadline } from './blitz';
import { chainDeadline, chainOf, guessWord, letterCount, maskWord, takeHint } from './chain';
import { lock, next, override, pause, recordOf, removePlayer, resume, submitAnswer, tick, type GameState } from './game';
import { adjustTime } from './timing';
import { chain, makeQuiz, single } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';

const rng = () => 0;
const players = ['Олена', 'Тарас', 'Віра'];
const fresh = (...nicknames: string[]) =>
  startRound(lobbyWith(makeQuiz([chain], { speedBonus: true }), ...(nicknames.length > 0 ? nicknames : players)), 0);
const state = fresh();
const record = (s: GameState, playerId: string) => recordOf(s, 0, playerId);
const scores = (s: GameState) => s.players.map((p) => p.score);

/** Гравець вгадує всі приховані слова в мить now. */
function finish(s: GameState, playerId: string, now: number): GameState {
  return ['Риба', 'Океан', 'Корабель'].reduce((current, word) => must(guessWord(current, playerId, word, now)), s);
}

describe('word chain', () => {
  it('guesses go in order, case and spaces do not matter, a wrong word changes nothing', () => {
    expect(guessWord(state, 'p1', 'Океан', 1000)).toEqual({ ok: false, error: 'wrong_word' });
    const s = must(guessWord(state, 'p1', '  риба ', 1000));
    expect(chainOf(s, 'p1')).toEqual({ solved: 1, shown: 1, hints: 0 });
    expect(s.plays[0].chain?.p2).toBeUndefined();
    expect(chainOf(s, 'p2')).toEqual({ solved: 0, shown: 1, hints: 0 });
    expect(guessWord(s, 'p1', 'Риба', 1000)).toEqual({ ok: false, error: 'wrong_word' });
    expect(chainOf(must(guessWord(s, 'p1', 'ОКЕАН', 1000)), 'p1')).toEqual({ solved: 2, shown: 1, hints: 0 });
  });

  it('a hint opens the next letter and adds the hint seconds, never the last letter', () => {
    let s = must(takeHint(state, 'p1', 1000));
    s = must(takeHint(s, 'p1', 1000));
    expect(chainOf(s, 'p1')).toEqual({ solved: 0, shown: 3, hints: 2 });
    expect(takeHint(s, 'p1', 1000)).toEqual({ ok: false, error: 'no_hint' });
    s = must(guessWord(s, 'p1', 'Риба', 1000));
    expect(chainOf(s, 'p1')).toEqual({ solved: 1, shown: 1, hints: 2 });
    expect(chainDeadline(s, 'p1')).toBe(20_000 - 10_000);
    expect(chainDeadline(s, 'p2')).toBe(20_000);
  });

  it('separators are shown and do not count as letters', () => {
    expect(maskWord('Нью-Йорк', 1)).toEqual(['Н', null, null, '-', null, null, null, null]);
    expect(maskWord("М'ята", 2)).toEqual(['М', "'", 'я', null, null]);
    expect(letterCount('Біла Церква')).toBe(10);
  });

  it('a hint that would use up the time is refused', () => {
    expect(takeHint(state, 'p1', 15_001)).toEqual({ ok: false, error: 'hint_late' });
    expect(takeHint(state, 'p1', 14_000).ok).toBe(true);
  });

  it('finishing records the time with penalty and the question closes when everyone is done', () => {
    let s = finish(fresh('Олена', 'Тарас'), 'p1', 5000);
    expect(record(s, 'p1')).toMatchObject({
      answer: { type: 'chain', solved: 3, hints: 0, timeMs: 5000 },
      accepted: true,
      timeMs: 5000,
    });
    expect(s.phase).toBe('question');
    s = must(takeHint(s, 'p2', 1000));
    s = must(guessWord(s, 'p2', 'Риба', 6000));
    s = must(guessWord(s, 'p2', 'Океан', 7000));
    expect(s.phase).toBe('question');
    s = must(guessWord(s, 'p2', 'Корабель', 8000));
    expect(s.phase).toBe('locked');
    expect(record(s, 'p2')).toMatchObject({ answer: { type: 'chain', solved: 3, hints: 1, timeMs: 13_000 }, timeMs: 13_000 });
  });

  it('the fastest gets the full price, the others less down to half; non-finishers get nothing', () => {
    const play = (s: GameState) => {
      s = finish(s, 'p1', 5000);
      s = must(takeHint(s, 'p2', 1000));
      s = finish(s, 'p2', 8000);
      s = must(guessWord(s, 'p3', 'Риба', 3000));
      expect(guessWord(s, 'p4', 'Сом', 3000)).toEqual({ ok: false, error: 'wrong_word' });
      return must(next(must(lock(s)), 30_000, rng));
    };
    const nicknames = [...players, 'Галя'];
    const s = play(fresh(...nicknames));
    expect(s.phase).toBe('reveal');
    expect(scores(s)).toEqual([1000, 733, 0, 0]);
    expect(record(s, 'p3')).toMatchObject({
      accepted: false,
      points: 0,
      answer: { type: 'chain', solved: 1, hints: 0, timeMs: 20_000 },
    });
    expect(record(s, 'p4')).toBeUndefined();

    const doubled = makeQuiz([chain], { rules: { ...DEFAULT_RULES, multiplier: 2, penalty: 'minus' } });
    expect(scores(play(startRound(lobbyWith(doubled, ...nicknames), 0)))).toEqual([2000, 1467, 0, 0]);
  });

  it('equal times share the full price', () => {
    let s = finish(state, 'p1', 6000);
    s = finish(s, 'p2', 6000);
    s = must(lock(s));
    expect(scores(s)).toEqual([1000, 1000, 0]);
  });

  it('a player out of personal time cannot guess and the question closes at the earliest deadline', () => {
    let s = must(takeHint(state, 'p2', 1000));
    s = must(takeHint(s, 'p2', 1000));
    expect(chainDeadline(s, 'p2')).toBe(10_000);
    s = must(removePlayer(s, 'p3'));
    s = finish(s, 'p1', 2000);
    expect(s.phase).toBe('question');
    expect(nextDeadline(s, 2000)).toBe(10_000);
    expect(guessWord(s, 'p2', 'Риба', 10_001)).toEqual({ ok: false, error: 'time_over' });
    expect(takeHint(s, 'p2', 10_001)).toEqual({ ok: false, error: 'time_over' });
    expect(tick(s, 9_999).phase).toBe('question');
    const locked = tick(s, 10_000);
    expect(locked.phase).toBe('locked');
    expect(record(locked, 'p2')).toMatchObject({ accepted: false, answer: { solved: 0, hints: 2 } });
  });

  it('pause does not count and +15 s moves every personal deadline', () => {
    let s = must(takeHint(state, 'p2', 1000));
    s = must(pause(s, 5000));
    expect(chainDeadline(s, 'p2')).toBeNull();
    s = must(resume(s, 65_000));
    const before = [chainDeadline(s, 'p2'), chainDeadline(s, 'p3')];
    expect(before).toEqual([75_000, 80_000]);
    const moved = must(adjustTime(s, 15, 65_500));
    expect([chainDeadline(moved, 'p2'), chainDeadline(moved, 'p3')]).toEqual([90_000, 95_000]);
    s = finish(s, 'p1', 66_000);
    expect(record(s, 'p1')).toMatchObject({ timeMs: 6000, answer: { timeMs: 6000 } });
  });

  it('the plain answer event cannot answer a chain', () => {
    expect(submitAnswer(state, 'p1', { type: 'text', value: 'Риба' }, 1000)).toEqual({ ok: false, error: 'type_mismatch' });
    expect(submitAnswer(state, 'p1', { type: 'chain', solved: 3, hints: 0, timeMs: 1 }, 1000)).toEqual({
      ok: false,
      error: 'type_mismatch',
    });
    const plain = startRound(lobbyWith(makeQuiz([single]), 'Олена'), 0);
    expect(submitAnswer(plain, 'p1', { type: 'chain', solved: 3, hints: 0, timeMs: 1 }, 1000)).toEqual({
      ok: false,
      error: 'type_mismatch',
    });
  });

  it('the host cannot grade a chain by hand', () => {
    let s = finish(state, 'p1', 2000);
    s = must(guessWord(s, 'p3', 'Риба', 3000));
    s = must(next(must(lock(s)), 4000, rng));
    expect(s.phase).toBe('reveal');
    expect(override(s, 'p3', 'correct')).toEqual({ ok: false, error: 'wrong_phase' });
    expect(override(s, 'p1', 'wrong')).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('guess and hint follow the phase, pause and player rules', () => {
    const lobby = lobbyWith(makeQuiz([chain]), 'Олена');
    expect(guessWord(lobby, 'p1', 'Риба', 0)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(takeHint(lobby, 'p1', 0)).toEqual({ ok: false, error: 'wrong_phase' });
    const paused = must(pause(state, 1000));
    expect(guessWord(paused, 'p1', 'Риба', 1000)).toEqual({ ok: false, error: 'paused' });
    expect(takeHint(paused, 'p1', 1000)).toEqual({ ok: false, error: 'paused' });
    expect(guessWord(state, 'zz', 'Риба', 1000)).toEqual({ ok: false, error: 'not_found' });
    expect(takeHint(state, 'zz', 1000)).toEqual({ ok: false, error: 'not_found' });
    const plain = startRound(lobbyWith(makeQuiz([single]), 'Олена'), 0);
    expect(guessWord(plain, 'p1', 'Риба', 1000)).toEqual({ ok: false, error: 'type_mismatch' });
    expect(takeHint(plain, 'p1', 1000)).toEqual({ ok: false, error: 'type_mismatch' });
    const done = finish(state, 'p1', 2000);
    expect(guessWord(done, 'p1', 'Риба', 3000)).toEqual({ ok: false, error: 'already_answered' });
    expect(takeHint(done, 'p1', 3000)).toEqual({ ok: false, error: 'already_answered' });
  });

  it('a removed player leaves the chain progress', () => {
    const s = must(removePlayer(must(guessWord(state, 'p2', 'Риба', 1000)), 'p2'));
    expect(s.plays[0].chain?.p2).toBeUndefined();
  });
});
