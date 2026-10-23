import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type RoundRules } from '@quiz/shared';
import { pickCell } from './board';
import { lock, next, recordOf, start, submitAnswer, tick, type GameState } from './game';
import { sortOf, sortWord } from './sort';
import { blitzRound, boardRound, makeRoundsQuiz, single, sortQ, withId, withPoints } from './testing/fixtures';
import { acceptAll, lobbyWith, must, startRound } from './testing/helpers';

const rng = () => 0;
const q10 = withId(sortQ, 'q10');
const q11 = withId(sortQ, 'q11');

const head = (s: GameState, id: string) => sortOf(s, id).queue[0];
const right = (wordId: string) => sortQ.words.find((w) => w.id === wordId)?.categoryId ?? '';
const record = (s: GameState, id: string) => recordOf(s, s.questionIndex, id);
const streakOf = (s: GameState, id: string) => s.players.find((p) => p.id === id)?.streak;

/** count правильних ходів по голові черги (або всі, доки гравець не отримає запис). */
function sortSome(s: GameState, id: string, now: number, count = Infinity): GameState {
  let current = s;
  for (let i = 0; i < count && sortOf(current, id).queue.length > 0 && record(current, id) === undefined; i += 1) {
    const w = head(current, id);
    current = must(sortWord(current, id, w, right(w), now));
  }
  return current;
}

/** Поле з p1 «Анна» і p2 «Богдан» на етапі вибору клітинки. */
function onBoard(rules: Partial<RoundRules> = {}): GameState {
  const round = boardRound(
    'g1',
    [
      { title: 'Сортування', cells: [{ mark: 'x2', answerMode: 'phone', question: sortQ }, { answerMode: 'phone', question: q10 }] },
      { title: 'Інше', cells: [withPoints(withId(single, 's1'), 300)] },
    ],
    { rules: { ...DEFAULT_RULES, ...rules } },
  );
  return must(next(must(start(lobbyWith(makeRoundsQuiz([round], { leaderboard: 'end' }), 'Анна', 'Богдан'))), 0));
}

/** Бліц-раунд з p1 «Анна» і p2 «Богдан»; перше запитання відкрито о 1000. */
function inBlitz(questions = [sortQ], rules: Partial<Omit<RoundRules, 'partial'>> = {}): GameState {
  const round = blitzRound('b1', questions, { check: 'manual', rules: { ...DEFAULT_RULES, partial: null, ...rules } });
  return startRound(lobbyWith(makeRoundsQuiz([round], { leaderboard: 'end' }), 'Анна', 'Богдан'), 1000, rng);
}

describe('sort on the board', () => {
  it('board: only the chooser sorts, the cell multiplier applies and the price is ignored', () => {
    let s = must(pickCell(onBoard(), 'p1', 'q9', 1000, rng));
    expect(s.plays[0].board?.price).toBe(400);
    const w = head(s, 'p2');
    expect(sortWord(s, 'p2', w, right(w), 2000)).toEqual({ ok: false, error: 'not_your_turn' });
    s = sortSome(s, 'p1', 2000);
    expect(s.phase).toBe('reveal');
    expect(record(s, 'p1')).toMatchObject({ accepted: true, grade: 'correct', points: 800 });
    expect(record(s, 'p2')).toBeUndefined();
    expect(s.players.map((p) => p.score)).toEqual([800, 0]);
  });

  it('board: a partial sort earns its words and silence costs nothing even with the minus rule', () => {
    let s = must(pickCell(onBoard({ penalty: 'minus' }), 'p1', 'q9', 1000, rng));
    s = sortSome(s, 'p1', 2000, 2);
    s = must(next(must(lock(s)), 3000));
    expect(s.phase).toBe('reveal');
    expect(record(s, 'p1')).toMatchObject({ accepted: false, grade: 'partial', accuracy: 0.5, points: 400 });
    s = must(next(s, 4000));
    expect(s.phase).toBe('board');
    s = must(pickCell(s, 'p2', 'q10', 5000, rng));
    s = must(next(must(lock(s)), 6000));
    expect(s.phase).toBe('reveal');
    expect(record(s, 'p2')).toMatchObject({ accepted: false, grade: 'wrong', accuracy: 0, points: 0 });
    expect(s.players.map((p) => p.score)).toEqual([400, 0]);
  });

  it('board: a partial sort on a plain cell earns its words without the cell multiplier', () => {
    let s = must(pickCell(onBoard(), 'p1', 'q10', 1000, rng));
    s = sortSome(s, 'p1', 2000, 2);
    s = must(lock(s));
    expect(record(s, 'p1')).toMatchObject({ grade: 'partial', points: 200 });
  });
});

