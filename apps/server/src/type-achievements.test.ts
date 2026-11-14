import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, type AchievementId, type Answer, type Question } from '@quiz/shared';
import { textAccepts, textMatches } from '@quiz/engine';
import { bool, crosswordFull, drawing, jigsaw, letterwordsRandom, match, melody, memory, moreless, multi, order, single, spotdiff, sudoku, text, timedlist, withId, wordladder } from '@quiz/engine/testing';
import type { AchievementGame, AchievementQuestion, AchievementRow } from './achievement-games';
import { gameAchievements, type AchievementWho } from './game-achievements';
import { fakeGame, OLYA_IN_TEAM, P, PETRO, q, range, row, SOLO, TEAM, teamGame, VIRA_IN_TEAM } from './testing/achievement-fixtures';
import { typeAchievements } from './type-achievements';

const has = (game: AchievementGame, id: AchievementId, who: AchievementWho = SOLO) => typeAchievements(game, who).has(id);

/** n запитань одного типу з рядками: answer(i) — payload і прийнятість i-го. */
function series(
  n: number,
  question: (i: number) => Question,
  answer: (i: number) => Partial<AchievementRow>,
  patch: (i: number) => Partial<AchievementQuestion> = () => ({}),
): Pick<AchievementGame, 'questions' | 'rows'> {
  return {
    questions: range(n).map((i) => q(i, { question: question(i), ...patch(i) })),
    rows: range(n).map((i) => row(i, answer(i))),
  };
}

const singles = (n: number, patch: (i: number) => Partial<AchievementQuestion> = () => ({})) =>
  series(n, (i) => withId(single, `s${i}`), () => ({ payload: { type: 'single', optionId: 'b' } }), patch);

