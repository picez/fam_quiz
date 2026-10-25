import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type BoardCell, type Question } from '@quiz/shared';
import { pickCell } from './board';
import { placeWager } from './final';
import { end, lock, next, override, pause, recordOf, removePlayer, resume, start, submitAnswer, type GameState } from './game';
import { lastSortMove, sortAudience, sortMarks, sortOf, sortSeq, sortWord, tiltRefusal } from './sort';
import { blitzRound, boardRound, classicRound, finalRound, makeQuiz, makeRoundsQuiz, single, sortQ } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { head, right, sortAll, toBoardSort, toSort, wrong } from './testing/sort';
import { teamGame, teamQuiz } from './testing/teams';

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

describe('sort per-word misses (11d)', () => {
  const playOf = (s: GameState) => s.plays[s.questionIndex];

  it('a miss counts on its word and remembers the zone it went to', () => {
    const w = head(toSort(), 'p1');
    const s = must(sortWord(toSort(), 'p1', w, wrong(w), 2000));
    expect(sortOf(s, 'p1')).toMatchObject({ wordMisses: { [w]: 1 }, missedInto: wrong(w) });
  });

  it('a right move after the lock drops the zone and keeps the count', () => {
    let s = toSort();
    const w = head(s, 'p1');
    s = must(sortWord(s, 'p1', w, wrong(w), 2000));
    const n = head(s, 'p1');
    s = must(sortWord(s, 'p1', n, right(n), 5000));
    expect('missedInto' in sortOf(s, 'p1')).toBe(false);
    expect(sortOf(s, 'p1').wordMisses).toEqual({ [w]: 1 });
  });

  it('a second miss on the same word counts to 2', () => {
    let s = toSort();
    const w = head(s, 'p1');
    s = must(sortWord(s, 'p1', w, wrong(w), 2000));
    for (let i = 0; i < 3; i += 1) {
      const n = head(s, 'p1');
      s = must(sortWord(s, 'p1', n, right(n), 5000));
    }
    expect(head(s, 'p1')).toBe(w);
    s = must(sortWord(s, 'p1', w, wrong(w), 6000));
    expect(sortOf(s, 'p1').wordMisses?.[w]).toBe(2);
    expect(sortOf(s, 'p1').misses).toBe(2);
  });

  it('sortSeq counts right moves and misses', () => {
    let s = toSort();
    expect(sortSeq(sortOf(s, 'p1'))).toBe(0);
    const w = head(s, 'p1');
    s = must(sortWord(s, 'p1', w, wrong(w), 2000));
    const n = head(s, 'p1');
    s = must(sortWord(s, 'p1', n, right(n), 5000));
    expect(sortSeq(sortOf(s, 'p1'))).toBe(2);
  });

  it('lastSortMove: none, a hit, a miss, and a miss without a zone (version 11)', () => {
    let s = toSort();
    expect(lastSortMove(sortQ, sortOf(s, 'p1'))).toBeNull();
    const first = head(s, 'p1');
    s = must(sortWord(s, 'p1', first, right(first), 2000));
    expect(lastSortMove(sortQ, sortOf(s, 'p1'))).toEqual({ wordId: first, to: right(first), hit: true });
    const w = head(s, 'p1');
    s = must(sortWord(s, 'p1', w, wrong(w), 3000));
    expect(lastSortMove(sortQ, sortOf(s, 'p1'))).toEqual({ wordId: w, to: wrong(w), hit: false });
    const { missedInto: _zone, ...old } = sortOf(s, 'p1');
    expect(lastSortMove(sortQ, old)).toBeNull();
  });

  it('sortMarks: a missed word still in the queue and the words not reached are late; sorted words have no mark', () => {
    let s = toSort();
    const w = head(s, 'p1');
    s = must(sortWord(s, 'p1', w, wrong(w), 2000));
    for (let i = 0; i < 2; i += 1) {
      const n = head(s, 'p1');
      s = must(sortWord(s, 'p1', n, right(n), 5000));
    }
    const progress = sortOf(s, 'p1');
    const expected = sortQ.words
      .map((word) => word.id)
      .filter((id) => progress.queue.includes(id))
      .map((id) => ({ wordId: id, misses: id === w ? 1 : 0, late: true }));
    expect(expected).toHaveLength(2);
    expect(sortMarks(sortQ, progress, false)).toEqual(expected);
  });

  it('sortMarks: all sorted after a miss leaves only the miss mark', () => {
    let s = toSort();
    const w = head(s, 'p1');
    s = must(sortWord(s, 'p1', w, wrong(w), 2000));
    s = sortAll(s, 'p1', 5000);
    expect(record(s, 'p1')?.accepted).toBe(true);
    expect(sortMarks(sortQ, sortOf(s, 'p1'), true)).toEqual([{ wordId: w, misses: 1, late: false }]);
  });

  it('sortMarks: an incomplete count shows no ✗N; no moves makes every word late', () => {
    const s = toSort();
    const progress = { ...sortOf(s, 'p1'), queue: ['w1'], sorted: ['w2', 'w3', 'w4'], misses: 2, wordMisses: { w1: 1 } };
    expect(sortMarks(sortQ, progress, false)).toEqual([{ wordId: 'w1', misses: 0, late: true }]);
    expect(sortMarks(sortQ, sortOf(s, 'p1'), false)).toEqual(sortQ.words.map((word) => ({ wordId: word.id, misses: 0, late: true })));
  });

  it('sortAudience: a normal board cell for all, a team for its captain, nowhere when everyone sorts at once', () => {
    const classic = toSort();
    expect(sortAudience(classic, playOf(classic))).toBeNull();

    const boardOf = (cells: (Partial<BoardCell> & { question: Question })[]) =>
      must(next(must(start(lobbyWith(makeRoundsQuiz([boardRound('g1', [{ title: 'Сортування', cells }])], { leaderboard: 'end' }), 'Анна', 'Богдан'))), 0));
    const normal = must(pickCell(boardOf([{ answerMode: 'phone', question: sortQ }]), 'p1', 'q9', 1000, rng));
    expect(sortAudience(normal, playOf(normal))).toBe('all');
    const blitzCell = must(pickCell(boardOf([{ answerMode: 'phone', kind: 'blitz', question: sortQ }]), 'p1', 'q9', 1000, rng));
    expect(playOf(blitzCell).board?.kind).toBe('blitz');
    expect(sortAudience(blitzCell, playOf(blitzCell))).toBeNull();

    const blitz = startRound(
      lobbyWith(makeRoundsQuiz([blitzRound('b1', [sortQ], { check: 'manual', rules: { ...DEFAULT_RULES, partial: null } })]), 'Анна', 'Богдан'),
      1000,
      rng,
    );
    expect(sortAudience(blitz, playOf(blitz))).toBeNull();

    let final = must(start(lobbyWith(makeRoundsQuiz([finalRound('f', sortQ)], { leaderboard: 'end' }), 'Анна', 'Богдан')));
    while (final.phase !== 'wager') final = must(next(final, 0, rng));
    final = must(placeWager(must(placeWager(final, 'p1', 0, 1000, rng)), 'p2', 0, 2000, rng));
    expect(final.phase).toBe('question');
    expect(sortAudience(final, playOf(final))).toBeNull();

    const layout = [
      ['Оля', 'Петро'],
      ['Іра', 'Марко'],
    ];
    let team = teamGame(teamQuiz([classicRound('r1', [sortQ])]), layout);
    while (team.phase !== 'question') team = must(next(team, 1000, rng));
    expect(sortAudience(team, playOf(team))).toBe('team');

    let teamBoard = teamGame(teamQuiz([boardRound('g1', [{ title: 'Сортування', cells: [{ answerMode: 'phone', question: sortQ }] }])]), layout);
    teamBoard = must(pickCell(must(next(teamBoard, 0, rng)), 't1', 'q9', 1000, rng));
    expect(sortAudience(teamBoard, playOf(teamBoard))).toBe('all');
  });
});

