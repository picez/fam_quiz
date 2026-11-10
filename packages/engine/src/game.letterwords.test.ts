import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, LIMITS, type Question } from '@quiz/shared';
import { pickCell } from './board';
import { lock, next, override, pause, recordOf, removePlayer, setConnected, start, submitAnswer, tick, type GameState } from './game';
import { dealLetters, letterPoints, letterWord, letterWordsOf, lettersDue, scoreLetterWords } from './letterwords';
import { actorOf } from './team-act';
import { boardRound, classicRound, letterwords, letterwordsRandom, makeQuiz, makeRoundsQuiz, withPoints } from './testing/fixtures';
import { lobbyWith, lobbyWithSplash, must, openAt, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';

const nouns = new Set(['кіт', 'сік', 'рот', 'сом', 'морква', 'острів', 'ставок', 'матрос', 'ворс', 'сова', 'ґава', "м'ясо"]);
const isNoun = (key: string) => nouns.has(key);
const anyWord = () => true;

const PLAYERS = ['Олена', 'Тарас', 'Віра'];
const BEST = ['комісар', 'самотік'];
const RANDOM = [...'квітнесар'];

const fresh = (question: Question = letterwords, options: Parameters<typeof makeQuiz>[1] = {}, nicknames: string[] = PLAYERS) =>
  startRound(lobbyWith(makeQuiz([question], options), ...nicknames), 0);
/** Роздача, як її робить сервер: свій набір лишається, випадковий — RANDOM. */
function dealt(s: GameState): GameState {
  const due = lettersDue(s);
  if (due === null) throw new Error('nothing to deal');
  return dealLetters(s, { letters: due.letters ?? RANDOM, best: BEST, possible: 196 });
}
const record = (s: GameState, playerId: string) => recordOf(s, s.questionIndex, playerId);
const points = (s: GameState, playerId: string) => record(s, playerId)?.points;

/** Послідовні letterWord одного гравця (команди) в мить now. */
function add(s: GameState, id: string, words: string[], now = 1000, check: (key: string) => boolean = isNoun): GameState {
  return words.reduce((current, word) => {
    const result = letterWord(current, id, word, now, check);
    if (!result.ok) throw new Error(`letterWord ${word}: ${result.error}`);
    return result.state;
  }, s);
}

/** n різних трилітерних «слів» з набору «морквасті» (для словника () => true). */
function threes(n: number): string[] {
  const letters = [...'морквасті'];
  const out: string[] = [];
  for (const a of letters) for (const b of letters) for (const c of letters) if (a !== b && b !== c && a !== c && out.length < n) out.push(a + b + c);
  return out;
}

describe('letter words', () => {
  it("opening deals nothing but the host's letters", () => {
    const own = fresh();
    expect(own.plays[0].letterwords).toEqual({ letters: [...'морквасті'], best: null, possible: null, progress: {} });
    expect(lettersDue(own)).toEqual({ letters: [...'морквасті'] });
    const random = fresh(letterwordsRandom);
    expect(random.plays[0].letterwords).toEqual({ letters: null, best: null, possible: null, progress: {} });
    expect(lettersDue(random)).toEqual({ count: 9 });
    const s = dealt(random);
    expect(s.plays[0].letterwords).toEqual({ letters: RANDOM, best: BEST, possible: 196, progress: {} });
    expect(lettersDue(s)).toBeNull();
    expect(dealLetters(s, { letters: [...'морквасті'], best: [], possible: 0 })).toBe(s);
    // свій набір роздача не переписує
    expect(dealt(own).plays[0].letterwords?.letters).toEqual([...'морквасті']);
    // інше запитання нічого не чекає
    const other = startRound(lobbyWith(makeQuiz(), 'Олена'), 0);
    expect(lettersDue(other)).toBeNull();
    expect(dealLetters(other, { letters: RANDOM, best: BEST, possible: 1 })).toBe(other);
  });

  it('refusals come in order and a repeat costs nothing', () => {
    const raw = fresh();
    expect(letterWord(raw, 'p1', 'кіт', 1000, isNoun)).toEqual({ ok: false, error: 'not_started' });
    const s = dealt(raw);
    expect(letterWord(s, 'p1', 'abc', 1000, isNoun)).toEqual({ ok: false, error: 'word_unknown' });
    expect(letterWord(s, 'p1', 'ро', 1000, isNoun)).toEqual({ ok: false, error: 'letters_short' });
    expect(letterWord(s, 'p1', 'молоко', 1000, isNoun)).toEqual({ ok: false, error: 'letters_not_in_set' });
    // «ґ» і «г» — різні літери; у наборі немає жодної
    expect(letterWord(s, 'p1', 'ґава', 1000, isNoun)).toEqual({ ok: false, error: 'letters_not_in_set' });
    // одна «м» у наборі — «мама» не складається
    expect(letterWord(s, 'p1', 'мама', 1000, anyWord)).toEqual({ ok: false, error: 'letters_not_in_set' });
    // з набору, але не в словнику
    expect(letterWord(s, 'p1', 'ворк', 1000, isNoun)).toEqual({ ok: false, error: 'word_unknown' });
    const one = add(s, 'p1', ['КІТ']);
    expect(letterWordsOf(one, 'p1')).toEqual({ words: ['кіт'] });
    expect(letterWordsOf(one, 'p2')).toEqual({ words: [] });
    expect(letterWord(one, 'p1', ' кіт ', 1000, isNoun)).toEqual({ ok: false, error: 'letters_repeat' });
    // повтор іншого гравця — його власне слово
    expect(letterWordsOf(add(one, 'p2', ['кіт']), 'p2')).toEqual({ words: ['кіт'] });
    // слів не більше maxLetterWords
    const full = add(s, 'p1', threes(LIMITS.maxLetterWords), 1000, anyWord);
    expect(letterWordsOf(full, 'p1').words).toHaveLength(80);
    expect(letterWord(full, 'p1', 'морква', 1000, isNoun)).toEqual({ ok: false, error: 'letters_too_many' });
    // повтор лишається повтором і на межі
    expect(letterWord(full, 'p1', threes(1)[0], 1000, anyWord)).toEqual({ ok: false, error: 'letters_repeat' });
    // інші відмови
    const other = startRound(lobbyWith(makeQuiz(), 'Олена'), 0);
    expect(letterWord(other, 'p1', 'кіт', 1000, isNoun)).toEqual({ ok: false, error: 'type_mismatch' });
    expect(letterWord(s, 'p9', 'кіт', 1000, isNoun)).toEqual({ ok: false, error: 'not_found' });
    const paused = must(pause(s, 2000));
    expect(letterWord(paused, 'p1', 'кіт', 2000, isNoun)).toEqual({ ok: false, error: 'paused' });
    expect(letterWord(s, 'p1', 'кіт', 90_001, isNoun)).toEqual({ ok: false, error: 'time_over' });
    expect(letterWord(s, 'p1', 'кіт', 90_000, isNoun).ok).toBe(true);
    const splash = dealt(openAt(lobbyWithSplash(makeQuiz([letterwords]), 'Олена', 'Тарас'), 0));
    expect(splash.splash).not.toBeNull();
    expect(letterWord(splash, 'p1', 'кіт', 100, isNoun)).toEqual({ ok: false, error: 'not_started' });
    const locked = must(lock(one, 2000));
    expect(letterWord(locked, 'p1', 'сік', 2000, isNoun)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('an apostrophe takes no tile', () => {
    const s = dealt(fresh({ ...letterwords, set: { kind: 'fixed', letters: 'мясо' } }));
    expect(s.plays[0].letterwords?.letters).toEqual([...'мясо']);
    const moved = add(s, 'p1', ['м’ясо']);
    expect(letterWordsOf(moved, 'p1').words).toEqual(["м'ясо"]);
  });

  describe('scores per word, per letter and by the longest word', () => {
    function played(s: GameState): GameState {
      return add(add(dealt(s), 'p1', ['кіт', 'сік', 'морква']), 'p2', ['рот', 'сом']);
    }

    it('most words, per word', () => {
      const s = must(lock(played(fresh()), 5000));
      expect([points(s, 'p1'), points(s, 'p2')]).toEqual([60, 40]);
      expect(record(s, 'p3')).toBeUndefined();
      expect(record(s, 'p1')).toEqual({
        answer: { type: 'letterwords', words: ['кіт', 'сік', 'морква'], longest: 6 },
        timeMs: 90_000,
        accepted: true,
        accuracy: 3 / 196,
        grade: 'correct',
        basePoints: 60,
        streakBonus: 0,
        points: 60,
        overridden: false,
      });
      expect(s.players.find((p) => p.id === 'p1')?.score).toBe(60);
      expect(letterPoints(s, s.plays[0], ['кіт', 'морква'])).toBe(40);
      // не найкращий результат — «частково», без зарахування
      expect(record(s, 'p2')).toMatchObject({ grade: 'partial', accepted: false, points: 40 });
    });

    it('correct is the best result of all, a tie too; fewer words are partial; none is wrong', () => {
      const tie = add(add(add(dealt(fresh()), 'p1', ['кіт', 'сік']), 'p2', ['рот', 'сом']), 'p3', ['сова']);
      const s = must(lock(tie, 5000));
      expect(['p1', 'p2', 'p3'].map((id) => record(s, id)?.grade)).toEqual(['correct', 'correct', 'partial']);
      expect(['p1', 'p2', 'p3'].map((id) => record(s, id)?.accepted)).toEqual([true, true, false]);
      // за літеру: три трилітерні слова (9 літер) кращі за «морква» (6)
      const letters = add(add(dealt(fresh({ ...letterwords, per: 'letter', points: 10 })), 'p1', ['морква']), 'p2', ['кіт', 'сік', 'рот']);
      const byLetter = must(lock(letters, 5000));
      expect([record(byLetter, 'p1')?.grade, record(byLetter, 'p2')?.grade]).toEqual(['partial', 'correct']);
      // найдовше: одне шестилітерне краще за три трилітерні
      const longest = add(add(dealt(fresh({ ...letterwords, goal: 'longest', per: 'letter', points: 10 })), 'p1', ['морква']), 'p2', ['кіт', 'сік', 'рот']);
      const byLongest = must(lock(longest, 5000));
      expect([record(byLongest, 'p1')?.grade, record(byLongest, 'p2')?.grade]).toEqual(['correct', 'partial']);
    });

    it('points stop at the question price times the round multiplier', () => {
      // 20 за слово, стеля 10 слів = 200; 12 слів дали б 240
      const s = must(lock(add(dealt(fresh()), 'p1', threes(12), 1000, anyWord), 5000));
      expect(points(s, 'p1')).toBe(200);
      expect(letterPoints(s, s.plays[0], threes(12))).toBe(200);
      expect(letterPoints(s, s.plays[0], threes(9))).toBe(180);
      // за літеру 10, стеля 40 літер = 400; 15 трилітерних = 45 літер
      const perLetter = must(lock(add(dealt(fresh({ ...letterwords, per: 'letter', points: 10 })), 'p1', threes(15), 1000, anyWord), 5000));
      expect(points(perLetter, 'p1')).toBe(400);
      // множник раунду ×2 піднімає й стелю: 400
      const doubled = must(lock(add(dealt(fresh(letterwords, { rules: { ...DEFAULT_RULES, multiplier: 2 as const } })), 'p1', threes(12), 1000, anyWord), 5000));
      expect(points(doubled, 'p1')).toBe(400);
    });

    it('most words, per letter', () => {
      const s = must(lock(played(fresh({ ...letterwords, per: 'letter', points: 10 })), 5000));
      expect([points(s, 'p1'), points(s, 'p2')]).toEqual([120, 60]);
    });

    it('the longest word of each player', () => {
      const s = must(lock(played(fresh({ ...letterwords, goal: 'longest', per: 'letter', points: 10 })), 5000));
      expect([points(s, 'p1'), points(s, 'p2')]).toEqual([60, 30]);
      expect(record(s, 'p1')).toMatchObject({ accuracy: 6 / 7, grade: 'correct', accepted: true });
      expect(record(s, 'p2')).toMatchObject({ accuracy: 3 / 7 });
    });

    it('the round multiplier counts; speed, partial and the round minus change nothing', () => {
      const doubled = { rules: { ...DEFAULT_RULES, multiplier: 2 as const } };
      const s = must(lock(played(fresh(letterwords, doubled)), 5000));
      expect([points(s, 'p1'), points(s, 'p2')]).toEqual([120, 80]);
      const rules = { speedBonus: true, rules: { ...DEFAULT_RULES, penalty: 'minus' as const, partial: 50 } };
      const plain = must(lock(played(fresh(letterwords, rules)), 5000));
      expect([points(plain, 'p1'), points(plain, 'p2'), points(plain, 'p3')]).toEqual([60, 40, undefined]);
      expect(plain.players.find((p) => p.id === 'p3')?.score).toBe(0);
    });

    it('no possible words leave accuracy at 0', () => {
      const s = dealLetters(fresh(), { letters: [...'морквасті'], best: [], possible: 0 });
      const locked = must(lock(add(s, 'p1', ['кіт']), 5000));
      expect(record(locked, 'p1')).toMatchObject({ accuracy: 0, accepted: true, grade: 'correct', points: 20 });
      const longest = dealLetters(fresh({ ...letterwords, goal: 'longest', per: 'letter' }), { letters: [...'морквасті'], best: [], possible: 0 });
      expect(record(must(lock(add(longest, 'p1', ['кіт']), 5000)), 'p1')).toMatchObject({ accuracy: 0, points: 60 });
    });

    it('a late player plays and a removed player after the close keeps the others as scored', () => {
      const lobby = lobbyWith(makeQuiz([letterwords]), ...PLAYERS, 'Ігор');
      const away = must(setConnected(lobby, 'p4', false, 0));
      const open = dealt(must(setConnected(must(next(must(start(away)), 0)), 'p4', true, 500)));
      const s = must(lock(add(add(open, 'p4', ['сова']), 'p1', ['кіт']), 5000));
      expect([points(s, 'p1'), points(s, 'p4')]).toEqual([20, 20]);
      expect([record(s, 'p1')?.grade, record(s, 'p4')?.grade]).toEqual(['correct', 'correct']);
      const removed = must(removePlayer(s, 'p4'));
      expect(points(removed, 'p1')).toBe(20);
      expect(record(removed, 'p4')).toBeUndefined();
    });

    it('scoreLetterWords works only on an open letters question', () => {
      const s = played(fresh());
      const locked = must(lock(s, 5000));
      expect(scoreLetterWords(locked)).toBe(locked);
      const other = startRound(lobbyWith(makeQuiz(), 'Олена'), 0);
      expect(scoreLetterWords(other)).toBe(other);
    });
  });

  it('teammates fill one word list', () => {
    const LAYOUT = [
      ['Оля', 'Петро'],
      ['Віра', 'Ігор'],
    ];
    const longest = { ...letterwords, goal: 'longest' as const, per: 'letter' as const, points: 10 };
    const s = dealt(must(next(teamGame(teamQuiz([classicRound('r1', [longest])]), LAYOUT), 0)));
    expect(['m1', 'm2', 'm3', 'm4'].map((m) => actorOf(s, m, 'answer'))).toEqual([
      { ok: true, id: 't1' },
      { ok: true, id: 't1' },
      { ok: true, id: 't2' },
      { ok: true, id: 't2' },
    ]);
    // Оля «кіт», Петро «морква» — обидва за t1
    let t = add(s, 't1', ['кіт']);
    t = add(t, 't1', ['морква']);
    expect(t.plays[0].letterwords?.progress).toEqual({ t1: { words: ['кіт', 'морква'] } });
    // товариш повторює — повтор без кари
    expect(letterWord(t, 't1', 'кіт', 1000, isNoun)).toEqual({ ok: false, error: 'letters_repeat' });
    t = add(t, 't2', ['кіт']);
    const locked = must(lock(t, 5000));
    expect([points(locked, 't1'), points(locked, 't2')]).toEqual([60, 30]);
    expect([record(locked, 't1')?.grade, record(locked, 't2')?.grade]).toEqual(['correct', 'partial']);
  });

  it('on a board cell only the chooser plays and the cell mark multiplies', () => {
    const round = boardRound('b1', [{ title: 'Слова', cells: [{ mark: 'x3', answerMode: 'phone', question: letterwords }] }]);
    const lobby = must(next(must(start(lobbyWith(makeRoundsQuiz([round], { leaderboard: 'end' }), 'Олена', 'Тарас'))), 0));
    const s = dealt(must(pickCell(lobby, 'p1', 'q12', 0, () => 0)));
    expect(letterWord(s, 'p2', 'кіт', 1000, isNoun)).toEqual({ ok: false, error: 'not_your_turn' });
    const one = add(s, 'p1', ['кіт', 'сік']);
    expect(one.phase).toBe('question');
    const timed = tick(one, 90_001);
    expect(points(timed, 'p1')).toBe(120);
    expect(record(timed, 'p1')).toMatchObject({ grade: 'correct', accepted: true });
    expect(record(timed, 'p2')).toBeUndefined();
    // стеля з позначкою ×3: 10 слів × 20 × 3 = 600, а 12 слів дали б 720
    const many = tick(add(s, 'p1', threes(12), 1000, anyWord), 90_001);
    expect(points(many, 'p1')).toBe(600);
  });

  it('on a board cell with a minus the silent chooser gets a record with 0', () => {
    const round = boardRound('b1', [{ title: 'Слова', cells: [{ answerMode: 'phone', question: withPoints(letterwords, 20) }] }], {
      rules: { ...DEFAULT_RULES, penalty: 'minus' },
    });
    const lobby = must(next(must(start(lobbyWith(makeRoundsQuiz([round], { leaderboard: 'end' }), 'Олена', 'Тарас'))), 0));
    const s = dealt(must(pickCell(lobby, 'p1', 'q12', 0, () => 0)));
    const timed = tick(s, 90_001);
    expect(record(timed, 'p1')).toMatchObject({ points: 0, grade: 'wrong', accepted: false, answer: { type: 'letterwords', words: [], longest: 0 } });
    const revealed = must(next(timed, 91_000));
    expect(record(revealed, 'p1')).toMatchObject({ points: 0, grade: 'wrong' });
    expect(revealed.players.find((p) => p.id === 'p1')?.score).toBe(0);
  });

  it('the plain answer event and the host grade do not apply', () => {
    const s = dealt(fresh());
    expect(submitAnswer(s, 'p1', { type: 'letterwords', words: ['кіт'], longest: 3 }, 1000)).toEqual({ ok: false, error: 'type_mismatch' });
    expect(submitAnswer(s, 'p1', { type: 'text', value: 'кіт' }, 1000)).toEqual({ ok: false, error: 'type_mismatch' });
    const locked = must(lock(add(s, 'p1', ['кіт']), 2000));
    expect(override(locked, 'p1', 'correct')).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('removing a player drops their words', () => {
    const s = add(add(dealt(fresh()), 'p2', ['рот']), 'p1', ['кіт']);
    const removed = must(removePlayer(s, 'p2'));
    expect(removed.plays[0].letterwords).toEqual({ letters: [...'морквасті'], best: BEST, possible: 196, progress: { p1: { words: ['кіт'] } } });
  });
});
