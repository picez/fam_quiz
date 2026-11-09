import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, LIMITS, type Question } from '@quiz/shared';
import { lock, override, pause, recordOf, removePlayer, submitAnswer, tick, type GameState } from './game';
import { ladderBack, ladderWord, wordLadderOf } from './wordladder';
import { makeQuiz, wordladder } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';

const NOUNS = new Set(['поле', 'пола', 'пора', 'пара', 'тара', 'кора', 'кара']);
const isNoun = (key: string) => NOUNS.has(key);
const players = ['Олена', 'Тарас', 'Віра'];
const fresh = (question: Question = wordladder, options: Parameters<typeof makeQuiz>[1] = {}, nicknames: string[] = players) =>
  startRound(lobbyWith(makeQuiz([question], options), ...nicknames), 0);
const record = (s: GameState, playerId: string) => recordOf(s, 0, playerId);

/** Послідовні ladderWord одного гравця в мить now. */
function walk(s: GameState, playerId: string, words: string[], now = 1000, check: (key: string) => boolean = isNoun): GameState {
  return words.reduce((current, word) => must(ladderWord(current, playerId, word, now, check)), s);
}

/** Шлях ведучого: 4 кроки. */
const HOST = ['пола', 'пора', 'пара', 'тара'];
/** Через кору: 5 кроків. */
const FIVE = ['пола', 'пора', 'кора', 'кара', 'тара'];
/** Туди-назад і через кору: 9 кроків. */
const NINE = ['пола', 'поле', 'пола', 'поле', 'пола', 'пора', 'кора', 'кара', 'тара'];