describe('tilt rules (11d)', () => {
  it('classic: everyone sorts at once, so nobody may tilt', () => {
    const s = toSort();
    expect(tiltRefusal(s, 'p1', head(s, 'p1'), 'c1', 2000)).toBe('wrong_phase');
  });

  it('a board cell: the chooser tilts the head card toward a category or releases it', () => {
    const s = toBoardSort();
    const w = head(s, 'p1');
    expect(tiltRefusal(s, 'p1', w, 'c1', 2000)).toBeNull();
    expect(tiltRefusal(s, 'p1', w, null, 2000)).toBeNull();
    expect(tiltRefusal(s, 'p1', sortOf(s, 'p1').queue[1], 'c1', 2000)).toBe('sort_stale');
    expect(tiltRefusal(s, 'p1', w, 'nope', 2000)).toBe('not_found');
    expect(tiltRefusal(s, 'p2', w, 'c1', 2000)).toBe('not_your_turn');
    expect(tiltRefusal(must(pause(s, 1500)), 'p1', w, 'c1', 2000)).toBe('paused');
    expect(tiltRefusal(must(lock(s)), 'p1', w, 'c1', 2000)).toBe('wrong_phase');
  });

  it('a board cell: refused during the lock and after the record', () => {
    const s = toBoardSort();
    const w = head(s, 'p1');
    const missed = must(sortWord(s, 'p1', w, wrong(w), 2000));
    expect(tiltRefusal(missed, 'p1', head(missed, 'p1'), 'c1', 2100)).toBe('sort_locked');
    const done = sortAll(s, 'p1', 2000);
    expect(record(done, 'p1')?.accepted).toBe(true);
    // Останнє слово на полі одразу розкриває оцінку; запис перевіряємо на етапі question до розкриття.
    const play = s.plays[s.questionIndex];
    const recorded: GameState = {
      ...s,
      plays: s.plays.map((p, i) => (i === s.questionIndex ? { ...play, answers: { ...play.answers, p1: done.plays[done.questionIndex].answers.p1 } } : p)),
    };
    expect(tiltRefusal(recorded, 'p1', w, 'c1', 2000)).toBe('already_answered');
  });

  it('team play: the team sorts in a classic round and may tilt', () => {
    let team = teamGame(teamQuiz([classicRound('r1', [sortQ])]), [
      ['Оля', 'Петро'],
      ['Іра', 'Марко'],
    ]);
    while (team.phase !== 'question') team = must(next(team, 1000, rng));
    expect(tiltRefusal(team, 't1', head(team, 't1'), 'c1', 2000)).toBeNull();
  });
});
