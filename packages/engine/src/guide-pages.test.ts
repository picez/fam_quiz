import { describe, expect, it } from 'vitest';
import { GUIDE_TYPES_PER_PAGE, emptyBrief, guidePages, newcomersOn, roundBrief } from '@quiz/shared';
import { blitzRound, bool, boardRound, chain, classicRound, duels, finalRound, makeRoundsQuiz, match, multi, numeric, order, single, sortQ, text, withId } from './testing/fixtures';

const kinds = (quiz: Parameters<typeof guidePages>[0]) => guidePages(quiz).map((page) => page.kind);
const labelled = { ...order, topLabel: 'Найбільший', bottomLabel: 'Найменший' };

describe('guidePages', () => {
  it('a plain classic quiz: how to answer, its round and its types; no buffs, no duels', () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [single, withId(bool, 'q2')])], { debuffs: [] });
    expect(guidePages(quiz)).toEqual([
      { kind: 'phone' },
      { kind: 'rounds', rounds: [roundBrief(quiz.rounds[0])] },
      { kind: 'questions', types: [{ type: 'single', top: '' }, { type: 'boolean', top: '' }] },
    ]);
  });

  it('one item per kind of round in order of appearance: two classics are one, an instant and a button blitz are two, a bank final', () => {
    const quiz = makeRoundsQuiz(
      [
        classicRound('r1', [single]),
        blitzRound('b1', [withId(single, 'b1q')]),
        classicRound('r2', [withId(single, 'r2q')]),
        blitzRound('b2', [withId(single, 'b2q')], { check: 'manual' }),
        finalRound('f1', withId(single, 'fq'), { wagerMode: 'bank' }),
      ],
      { debuffs: [] },
    );
    const rounds = guidePages(quiz).find((page) => page.kind === 'rounds');
    expect(rounds?.kind === 'rounds' && rounds.rounds.map((b) => [b.type, b.instant, b.wagerMode])).toEqual([
      ['classic', false, null],
      ['blitz', true, null],
      ['blitz', false, null],
      ['final', false, 'bank'],
    ]);
  });

  it('a board round keeps its brief (dice, voice cells, blitz cells come from it)', () => {
    const cells = (p: string) => [withId(single, `${p}1`), { question: withId(single, `${p}2`), kind: 'blitz' as const }, { question: withId(single, `${p}3`), answerMode: 'voice' as const }];
    const quiz = makeRoundsQuiz([boardRound('g1', [{ title: 'A', cells: cells('a') }, { title: 'B', cells: cells('b') }, { title: 'C', cells: cells('c') }])], { debuffs: [] });
    const rounds = guidePages(quiz)[1];
    expect(rounds).toEqual({ kind: 'rounds', rounds: [{ ...emptyBrief('board'), blitzCells: true, answerModes: ['phone', 'voice'] }] });
  });

  it('question types in order of first appearance, the order label from the quiz, five per page', () => {
    const all = [single, withId(multi, 'm'), withId(bool, 'b'), withId(text, 't'), withId(numeric, 'n'), withId(order, 'o1'), withId(labelled, 'o2'), withId(match, 'p'), withId(chain, 'c'), withId(sortQ, 's')];
    const quiz = makeRoundsQuiz([classicRound('r1', all)], { debuffs: [] });
    const pages = guidePages(quiz).filter((page) => page.kind === 'questions');
    expect(pages.map((page) => page.kind === 'questions' && page.types.length)).toEqual([GUIDE_TYPES_PER_PAGE, 4]);
    const types = pages.flatMap((page) => (page.kind === 'questions' ? page.types : []));
    expect(types.map((x) => x.type)).toEqual(['single', 'multi', 'boolean', 'text', 'numeric', 'order', 'match', 'chain', 'sort']);
    // Перший порядок без підпису, другий — з ним: береться перший непорожній.
    expect(types.find((x) => x.type === 'order')?.top).toBe('Найбільший');
  });

  it('spares and duel questions do not add types', () => {
    const quiz = { ...makeRoundsQuiz([classicRound('r1', [single])], { debuffs: [] }), spares: [withId(numeric, 'sp1')], duels };
    const questions = guidePages(quiz).find((page) => page.kind === 'questions');
    expect(questions?.kind === 'questions' && questions.types.map((x) => x.type)).toEqual(['single']);
  });

  it('buffs and debuffs only when allowed; old settings allow all six debuffs', () => {
    const rounds = [classicRound('r1', [single])];
    expect(kinds(makeRoundsQuiz(rounds))).toEqual(['phone', 'rounds', 'questions', 'debuffs']);
    expect(guidePages(makeRoundsQuiz(rounds)).at(-1)).toEqual({ kind: 'debuffs', debuffs: ['shake', 'fog', 'freeze', 'mirror', 'guests', 'mud'] });
    expect(guidePages(makeRoundsQuiz(rounds, { debuffs: ['fog'], buffs: ['double', 'fifty'] })).slice(3)).toEqual([
      { kind: 'buffs', buffs: ['fifty', 'double'] },
      { kind: 'debuffs', debuffs: ['fog'] },
    ]);
  });

  it('duels when the quiz has a pool: after a third of the questions, questions per duel and the stake', () => {
    const quiz = { ...makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2'), withId(single, 'q3'), withId(single, 'q4')])], { debuffs: [] }), duels };
    expect(guidePages(quiz).at(-1)).toEqual({ kind: 'duels', after: 2, questions: duels.questionsPerDuel, stake: duels.stake });
  });

  it('newcomersOn reads the flag; absent is off', () => {
    expect(newcomersOn(makeRoundsQuiz([classicRound('r1', [single])]))).toBe(false);
    expect(newcomersOn(makeRoundsQuiz([classicRound('r1', [single])], { newcomers: true }))).toBe(true);
  });
});