describe('sort in a blitz round', () => {
  it('blitz: the first to sort everything wins the sum of all words, the others get nothing', () => {
    let s = inBlitz([sortQ], { penalty: 'minus', multiplier: 2 });
    expect(s.plays[0].blitz).toBeUndefined();
    s = sortSome(s, 'p2', 1500, 1);
    s = sortSome(s, 'p1', 2000);
    expect(s.phase).toBe('locked');
    expect(record(s, 'p1')).toMatchObject({ accepted: true, grade: 'correct', points: 800 });
    expect(record(s, 'p2')).toMatchObject({ accepted: false, grade: 'wrong', accuracy: 0, points: 0 });
    expect(s.plays[0].blitz).toBeUndefined();
    expect(s.players.map((p) => p.score)).toEqual([800, 0]);
  });

  it('blitz: nobody wins when the time is over', () => {
    let s = inBlitz();
    s = sortSome(s, 'p1', 1500, 3);
    s = tick(s, 1000 + 20_000);
    expect(s.phase).toBe('locked');
    expect(record(s, 'p1')).toMatchObject({ accepted: false, grade: 'wrong', points: 0 });
    expect(record(s, 'p2')).toBeUndefined();
    expect(Object.values(s.plays[0].answers).some((r) => r.accepted)).toBe(false);
  });

  it('blitz: the plain answer events cannot answer a sort', () => {
    const s = inBlitz();
    expect(submitAnswer(s, 'p1', { type: 'sort', sorted: 4, total: 4, misses: 0, timeMs: 1 }, 1500)).toEqual({ ok: false, error: 'type_mismatch' });
  });

  it('blitz: silence on a sort keeps the streak, a lost sort breaks it', () => {
    const round = blitzRound('b1', [single, q10, q11], {
      check: 'auto',
      rules: { ...DEFAULT_RULES, partial: null, streak: { length: 2, bonus: { kind: 'fixed', value: 300 } } },
    });
    let s = startRound(lobbyWith(makeRoundsQuiz([round], { leaderboard: 'end' }), 'Анна', 'Богдан'), 1000, rng);
    s = acceptAll(must(submitAnswer(s, 'p2', { type: 'single', optionId: 'b' }, 1500)), 1500);
    expect(s.phase).toBe('locked');
    expect(streakOf(s, 'p2')).toBe(1);
    s = must(next(must(next(s, 2000)), 2000));
    expect(s.plays[1].question.type).toBe('sort');
    s = sortSome(s, 'p1', 3000);
    expect(s.phase).toBe('locked');
    expect(streakOf(s, 'p2')).toBe(1);
    expect(streakOf(s, 'p1')).toBe(1);
    s = must(next(must(next(s, 4000)), 4000));
    s = sortSome(s, 'p2', 5000, 1);
    s = sortSome(s, 'p1', 5000);
    expect(s.phase).toBe('locked');
    expect(streakOf(s, 'p2')).toBe(0);
    expect(streakOf(s, 'p1')).toBe(2);
    expect(record(s, 'p1')).toMatchObject({ streakBonus: 300 });
  });
});
