import { describe, expect, it } from 'vitest';
import { end, lock, next, override, pause, recordOf, removePlayer, resume, submitAnswer, type GameState } from './game';
import { sortOf, sortWord } from './sort';
import { makeQuiz, single } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { head, right, sortAll, toSort, wrong } from './testing/sort';

const rng = () => 0;

const record = (s: GameState, id: string) => recordOf(s, s.questionIndex, id);
const scores = (s: GameState) => s.players.map((p) => p.score);

describe('sort', () => {
  it('the word order is shuffled once and the same for everyone', () => {
    const s = toSort();
    expect([...s.presented].sort()).toEqual(['w1', 'w2', 'w3', 'w4']);
    expect(sortOf(s, 'p1').queue).toEqual(s.presented);
    expect(sortOf(s, 'p2').queue).toEqual(s.presented);
    expect(s.plays[0].sort).toBeUndefined();
  });

  it('a right move takes the next card and keeps no lock', () => {
    const w = head(toSort(), 'p1');
    const s = must(sortWord(toSort(), 'p1', w, right(w), 2000));
    expect(sortOf(s, 'p1')).toMatchObject({ sorted: [w], misses: 0, lockedUntil: null, missed: null });
    expect(sortOf(s, 'p1').queue).toHaveLength(3);
    expect(s.plays[0].sort?.p2).toBeUndefined();
  });

  it('a wrong move locks the player and sends the word to the end', () => {
    let s = toSort();
    const w = head(s, 'p1');
    s = must(sortWord(s, 'p1', w, wrong(w), 2000));
    expect(sortOf(s, 'p1')).toMatchObject({ sorted: [], misses: 1, lockedUntil: 5000, missed: w });
    expect(sortOf(s, 'p1').queue).toHaveLength(4);
    expect(sortOf(s, 'p1').queue.at(-1)).toBe(w);
    const next = head(s, 'p1');
    expect(sortWord(s, 'p1', next, right(next), 4999)).toEqual({ ok: false, error: 'sort_locked' });
    const after = must(sortWord(s, 'p1', next, right(next), 5000));
    expect(sortOf(after, 'p1')).toMatchObject({ sorted: [next], misses: 1, lockedUntil: null, missed: null });
  });

  it('a wrong move on the last word brings the same word back after the lock', () => {
    let s = toSort();
    for (let i = 0; i < 3; i += 1) {
      const w = head(s, 'p1');
      s = must(sortWord(s, 'p1', w, right(w), 2000));
    }
    const lastWord = head(s, 'p1');
    s = must(sortWord(s, 'p1', lastWord, wrong(lastWord), 3000));
    expect(sortOf(s, 'p1').queue).toEqual([lastWord]);
    s = must(sortWord(s, 'p1', lastWord, right(lastWord), 6000));
    expect(record(s, 'p1')).toMatchObject({ accepted: true, points: 400, answer: { type: 'sort', sorted: 4, total: 4, misses: 1, timeMs: 5000 } });
  });

  it('only the current card can be sorted', () => {
    const s = toSort();
    const [, second] = sortOf(s, 'p1').queue;
    expect(sortWord(s, 'p1', second, right(second), 2000)).toEqual({ ok: false, error: 'sort_stale' });
    const w = head(s, 'p1');
    expect(sortWord(s, 'p1', w, 'nope', 2000)).toEqual({ ok: false, error: 'not_found' });
    expect(sortWord(s, 'p9', w, right(w), 2000)).toEqual({ ok: false, error: 'not_found' });
    expect(sortWord(must(lock(s)), 'p1', w, right(w), 2000)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('a sorter who finished cannot move again', () => {
    const s = sortAll(toSort(), 'p1', 2000);
    expect(sortWord(s, 'p1', 'w1', 'c1', 3000)).toEqual({ ok: false, error: 'already_answered' });
  });

  it('a move on another question type is a type mismatch', () => {
    const s = startRound(lobbyWith(makeQuiz([single]), 'Анна'), 1000, rng);
    expect(sortWord(s, 'p1', 'a', 'b', 2000)).toEqual({ ok: false, error: 'type_mismatch' });
  });

  it('classic points: every sorted word, no minus, no speed bonus, the streak only for all words', () => {
    let s = toSort({ penalty: 'minus', streak: { length: 2, bonus: { kind: 'fixed', value: 100 } } }, true);
    s = sortAll(s, 'p1', 2000);
    expect(record(s, 'p1')).toMatchObject({
      accepted: true,
      accuracy: 1,
      grade: 'correct',
      points: 400,
      timeMs: 1000,
      answer: { type: 'sort', sorted: 4, total: 4, misses: 0, timeMs: 1000 },
    });
    const w = head(s, 'p2');
    s = must(sortWord(s, 'p2', w, right(w), 2000));
    const w2 = head(s, 'p2');
    s = must(sortWord(s, 'p2', w2, wrong(w2), 3000));
    s = must(lock(s));
    expect(record(s, 'p2')).toMatchObject({
      accepted: false,
      grade: 'partial',
      accuracy: 0.25,
      points: 100,
      timeMs: 20_000,
      answer: { type: 'sort', sorted: 1, total: 4, misses: 1, timeMs: null },
    });
    s = must(next(must(next(s, 4000, rng)), 5000, rng));
    expect(s.questionIndex).toBe(1);
    s = sortAll(s, 'p1', 6000);
    s = must(lock(s));
    expect(record(s, 'p1')).toMatchObject({ basePoints: 400, streakBonus: 100, points: 500 });
    expect(record(s, 'p2')).toBeUndefined();
    expect(scores(s)).toEqual([900, 100]);
  });

  it('a player who moved but sorted nothing gets a wrong record with zero', () => {
    let s = toSort({ penalty: 'minus' });
    const w = head(s, 'p2');
    s = must(sortWord(s, 'p2', w, wrong(w), 2000));
    s = must(lock(s));
    expect(record(s, 'p2')).toMatchObject({ accepted: false, grade: 'wrong', accuracy: 0, points: 0 });
    expect(record(s, 'p1')).toBeUndefined();
  });

  it('the question closes when every connected player sorted everything', () => {
    let s = sortAll(toSort(), 'p1', 2000);
    expect(s.phase).toBe('question');
    s = sortAll(s, 'p2', 3000);
    expect(s.phase).toBe('locked');
  });

  it('the round multiplier applies to sorted words', () => {
    const s = sortAll(toSort({ multiplier: 3 }), 'p1', 2000);
    expect(record(s, 'p1')?.points).toBe(1200);
  });

  it('a pause shifts the lock', () => {
    let s = toSort();
    const w = head(s, 'p1');
    s = must(sortWord(s, 'p1', w, wrong(w), 2000));
    s = must(pause(s, 3000));
    const n = head(s, 'p1');
    expect(sortWord(s, 'p1', n, right(n), 3500)).toEqual({ ok: false, error: 'paused' });
    s = must(resume(s, 10_000));
    expect(sortOf(s, 'p1').lockedUntil).toBe(12_000);
    expect(sortWord(s, 'p1', n, right(n), 11_000)).toEqual({ ok: false, error: 'sort_locked' });
    expect(sortWord(s, 'p1', n, right(n), 12_000).ok).toBe(true);
  });

  it('the time is over for moves after the timer', () => {
    const s = toSort();
    const w = head(s, 'p1');
    expect(sortWord(s, 'p1', w, right(w), 21_001)).toEqual({ ok: false, error: 'time_over' });
    expect(sortWord(s, 'p1', w, right(w), 21_000).ok).toBe(true);
  });

  it('the plain answer event cannot answer a sort', () => {
    const s = toSort();
    expect(submitAnswer(s, 'p1', { type: 'single', optionId: 'a' }, 2000)).toEqual({ ok: false, error: 'type_mismatch' });
    const plain = startRound(lobbyWith(makeQuiz([single]), 'Анна'), 1000, rng);
    const fake = { type: 'sort', sorted: 4, total: 4, misses: 0, timeMs: 1 } as const;
    expect(submitAnswer(plain, 'p1', fake, 2000)).toEqual({ ok: false, error: 'type_mismatch' });
    expect(submitAnswer(s, 'p1', fake, 2000)).toEqual({ ok: false, error: 'type_mismatch' });
  });

  it('the host cannot regrade a sort', () => {
    let s = sortAll(toSort(), 'p1', 2000);
    s = must(next(must(lock(s)), 3000, rng));
    expect(s.phase).toBe('reveal');
    expect(override(s, 'p1', 'wrong')).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('kicking a sorter drops the progress and may close the question', () => {
    let s = sortAll(toSort(), 'p1', 2000);
    const w = head(s, 'p2');
    s = must(sortWord(s, 'p2', w, right(w), 2000));
    expect(s.phase).toBe('question');
    s = must(removePlayer(s, 'p2'));
    expect(s.plays[0].sort).not.toHaveProperty('p2');
    expect(s.phase).toBe('locked');
  });

  it('ending the game mid-sort scores the partial sorters', () => {
    let s = toSort();
    const w = head(s, 'p2');
    s = must(sortWord(s, 'p2', w, right(w), 2000));
    s = must(end(s));
    expect(s.phase).toBe('finished');
    expect(recordOf(s, 0, 'p2')).toMatchObject({ points: 100, grade: 'partial' });
    expect(scores(s)).toEqual([0, 100]);
  });
});