describe('word ladder', () => {
  it('accepts one changed letter and refuses the rest without changing state', () => {
    const s = must(ladderWord(fresh(), 'p1', 'ПОЛА', 1000, isNoun));
    expect(wordLadderOf(s, 'p1').words).toEqual(['пола']);
    expect(wordLadderOf(s, 'p2').words).toEqual([]);
    expect(s.plays[0].wordladder?.p2).toBeUndefined();
    for (const [word, error] of [
      ['пола', 'word_repeat'],
      // «пила» лише на одну літеру від «пола», але її немає ні в шляху, ні в словнику
      ['пила', 'word_unknown'],
      ['кіра', 'word_one_letter'],
      ['полем', 'word_one_letter'],
      ['поси', 'word_one_letter'],
      ['пофа', 'word_unknown'],
      ['pola', 'word_unknown'],
    ] as const) {
      const refused = ladderWord(s, 'p1', word, 1000, isNoun);
      expect(refused, word).toEqual({ ok: false, error });
    }
    expect(s.plays[0].wordladder).toEqual({ p1: { words: ['пола'] } });
    // від стартового слова: те саме слово — повтор, «пила» — дві літери від «поле»
    expect(ladderWord(fresh(), 'p1', ' Поле ', 1000, isNoun)).toEqual({ ok: false, error: 'word_repeat' });
    expect(ladderWord(fresh(), 'p1', 'пила', 1000, isNoun)).toEqual({ ok: false, error: 'word_one_letter' });
  });

  it('the host path is always accepted even when the dictionary lacks it', () => {
    const s = walk(fresh(), 'p1', HOST, 1000, () => false);
    expect(record(s, 'p1')).toMatchObject({ answer: { type: 'wordladder', words: HOST, steps: 4, finished: true }, accepted: true });
    expect(ladderWord(fresh(), 'p1', 'кора', 1000, () => false)).toEqual({ ok: false, error: 'word_one_letter' });
    expect(ladderWord(walk(fresh(), 'p1', ['пола', 'пора']), 'p1', 'кора', 1000, () => false)).toEqual({ ok: false, error: 'word_unknown' });
  });

  it('a decomposed letter and a typographic apostrophe are the same word', () => {
    const mint: Question = { ...wordladder, path: ["м'ята", "м'яти"] };
    const s = must(ladderWord(fresh(mint), 'p1', 'М’ЯТИ', 1000, () => false));
    expect(record(s, 'p1')).toMatchObject({ answer: { words: ["м'яти"], steps: 1, finished: true } });
    const grove: Question = { ...wordladder, path: ['гай', 'рай'] };
    const t = must(ladderWord(fresh(grove), 'p1', 'РАЙ', 1000, () => false));
    expect(record(t, 'p1')).toMatchObject({ answer: { words: ['рай'], finished: true } });
  });

  it('step back removes the last word; finishing fixes the result', () => {
    let s = walk(fresh(), 'p1', ['пола', 'пора', 'кора']);
    s = must(ladderBack(s, 'p1', 2000));
    expect(wordLadderOf(s, 'p1').words).toEqual(['пола', 'пора']);
    s = walk(s, 'p1', ['пара', 'тара'], 3000);
    expect(record(s, 'p1')).toMatchObject({
      answer: { type: 'wordladder', words: HOST, steps: 4, finished: true },
      timeMs: 3000,
      accepted: true,
      grade: 'correct',
      points: 0,
    });
    // назад до порожнього: гравця знову немає в play.wordladder
    const emptied = must(ladderBack(walk(fresh(), 'p2', ['пола']), 'p2', 2000));
    expect(emptied.plays[0].wordladder?.p2).toBeUndefined();
  });

  it('refuses moves after finishing, after time, on pause and an empty step back', () => {
    const done = walk(fresh(), 'p1', HOST);
    expect(ladderBack(done, 'p1', 2000)).toEqual({ ok: false, error: 'already_answered' });
    expect(ladderWord(done, 'p1', 'кара', 2000, isNoun)).toEqual({ ok: false, error: 'already_answered' });

    const playing = walk(fresh(), 'p2', ['пола']);
    expect(ladderWord(playing, 'p2', 'пора', 90_001, isNoun)).toEqual({ ok: false, error: 'time_over' });
    expect(ladderBack(playing, 'p2', 90_001)).toEqual({ ok: false, error: 'time_over' });
    expect(ladderWord(playing, 'p2', 'пора', 90_000, isNoun).ok).toBe(true);

    const paused = must(pause(playing, 2000));
    expect(ladderWord(paused, 'p2', 'пора', 2000, isNoun)).toEqual({ ok: false, error: 'paused' });
    expect(ladderBack(paused, 'p2', 2000)).toEqual({ ok: false, error: 'paused' });

    expect(ladderBack(fresh(), 'p1', 1000)).toEqual({ ok: false, error: 'word_none' });
    expect(ladderBack(must(ladderBack(playing, 'p2', 2000)), 'p2', 2000)).toEqual({ ok: false, error: 'word_none' });
    expect(ladderWord(fresh(), 'p9', 'пола', 1000, isNoun)).toEqual({ ok: false, error: 'not_found' });
  });

  it('stops at the word cap', () => {
    const words = Array.from({ length: LIMITS.maxWordLadderWords }, (_, i) => (i % 2 === 0 ? 'пола' : 'поле'));
    const s = walk(fresh(), 'p1', words);
    expect(wordLadderOf(s, 'p1').words).toHaveLength(40);
    expect(ladderWord(s, 'p1', words.length % 2 === 0 ? 'пола' : 'поле', 1000, isNoun)).toEqual({ ok: false, error: 'word_too_many' });
  });

  it('the question closes when every connected player has finished', () => {
    let s = walk(fresh(), 'p1', HOST);
    s = walk(s, 'p2', FIVE);
    s = walk(s, 'p3', ['пола', 'пора', 'пара']);
    expect(s.phase).toBe('question');
    expect(tick(s, 89_999).phase).toBe('question');
    expect(tick(s, 90_000).phase).toBe('locked');
    s = walk(s, 'p3', ['тара'], 2000);
    expect(s.phase).toBe('locked');
  });

  it("scores by the room's best finisher within the maximum", () => {
    let s = fresh(wordladder, {}, [...players, 'Галя']);
    s = walk(s, 'p1', HOST);
    s = walk(s, 'p2', FIVE);
    s = walk(s, 'p3', ['пола']);
    s = must(lock(s));
    expect(record(s, 'p1')).toMatchObject({ points: 500, accuracy: 1, grade: 'correct', accepted: true, streakBonus: 0 });
    expect(record(s, 'p2')).toMatchObject({ points: 400, accuracy: 0.8, grade: 'correct' });
    expect(record(s, 'p3')).toMatchObject({
      answer: { type: 'wordladder', words: ['пола'], steps: 1, finished: false },
      accepted: false,
      grade: 'wrong',
      points: 0,
      timeMs: 90_000,
    });
    expect(record(s, 'p4')).toBeUndefined();
    expect(s.players.map((p) => p.score)).toEqual([500, 400, 0, 0]);

    // двоє з 4 кроками — повна ціна обом
    const tied = must(lock(walk(walk(fresh(), 'p1', HOST), 'p2', HOST)));
    expect([record(tied, 'p1')?.points, record(tied, 'p2')?.points]).toEqual([500, 500]);

    // фінішер понад максимум не входить у best і отримує 0
    const alone = must(lock(walk(fresh(), 'p1', NINE)));
    expect(record(alone, 'p1')).toMatchObject({ answer: { steps: 9, finished: true }, grade: 'wrong', accepted: false, points: 0 });
    const over = must(lock(walk(walk(fresh(), 'p1', NINE), 'p2', FIVE)));
    expect(record(over, 'p1')).toMatchObject({ grade: 'wrong', points: 0 });
    expect(record(over, 'p2')).toMatchObject({ grade: 'correct', points: 500 });

    // ніхто не дійшов — 0 усім
    const nobody = must(lock(walk(walk(fresh(), 'p1', ['пола', 'пора']), 'p2', ['пола'])));
    expect(nobody.players.map((p) => p.score)).toEqual([0, 0, 0]);
    expect(record(nobody, 'p1')).toMatchObject({ accepted: false, points: 0 });

    // множник ×2 і округлення
    const doubled = fresh({ ...wordladder, points: 333 }, { rules: { ...DEFAULT_RULES, multiplier: 2 } });
    const twice = must(lock(walk(walk(doubled, 'p1', HOST), 'p2', FIVE)));
    expect([record(twice, 'p1')?.points, record(twice, 'p2')?.points]).toEqual([666, Math.round((666 * 4) / 5)]);
    expect(record(twice, 'p2')?.points).toBe(533);

    // швидкість, «частково» й мінус-штраф раунду балів не змінюють
    const strict = fresh(wordladder, { speedBonus: true, rules: { ...DEFAULT_RULES, partial: 50, penalty: 'minus' } });
    const ruled = must(lock(walk(walk(walk(strict, 'p1', HOST, 80_000), 'p2', FIVE, 1000), 'p3', ['пола'])));
    expect(ruled.players.map((p) => p.score)).toEqual([500, 400, 0]);
  });

  it('the plain answer event and the host grade do not apply', () => {
    const answer = { type: 'wordladder', words: HOST, steps: 4, finished: true } as const;
    expect(submitAnswer(fresh(), 'p1', answer, 1000)).toEqual({ ok: false, error: 'type_mismatch' });
    expect(submitAnswer(fresh(), 'p1', { type: 'text', value: 'тара' }, 1000)).toEqual({ ok: false, error: 'type_mismatch' });
    const locked = must(lock(walk(fresh(), 'p1', HOST)));
    expect(override(locked, 'p1', 'wrong')).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('removing a player drops their ladder', () => {
    const s = walk(walk(fresh(), 'p1', ['пола']), 'p2', ['пола', 'пора']);
    const removed = must(removePlayer(s, 'p2'));
    expect(Object.keys(removed.plays[0].wordladder ?? {})).toEqual(['p1']);
  });
});
