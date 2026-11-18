import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '@quiz/shared';
import { buffBlock } from './buffs';
import { setDebuff } from './debuffs';
import { end, lock, next, override, pause, recordOf, removePlayer, resume, start, submitAnswer, tick, type GameState } from './game';
import { scoreWordle, wordleGuess, wordleOf } from './wordle';
import { classicRound, makeQuiz, wordle, wordleQuiz } from './testing/fixtures';
import { FIRST_BUFFS } from './testing/buffs';
import { lobbyWith, must, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';

const NOUNS = ['сосна', 'посол', 'молот', 'сало', "м'ясо", 'хата'];
const isNoun = (k: string) => NOUNS.includes(k);
/** Ще три іменники з п'яти літер: для шести хибних спроб. */
const MORE = [...NOUNS, 'берег', 'ворон', 'гроза'];
const moreNouns = (k: string) => MORE.includes(k);
const players = ['Оля', 'Тарас', 'Петро'];
const fresh = (quiz = wordleQuiz()) => startRound(lobbyWith(quiz, ...players), 0);
const record = (s: GameState, id: string, index = 0) => recordOf(s, index, id);
const score = (s: GameState, id: string) => s.players.find((p) => p.id === id)?.score;

/** Послідовні спроби одного гравця в мить now. */
function guess(s: GameState, id: string, words: string[], now = 1000, check: (key: string) => boolean = isNoun): GameState {
  return words.reduce((current, word) => must(wordleGuess(current, id, word, now, check)), s);
}

/** Від першого запитання (закритого) до відкритого другого. */
function toSecond(s: GameState): GameState {
  let current = must(lock(s));
  while (!(current.phase === 'question' && current.questionIndex === 1)) current = must(next(current, 0));
  return current;
}

const SIX_MISSES = ['сосна', 'посол', 'молот', 'берег', 'ворон', 'гроза'];

describe('wordle', () => {
  it('a right guess on try N pays price × (7 − N) / 6', () => {
    let s = guess(fresh(), 'p1', ['колос']);
    expect(record(s, 'p1')).toMatchObject({
      answer: { type: 'wordle', guesses: ['колос'], tries: 1, solved: true },
      grade: 'correct',
      accepted: true,
      accuracy: 1,
      basePoints: 1000,
      points: 1000,
      streakBonus: 0,
      timeMs: 1000,
    });
    s = guess(s, 'p2', ['сосна', 'колос'], 2000);
    expect(record(s, 'p2')).toMatchObject({ answer: { tries: 2, solved: true }, points: 833 });
    expect(s.phase).toBe('question');
    s = guess(s, 'p3', ['сосна', 'посол', 'молот', 'колос'], 3000);
    expect(record(s, 'p3')).toMatchObject({ answer: { guesses: ['сосна', 'посол', 'молот', 'колос'], tries: 4, solved: true }, points: 500 });
    expect(s.phase).toBe('locked');
    expect([score(s, 'p1'), score(s, 'p2'), score(s, 'p3')]).toEqual([1000, 833, 500]);
  });

  it('the host word counts even outside the dictionary', () => {
    const s = guess(fresh(), 'p1', [' КОЛОС '], 1000, () => false);
    expect(record(s, 'p1')).toMatchObject({ answer: { guesses: ['колос'], solved: true }, points: 1000 });
  });

  it('bad guesses cost nothing', () => {
    const s = guess(fresh(), 'p1', ['сосна']);
    for (const [word, error] of [
      ['лампо', 'wordle_unknown'],
      ['сало', 'wordle_length'],
      ['kolos', 'wordle_word'],
      ['', 'wordle_word'],
      ['ко-лос', 'wordle_word'],
      ['сосна', 'wordle_repeat'],
      ['СОСНА', 'wordle_repeat'],
    ] as const) {
      expect(wordleGuess(s, 'p1', word, 1000, isNoun), word).toEqual({ ok: false, error });
    }
    expect(wordleOf(s, 'p1').guesses).toEqual(['сосна']);
    expect(wordleOf(s, 'p2')).toEqual({ guesses: [] });
    expect(s.plays[0].wordle).toEqual({ p1: { guesses: ['сосна'] } });
    // хибна спроба першою — гравця в play.wordle немає
    expect(wordleGuess(fresh(), 'p2', 'лампо', 1000, isNoun)).toEqual({ ok: false, error: 'wordle_unknown' });
  });

  it('six misses end the try', () => {
    let s = guess(fresh(), 'p1', SIX_MISSES.slice(0, 5), 1000, moreNouns);
    // хибні спроби між прийнятими не рахуються
    for (const word of ['лампо', 'сало', 'kolos', '', 'сосна']) expect(wordleGuess(s, 'p1', word, 1000, moreNouns).ok).toBe(false);
    expect(record(s, 'p1')).toBeUndefined();
    s = guess(s, 'p1', ['гроза'], 5000, moreNouns);
    expect(record(s, 'p1')).toMatchObject({
      answer: { type: 'wordle', guesses: SIX_MISSES, tries: 6, solved: false },
      grade: 'wrong',
      accepted: false,
      accuracy: 0,
      points: 0,
      timeMs: 5000,
    });
    expect(wordleGuess(s, 'p1', 'колос', 6000, moreNouns)).toEqual({ ok: false, error: 'already_answered' });
    // шоста — вгадана: бали за 6-ту спробу
    const last = guess(fresh(), 'p2', [...SIX_MISSES.slice(0, 5), 'колос'], 1000, moreNouns);
    expect(record(last, 'p2')).toMatchObject({ answer: { tries: 6, solved: true }, points: 167 });
  });

  it('the apostrophe is found by the dictionary', () => {
    const second = toSecond(fresh());
    expect(second.plays[1].question.type).toBe('wordle');
    for (const word of ['мясо', 'МЯСО', "м'ясо", 'м’ясо']) {
      const s = must(wordleGuess(second, 'p1', word, 1000, isNoun));
      expect(recordOf(s, 1, 'p1'), word).toMatchObject({ answer: { guesses: ["м'ясо"], tries: 1, solved: true }, points: 600 });
    }
    // без словника ціль усе одно знаходиться з апострофом
    const s = must(wordleGuess(second, 'p1', 'мясо', 1000, () => false));
    expect(recordOf(s, 1, 'p1')).toMatchObject({ answer: { solved: true } });
    // інший іменник з апострофом-кандидатом
    expect(wordleOf(must(wordleGuess(second, 'p2', 'хата', 1000, isNoun)), 'p2').guesses).toEqual(['хата']);
    expect(wordleGuess(second, 'p2', 'колос', 1000, isNoun)).toEqual({ ok: false, error: 'wordle_length' });
  });

  it('the same letters solve even when an earlier apostrophe candidate is also a noun; the history keeps the host spelling', () => {
    const second = toSecond(fresh());
    // Словник, де є і «мясо» (перший кандидат), і «м'ясо» (слово ведучого).
    const both = (k: string) => k === 'мясо' || isNoun(k);
    for (const word of ['мясо', "м'ясо", 'м’ясо']) {
      const s = must(wordleGuess(second, 'p1', word, 1000, both));
      expect(recordOf(s, 1, 'p1'), word).toMatchObject({ answer: { guesses: ["м'ясо"], tries: 1, solved: true }, points: 600 });
      expect(wordleOf(s, 'p1').guesses, word).toEqual(["м'ясо"]);
    }
  });

  it('time over gives 0', () => {
    const s = guess(fresh(), 'p1', ['сосна', 'посол']);
    expect(wordleGuess(s, 'p1', 'молот', 120_000, isNoun).ok).toBe(true);
    expect(wordleGuess(s, 'p1', 'молот', 120_001, isNoun)).toEqual({ ok: false, error: 'time_over' });
    const closed = tick(s, 120_001);
    expect(closed.phase).toBe('locked');
    expect(record(closed, 'p1')).toMatchObject({
      answer: { type: 'wordle', guesses: ['сосна', 'посол'], tries: 2, solved: false },
      grade: 'wrong',
      points: 0,
      timeMs: 120_000,
    });
    expect(record(closed, 'p2')).toBeUndefined();
    expect(record(closed, 'p3')).toBeUndefined();
  });

  it('the host closes or ends the round', () => {
    const s = guess(guess(fresh(), 'p1', ['сосна', 'посол']), 'p2', ['колос'], 2000);
    const locked = must(lock(s));
    expect(record(locked, 'p1')).toMatchObject({ answer: { tries: 2, solved: false }, grade: 'wrong', points: 0, timeMs: 120_000 });
    expect(record(locked, 'p2')).toMatchObject({ grade: 'correct', points: 1000 });
    expect(record(locked, 'p3')).toBeUndefined();

    const ended = must(end(s, 3000));
    expect(ended.phase).toBe('finished');
    expect(record(ended, 'p1')).toMatchObject({ grade: 'wrong', points: 0 });
    expect(record(ended, 'p2')).toMatchObject({ grade: 'correct', points: 1000 });
    expect([score(ended, 'p1'), score(ended, 'p2'), score(ended, 'p3')]).toEqual([0, 1000, 0]);
  });

  it('scoreWordle leaves other phases and questions alone', () => {
    const s = guess(fresh(), 'p1', ['сосна']);
    const locked = must(lock(s));
    expect(scoreWordle(locked)).toBe(locked);
    const other = startRound(lobbyWith(makeQuiz(), ...players), 0);
    expect(scoreWordle(other)).toBe(other);
  });

  it('multiplier counts, no speed, no minus, no streak', () => {
    const quiz = makeQuiz([wordle], { speedBonus: true, rules: { ...DEFAULT_RULES, multiplier: 2, penalty: 'minus' } });
    let s = guess(fresh(quiz), 'p1', ['сосна', 'колос'], 1000);
    s = guess(s, 'p2', ['посол', 'колос'], 100_000);
    s = guess(s, 'p3', ['молот'], 1000);
    s = must(lock(s));
    expect(record(s, 'p1')).toMatchObject({ points: 1667, basePoints: 1667, streakBonus: 0 });
    expect(record(s, 'p2')).toMatchObject({ points: 1667, basePoints: 1667, streakBonus: 0 });
    expect(record(s, 'p3')).toMatchObject({ points: 0, grade: 'wrong' });
    expect([score(s, 'p1'), score(s, 'p2'), score(s, 'p3')]).toEqual([1667, 1667, 0]);
  });

  it('override is refused', () => {
    const s = guess(fresh(), 'p1', ['колос']);
    expect(submitAnswer(s, 'p2', { type: 'text', value: 'колос' }, 1000)).toEqual({ ok: false, error: 'type_mismatch' });
    expect(submitAnswer(s, 'p2', { type: 'wordle', guesses: ['колос'], tries: 1, solved: true }, 1000)).toEqual({ ok: false, error: 'type_mismatch' });
    const locked = must(lock(s));
    expect(override(locked, 'p1', 'wrong')).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('teams guess as one', () => {
    let s = must(next(teamGame(teamQuiz([classicRound('r1', [wordle])]), [['Оля', 'Тарас'], ['Петро']]), 0));
    expect(s.phase).toBe('question');
    s = guess(s, 't1', ['сосна']);
    expect(Object.keys(s.plays[0].wordle ?? {})).toEqual(['t1']);
    s = guess(s, 't1', ['колос'], 2000);
    expect(record(s, 't1')).toMatchObject({ answer: { guesses: ['сосна', 'колос'], tries: 2 }, points: 833 });
    expect(score(must(lock(s)), 't1')).toBe(833);
    expect(wordleGuess(s, 'm1', 'посол', 2000, isNoun)).toEqual({ ok: false, error: 'not_found' });
  });

  it('a removed player leaves no progress', () => {
    const s = guess(guess(fresh(), 'p1', ['сосна']), 'p2', ['посол']);
    const removed = must(removePlayer(s, 'p2'));
    expect(removed.plays[0].wordle).toEqual({ p1: { guesses: ['сосна'] } });
    const locked = must(lock(removed));
    expect(record(locked, 'p2')).toBeUndefined();
    expect(record(locked, 'p1')).toMatchObject({ grade: 'wrong', points: 0 });
  });

  it('buffs are off, debuffs work', () => {
    const buffed = startRound(lobbyWith(wordleQuiz({ buffs: [...FIRST_BUFFS] }), ...players), 0);
    expect(buffBlock(buffed, 'p1', 'double')).toBe('off_wordle');
    const fogged = must(next(must(setDebuff(must(start(lobbyWith(wordleQuiz(), ...players))), 'p1', 'fog')), 0));
    expect(fogged.phase).toBe('question');
    expect(fogged.debuffs.p1).toMatchObject({ kind: 'fog', firedAt: 0 });
  });

  it('a pause stops guessing', () => {
    const paused = must(pause(fresh(), 10_000));
    expect(wordleGuess(paused, 'p1', 'сосна', 10_000, isNoun)).toEqual({ ok: false, error: 'paused' });
    // 110 с лишалося; продовження о 60 с — кінець о 170 с
    const resumed = must(resume(paused, 60_000));
    expect(wordleGuess(resumed, 'p1', 'сосна', 170_000, isNoun).ok).toBe(true);
    expect(wordleGuess(resumed, 'p1', 'сосна', 170_001, isNoun)).toEqual({ ok: false, error: 'time_over' });
    const s = guess(resumed, 'p1', ['колос'], 70_000);
    expect(record(s, 'p1')).toMatchObject({ points: 1000, timeMs: 20_000 });
  });

  it('refuses out of turn', () => {
    expect(wordleGuess(fresh(), 'p9', 'колос', 1000, isNoun)).toEqual({ ok: false, error: 'not_found' });
    const lobby = lobbyWith(wordleQuiz(), ...players);
    expect(wordleGuess(lobby, 'p1', 'колос', 0, isNoun)).toEqual({ ok: false, error: 'wrong_phase' });
    const plain = startRound(lobbyWith(makeQuiz(), ...players), 0);
    expect(wordleGuess(plain, 'p1', 'колос', 1000, isNoun)).toEqual({ ok: false, error: 'type_mismatch' });
  });
});