describe('typeAchievements (33): simple question types', () => {
  it('single_ten: ten right main single answers outside blitz and truth', () => {
    expect(has(fakeGame(singles(10)), 'single_ten')).toBe(true);
    expect(has(fakeGame(singles(9)), 'single_ten')).toBe(false);
    expect(has(fakeGame(singles(10, (i) => (i === 0 ? { blitz: true } : {}))), 'single_ten')).toBe(false);
    const truth = singles(10, (i) => (i === 0 ? { roundType: 'truth', ref: { roundIndex: 0, questionId: 's0', truth: { question: single, author: 'm-x', authorName: 'Х', actor: 'p-x' } } } : {}));
    expect(has(fakeGame(truth), 'single_ten')).toBe(false);
    const spare = singles(10);
    spare.rows[0] = { ...spare.rows[0]!, spareId: 'sp1' };
    expect(has(fakeGame(spare), 'single_ten')).toBe(false);
    const missed = singles(10);
    missed.rows[3] = { ...missed.rows[3]!, accepted: false, points: 0 };
    expect(has(fakeGame(missed), 'single_ten')).toBe(false);
  });

  it('all_at_once: exactly all the right options, when there are at least 3', () => {
    const three = withId({ ...multi, options: [...multi.options, { id: 'e', text: 'Запоріжжя' }], correctIds: ['a', 'c', 'e'] }, 'm1');
    const game = (question: Question, optionIds: string[]) => fakeGame({ questions: [q(0, { question })], rows: [row(0, { payload: { type: 'multi', optionIds } })] });
    expect(has(game(three, ['e', 'a', 'c']), 'all_at_once')).toBe(true);
    expect(has(game(three, ['a', 'c']), 'all_at_once')).toBe(false);
    expect(has(game(three, ['a', 'c', 'e', 'b']), 'all_at_once')).toBe(false);
    expect(has(game(withId(multi, 'm2'), ['a', 'c']), 'all_at_once')).toBe(false);
  });

  it('not_a_coin: at least 6 true/false outside blitz, all right', () => {
    const booleans = (n: number, wrong = -1, patch: (i: number) => Partial<AchievementQuestion> = () => ({})) =>
      series(n, (i) => withId(bool, `b${i}`), (i) => ({ payload: { type: 'boolean', value: i !== wrong }, accepted: i !== wrong, points: i === wrong ? 0 : 100 }), patch);
    expect(has(fakeGame(booleans(6)), 'not_a_coin')).toBe(true);
    expect(has(fakeGame(booleans(7, 4)), 'not_a_coin')).toBe(false);
    expect(has(fakeGame(booleans(5)), 'not_a_coin')).toBe(false);
    expect(has(fakeGame(booleans(6, -1, (i) => (i === 0 ? { blitz: true } : {}))), 'not_a_coin')).toBe(false);
    // Бліц-запитання не рахується ні влучанням, ні промахом: сім, з них хибне — у бліці.
    expect(has(fakeGame(booleans(7, 0, (i) => (i === 0 ? { blitz: true } : {}))), 'not_a_coin')).toBe(true);
  });

  it('word_for_word: five exact text answers; a typo accepted by the typo budget does not count', () => {
    const odesa = (i: number) => withId(text, `t${i}`);
    expect(textAccepts(text.accepted, 'Одесса') && !textMatches(text.accepted, 'Одесса')).toBe(true);
    const exact = series(5, odesa, () => ({ payload: { type: 'text', value: 'одеса' } }));
    expect(has(fakeGame(exact), 'word_for_word')).toBe(true);
    const typo = series(5, odesa, (i) => ({ payload: { type: 'text', value: i === 2 ? 'Одесса' : 'Одеса' } }));
    expect(has(fakeGame(typo), 'word_for_word')).toBe(false);
    expect(has(fakeGame(series(4, odesa, () => ({ payload: { type: 'text', value: 'Одеса' } }))), 'word_for_word')).toBe(false);
  });

  it('in_order: the exact order of at least 5 items', () => {
    const five = withId({ ...order, items: [...order.items, { id: 'd', text: 'Донецьк' }] }, 'o1');
    const game = (question: Question, itemIds: string[]) => fakeGame({ questions: [q(0, { question })], rows: [row(0, { payload: { type: 'order', itemIds } })] });
    expect(has(game(five, ['u', 'l', 'k', 'h', 'd']), 'in_order')).toBe(true);
    expect(has(game(five, ['u', 'k', 'l', 'h', 'd']), 'in_order')).toBe(false);
    expect(has(game(withId(order, 'o2'), ['u', 'l', 'k', 'h']), 'in_order')).toBe(false);
  });

  it('pair_to_pair: all of at least 5 pairs right', () => {
    const pairs = (n: number) => range(n).map((i) => ({ left: { id: `l${i}`, text: `Л${i}` }, right: { id: `r${i}`, text: `П${i}` } }));
    const game = (n: number, links: { left: string; right: string }[]) =>
      fakeGame({ questions: [q(0, { question: withId({ ...match, pairs: pairs(n) }, 'mt') })], rows: [row(0, { payload: { type: 'match', links } })] });
    const right = (n: number) => range(n).map((i) => ({ left: `l${i}`, right: `r${i}` }));
    expect(has(game(5, right(5)), 'pair_to_pair')).toBe(true);
    expect(has(game(5, [...right(3), { left: 'l3', right: 'r4' }, { left: 'l4', right: 'r3' }]), 'pair_to_pair')).toBe(false);
    expect(has(game(5, right(4)), 'pair_to_pair')).toBe(false);
    expect(has(game(4, right(4)), 'pair_to_pair')).toBe(false);
  });

  it('short_path: finished in no more steps than the author', () => {
    const path = withId({ ...wordladder, path: ['поле', 'пола', 'пора', 'пара'] }, 'w1');
    const game = (steps: number, finished = true) =>
      fakeGame({ questions: [q(0, { question: path })], rows: [row(0, { payload: { type: 'wordladder', words: [], steps, finished } })] });
    expect(has(game(3), 'short_path')).toBe(true);
    expect(has(game(2), 'short_path')).toBe(true);
    expect(has(game(4), 'short_path')).toBe(false);
    expect(has(game(3, false), 'short_path')).toBe(false);
  });

  it('number_sense and mirror_logic: all comparisons right, or all of them backwards', () => {
    const game = (payload: Answer) => fakeGame({ questions: [q(0, { question: withId(moreless, 'ml') })], rows: [row(0, { payload, accepted: false })] });
    const picks = (n: number) => range(n).map(() => 'a' as const);
    expect(has(game({ type: 'moreless', picks: picks(5), right: 5, total: 5 }), 'number_sense')).toBe(true);
    expect(has(game({ type: 'moreless', picks: picks(5), right: 0, total: 5 }), 'mirror_logic')).toBe(true);
    expect(has(game({ type: 'moreless', picks: picks(5), right: 0, total: 5 }), 'number_sense')).toBe(false);
    const four = typeAchievements(game({ type: 'moreless', picks: picks(4), right: 4, total: 4 }), SOLO);
    expect(four.has('number_sense') || four.has('mirror_logic')).toBe(false);
    expect(has(game({ type: 'moreless', picks: picks(4), right: 0, total: 4 }), 'mirror_logic')).toBe(false);
    expect(has(game({ type: 'moreless', picks: picks(3), right: 0, total: 5 }), 'mirror_logic')).toBe(false);
  });

  it('teams: only the person who answered gets it; old team rows without answeredBy give nobody anything', () => {
    const answered = (by: string | null) => {
      const s = singles(10);
      return teamGame({ ...s, rows: s.rows.map((r) => ({ ...r, participantId: TEAM, answeredBy: by })) });
    };
    expect(has(answered('m-olya'), 'single_ten', OLYA_IN_TEAM)).toBe(true);
    expect(has(answered('m-olya'), 'single_ten', VIRA_IN_TEAM)).toBe(false);
    expect(has(answered(null), 'single_ten', OLYA_IN_TEAM)).toBe(false);
    expect(has(answered(null), 'single_ten', VIRA_IN_TEAM)).toBe(false);
  });

  it('an unfinished game gives nothing', () => {
    expect([...typeAchievements(fakeGame({ ...singles(10), status: 'running' }), SOLO)]).toEqual([]);
  });

  it('gameAchievements lists the new ids in catalogue order', () => {
    const s = singles(10);
    const booleans = range(6).map((i) => q(10 + i, { question: withId(bool, `b${i}`) }));
    const game = fakeGame({
      questions: [...s.questions, ...booleans],
      rows: [...s.rows, ...booleans.map((b) => row(b.index, { participantId: P, payload: { type: 'boolean', value: true } }))],
    });
    const got = gameAchievements(game, SOLO);
    expect(got).toEqual(expect.arrayContaining(['single_ten', 'not_a_coin']));
    expect(got).toEqual(ACHIEVEMENTS.filter((id) => got.includes(id)));
  });
});

