import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, type AchievementId, type Answer, type Question } from '@quiz/shared';
import { textAccepts, textMatches } from '@quiz/engine';
import { bool, match, moreless, multi, order, single, text, withId, wordladder } from '@quiz/engine/testing';
import type { AchievementGame, AchievementQuestion, AchievementRow } from './achievement-games';
import { gameAchievements, type AchievementWho } from './game-achievements';
import { fakeGame, OLYA_IN_TEAM, P, q, range, row, SOLO, TEAM, teamGame, VIRA_IN_TEAM } from './testing/achievement-fixtures';
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