describe('typeAchievements (33): team-wide and puzzle types', () => {
  const one = (question: Question, payload: Answer, patch: Partial<AchievementRow> = {}, ref: Partial<AchievementQuestion['ref']> = {}) =>
    fakeGame({ questions: [q(0, { question, ref: { roundIndex: 0, questionId: question.id, ...ref } })], rows: [row(0, { payload, ...patch })] });

  it('full_list: every item found; in a team game the whole team gets it', () => {
    const list = (found: number): Answer => ({ type: 'timedlist', found: range(found).map((i) => `l${i + 1}`), total: 8, wrong: 0 });
    expect(has(one(timedlist, list(8)), 'full_list')).toBe(true);
    expect(has(one(timedlist, list(7)), 'full_list')).toBe(false);
    const team = teamGame({ questions: [q(0, { question: timedlist })], rows: [row(0, { participantId: TEAM, payload: list(8) })] });
    expect(has(team, 'full_list', OLYA_IN_TEAM)).toBe(true);
    expect(has(team, 'full_list', VIRA_IN_TEAM)).toBe(true);
  });

  it('longest_word: a word as long as the longest possible one; an old game without the best words gives nothing', () => {
    const words = (longest: number): Answer => ({ type: 'letterwords', words: ['прапор'], longest });
    const best = { letterwords: { letters: [...'прапорщик'], best: ['ПРАПОР'] } };
    expect(has(one(letterwordsRandom, words(6), {}, best), 'longest_word')).toBe(true);
    expect(has(one(letterwordsRandom, words(5), {}, best), 'longest_word')).toBe(false);
    expect(has(one(letterwordsRandom, words(6)), 'longest_word')).toBe(false);
  });

  it('masterpiece and modern_art: the drawing everyone or nobody guessed, at least 2 could', () => {
    const drew = (guessed: number, could: number): Answer => ({ type: 'drawing', guess: null, drew: { guessed, could } });
    expect(has(one(drawing, drew(3, 3)), 'masterpiece')).toBe(true);
    expect(has(one(drawing, drew(0, 2)), 'modern_art')).toBe(true);
    expect(has(one(drawing, drew(0, 2)), 'masterpiece')).toBe(false);
    const single1 = typeAchievements(one(drawing, drew(1, 1)), SOLO);
    expect(single1.has('masterpiece') || single1.has('modern_art')).toBe(false);
    expect(has(one(drawing, drew(2, 3)), 'masterpiece')).toBe(false);
  });

  it('masterpiece in a team game: only the person whose nickname drew it; a removed drawer — nobody', () => {
    const team = (drawer: string) =>
      teamGame({
        questions: [q(0, { question: drawing, ref: { roundIndex: 0, questionId: drawing.id, drawing: { drawer, strokes: '' } } })],
        rows: [row(0, { participantId: TEAM, payload: { type: 'drawing', guess: null, drew: { guessed: 2, could: 2 } } })],
      });
    expect(has(team('Віра'), 'masterpiece', VIRA_IN_TEAM)).toBe(true);
    expect(has(team('Віра'), 'masterpiece', OLYA_IN_TEAM)).toBe(false);
    expect(has(team(''), 'masterpiece', VIRA_IN_TEAM)).toBe(false);
    expect(has(team(''), 'masterpiece', OLYA_IN_TEAM)).toBe(false);
  });

  it('quick_sketch: the first right guess when at least three guessed; a tie gives it to both', () => {
    const guess = (participantId: string, timeMs: number, accepted = true): AchievementRow =>
      row(0, { participantId, timeMs, accepted, payload: { type: 'drawing', guess: 'соняшник', drew: null } });
    const game = (rows: AchievementRow[]) => fakeGame({ questions: [q(0, { question: drawing })], rows });
    const three = game([guess(P, 4000), guess(PETRO, 6000), guess('p-ira', 3000, false)]);
    expect(has(three, 'quick_sketch')).toBe(true);
    expect(has(three, 'quick_sketch', { participantId: PETRO, personId: null })).toBe(false);
    const tie = game([guess(P, 4000), guess(PETRO, 4000), guess('p-ira', 9000)]);
    expect(has(tie, 'quick_sketch')).toBe(true);
    expect(has(tie, 'quick_sketch', { participantId: PETRO, personId: null })).toBe(true);
    expect(has(game([guess(P, 4000), guess(PETRO, 6000)]), 'quick_sketch')).toBe(false);
  });

  it('sudoku_first: solved first when at least two have a record', () => {
    const record = (participantId: string, timeMs: number, solved = true): AchievementRow =>
      row(0, { participantId, timeMs, accepted: solved, payload: { type: 'puzzle', kind: 'sudoku', grid: '', filled: 0, total: 0, solved, done: true } });
    const game = (rows: AchievementRow[]) => fakeGame({ questions: [q(0, { question: sudoku, roundType: 'puzzles' })], rows });
    const both = game([record(P, 40_000), record(PETRO, 60_000)]);
    expect(has(both, 'sudoku_first')).toBe(true);
    expect(has(both, 'sudoku_first', { participantId: PETRO, personId: null })).toBe(false);
    expect(has(game([record(P, 40_000), record(PETRO, 30_000, false)]), 'sudoku_first')).toBe(true);
    expect(has(game([record(P, 40_000)]), 'sudoku_first')).toBe(false);
  });

  it('crossword_full: the crossword solved', () => {
    const cross = (solved: boolean): Answer => ({ type: 'puzzle', kind: 'crossword', grid: '', filled: 0, total: 0, solved });
    expect(has(one(crosswordFull, cross(true)), 'crossword_full')).toBe(true);
    expect(has(one(crosswordFull, cross(false)), 'crossword_full')).toBe(false);
  });

  it('jigsaw_first and last_piece: in half the base time, or one piece short', () => {
    const piece = (patch: Partial<Extract<Answer, { type: 'jigsaw' }>>): Answer => ({ type: 'jigsaw', placed: 12, total: 12, done: true, timeMs: 59_000, ...patch });
    expect(jigsaw.timeLimit).toBe(120);
    expect(has(one(jigsaw, piece({})), 'jigsaw_first')).toBe(true);
    expect(has(one(jigsaw, piece({ timeMs: 61_000 })), 'jigsaw_first')).toBe(false);
    expect(has(one(jigsaw, piece({ timeMs: null })), 'jigsaw_first')).toBe(false);
    expect(has(one(jigsaw, piece({ done: false, placed: 11, timeMs: null })), 'last_piece')).toBe(true);
    expect(has(one(jigsaw, piece({ done: false, placed: 10, timeMs: null })), 'last_piece')).toBe(false);
    expect(has(one(jigsaw, piece({ done: false, placed: 2, total: 3, timeMs: null })), 'last_piece')).toBe(false);
  });

  it('spotdiff_all: all found in half the time', () => {
    expect(spotdiff.timeLimit).toBe(90);
    expect(has(one(spotdiff, { type: 'spotdiff', found: 3, total: 3, done: true, timeMs: 45_000 }), 'spotdiff_all')).toBe(true);
    expect(has(one(spotdiff, { type: 'spotdiff', found: 3, total: 3, done: true, timeMs: 46_000 }), 'spotdiff_all')).toBe(false);
    expect(has(one(spotdiff, { type: 'spotdiff', found: 2, total: 3, done: false, timeMs: null }), 'spotdiff_all')).toBe(false);
  });

  it('elephant_memory: all pairs in at most one and a half moves a pair', () => {
    const mem = (moves: number, done = true): Answer => ({ type: 'memory', pairs: done ? 6 : 5, total: 6, done, timeMs: 30_000, moves });
    expect(has(one(memory, mem(9)), 'elephant_memory')).toBe(true);
    expect(has(one(memory, mem(6)), 'elephant_memory')).toBe(true);
    expect(has(one(memory, mem(10)), 'elephant_memory')).toBe(false);
    expect(has(one(memory, mem(9, false)), 'elephant_memory')).toBe(false);
  });

  it('first_note: right with only the first piece open; an old record without heard gives nothing', () => {
    expect(has(one(melody, { type: 'melody', value: 'Щедрик', heard: 1 }), 'first_note')).toBe(true);
    expect(has(one(melody, { type: 'melody', value: 'Щедрик', heard: 2 }), 'first_note')).toBe(false);
    expect(has(one(melody, { type: 'melody', value: 'Щедрик' } as unknown as Answer), 'first_note')).toBe(false);
    expect(has(one(melody, { type: 'melody', value: 'Щедрик', heard: 1 }, { accepted: false, points: 0 }), 'first_note')).toBe(false);
  });
});
