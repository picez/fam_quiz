import { describe, expect, it } from 'vitest';
import { allSpares, questionsOf, quizSchema, roundTrials, type Question, type Quiz } from '@quiz/shared';
import {
  boardRound,
  bool,
  classicRound,
  cloud,
  duels,
  finalRound,
  ladderQuestions,
  ladderRound,
  makeRoundsQuiz,
  questQuestions,
  questRound,
  single,
  single4,
  survivalQuestions,
  survivalRound,
  survivalTrials,
  surveyCloud,
  text,
  truthRound,
  withId,
} from '@quiz/engine/testing';
import { removalEffect, removalEffects, removeQuestion } from './quiz-remove';

/** Видаляє й перевіряє, що підсумок проходить схему. */
function remove(quiz: Quiz, id: string) {
  expect(quizSchema.safeParse(quiz).success).toBe(true);
  const result = removeQuestion(quiz, id);
  if (result.ok) expect(quizSchema.safeParse(result.quiz).success).toBe(true);
  return result;
}

const ok = (result: ReturnType<typeof removeQuestion>) => {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result;
};

/** Поле: categories категорій × cells клітинок з id `${c}${j}`. */
const board = (id: string, categories: number, cells: number) =>
  boardRound(
    id,
    Array.from({ length: categories }, (_, c) => ({
      title: `Категорія ${c + 1}`,
      cells: Array.from({ length: cells }, (_, j) => withId(single, `${id}-${c}-${j}`)),
    })),
  );

describe('removeQuestion', () => {
  const classic = makeRoundsQuiz([classicRound('r1', [withId(single, 'q1'), withId(bool, 'q2')]), classicRound('r2', [withId(text, 'q3')])]);

  it('removes one question of a classic round', () => {
    const result = ok(remove(classic, 'q1'));
    expect(result.effect).toBe('question');
    expect(result.quiz.rounds[0]!.type === 'classic' && result.quiz.rounds[0]!.questions.map((q) => q.id)).toEqual(['q2']);
    expect(removalEffect(classic, 'q1')).toBe('question');
  });

  it('removes a classic round left without questions', () => {
    const result = ok(remove(classic, 'q3'));
    expect(result.effect).toBe('round');
    expect(result.quiz.rounds.map((r) => r.id)).toEqual(['r1']);
  });

  it('keeps the last question of the quiz', () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [withId(single, 'q1')])]);
    expect(removeQuestion(quiz, 'q1')).toEqual({ ok: false, error: 'last_question' });
    expect(removalEffect(quiz, 'q1')).toBe('last_question');
  });

  it('a 4 × 4 board loses one cell', () => {
    const quiz = makeRoundsQuiz([board('g', 4, 4)]);
    const result = ok(remove(quiz, 'g-1-2'));
    expect(result.effect).toBe('question');
    const round = result.quiz.rounds[0]!;
    expect(round.type === 'board' && round.categories.map((c) => c.cells.length)).toEqual([4, 3, 4, 4]);
  });

  it('a 4 × 3 board loses the whole category', () => {
    const quiz = makeRoundsQuiz([board('g', 4, 3)]);
    const result = ok(remove(quiz, 'g-1-2'));
    expect(result.effect).toBe('category');
    const round = result.quiz.rounds[0]!;
    expect(round.type === 'board' && round.categories.map((c) => c.id)).toEqual(['c1', 'c3', 'c4']);
  });

  it('a 3 × 3 board next to a classic round goes whole', () => {
    const quiz = makeRoundsQuiz([board('g', 3, 3), classicRound('r2', [withId(text, 'q3')])]);
    const result = ok(remove(quiz, 'g-0-0'));
    expect(result.effect).toBe('round');
    expect(result.quiz.rounds.map((r) => r.id)).toEqual(['r2']);
  });

  it('a lone 3 × 3 board keeps its last cell set', () => {
    const quiz = makeRoundsQuiz([board('g', 3, 3)]);
    expect(remove(quiz, 'g-0-0')).toEqual({ ok: false, error: 'last_question' });
  });

  it('a category spare goes; the empty spares field goes with it', () => {
    const base = board('g', 3, 3);
    const round = { ...base, categories: base.categories.map((c, i) => (i === 0 ? { ...c, spares: [withId(text, 'cs1')] } : c)) };
    const quiz = makeRoundsQuiz([round]);
    const result = ok(remove(quiz, 'cs1'));
    expect(result.effect).toBe('question');
    const got = result.quiz.rounds[0]!;
    expect(got.type === 'board' && 'spares' in got.categories[0]!).toBe(false);
  });

  it('a six-step ladder loses a step with its level; safe steps shift', () => {
    const quiz = makeRoundsQuiz([
      ladderRound('m', [...ladderQuestions, withId(single4, 'l6')], { levels: [100, 200, 300, 1000, 3000, 10000], safe: [2, 4] }),
    ]);
    const result = ok(remove(quiz, 'l3'));
    expect(result.effect).toBe('question');
    const round = result.quiz.rounds[0]!;
    if (round.type !== 'ladder') throw new Error('ladder expected');
    expect(round.questions.map((q) => q.id)).toEqual(['l1', 'l2', 'l4', 'l5', 'l6']);
    expect(round.levels).toEqual([100, 200, 1000, 3000, 10000]);
    expect(round.safe).toEqual([3]);
  });

  it('a safe step that becomes the top one is dropped', () => {
    const quiz = makeRoundsQuiz([
      ladderRound('m', [...ladderQuestions, withId(single4, 'l6')], { levels: [100, 200, 300, 1000, 3000, 10000], safe: [1, 4] }),
    ]);
    const round = ok(remove(quiz, 'l6')).quiz.rounds[0]!;
    expect(round.type === 'ladder' && round.safe).toEqual([1]);
  });

  it('removing a quest question below the code length removes the round (29g)', () => {
    const four = questQuestions.slice(0, 4);
    const quiz = makeRoundsQuiz([questRound('m', four, { code: 'СОВА', order: [0, 1, 2, 3] }), classicRound('r2', [withId(text, 'q3')])]);
    const result = ok(remove(quiz, 'k1'));
    expect(result.effect).toBe('round');
    expect(result.quiz.rounds.map((r) => r.id)).toEqual(['r2']);
    const five = makeRoundsQuiz([questRound('m', questQuestions, { code: 'СОВА', order: [0, 1, 2, 3] }), classicRound('r2', [withId(text, 'q3')])]);
    const kept = ok(remove(five, 'k1'));
    expect(kept.effect).toBe('question');
    const round = kept.quiz.rounds[0]!;
    expect(round.type === 'quest' && round.questions.length).toBe(4);
  });

  it('a five-step ladder next to a classic round goes whole', () => {
    const quiz = makeRoundsQuiz([ladderRound('m'), classicRound('r2', [withId(text, 'q3')])]);
    const result = ok(remove(quiz, 'l2'));
    expect(result.effect).toBe('round');
    expect(result.quiz.rounds.map((r) => r.id)).toEqual(['r2']);
  });

  it('the final question takes the final round with it', () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [withId(single, 'q1')]), finalRound('f', withId(text, 'fq'))]);
    const result = ok(remove(quiz, 'fq'));
    expect(result.effect).toBe('round');
    expect(result.quiz.rounds.map((r) => r.id)).toEqual(['r1']);
  });

  it('a survival trial goes alone', () => {
    const quiz = makeRoundsQuiz([survivalRound('v', survivalQuestions, survivalTrials)]);
    const result = ok(remove(quiz, survivalTrials[0]!.id));
    expect(result.effect).toBe('question');
    const round = result.quiz.rounds[0]!;
    expect(round.type === 'survival' && round.trials.length).toBe(survivalTrials.length - 1);
  });

  it('a quiz spare goes; the empty spares field goes with it', () => {
    const quiz: Quiz = { ...makeRoundsQuiz([classicRound('r1', [withId(single, 'q1')])]), spares: [withId(text, 's1')] };
    const result = ok(remove(quiz, 's1'));
    expect(result.effect).toBe('question');
    expect('spares' in result.quiz).toBe(false);
  });

  it('a duel question or an unknown id is not found', () => {
    const quiz: Quiz = { ...makeRoundsQuiz([classicRound('r1', [withId(single, 'q1'), withId(bool, 'q2')])]), duels };
    const duelId = duels.categories[0]!.questions[0]!.id;
    expect(removeQuestion(quiz, duelId)).toEqual({ ok: false, error: 'not_found' });
    expect(removalEffect(quiz, duelId)).toBe('not_found');
    expect(removeQuestion(quiz, 'nope')).toEqual({ ok: false, error: 'not_found' });
  });
});

describe('removalEffects', () => {
  it('has a key for every round question, trial and spare, but none for duels', () => {
    const base = board('g', 3, 3);
    const boardWithSpare = { ...base, categories: base.categories.map((c, i) => (i === 0 ? { ...c, spares: [withId(text, 'cs1')] } : c)) };
    const quiz: Quiz = {
      ...makeRoundsQuiz([classicRound('r1', [withId(single, 'q1')]), boardWithSpare, survivalRound('v', survivalQuestions, survivalTrials)]),
      spares: [withId(text, 'sp1')],
      duels,
    };
    expect(quizSchema.safeParse(quiz).success).toBe(true);
    const effects = removalEffects(quiz);
    const ids = [...questionsOf(quiz), ...quiz.rounds.flatMap(roundTrials), ...allSpares(quiz)].map((q: Question) => q.id);
    expect(Object.keys(effects).sort()).toEqual([...ids].sort());
    for (const category of duels.categories) for (const q of category.questions) expect(effects[q.id]).toBeUndefined();
    expect(effects.q1).toBe('round');
    expect(effects['g-0-0']).toBe('round');
    expect(effects.t1).toBe('question');
  });
});

describe('removalEffect: locked when the rest fails the schema', () => {
  it('the last survival trial of a question-trial round', () => {
    const quiz = makeRoundsQuiz([survivalRound('v', survivalQuestions, [survivalTrials[0]!], { trial: 'question' })]);
    expect(quizSchema.safeParse(quiz).success).toBe(true);
    expect(removeQuestion(quiz, survivalTrials[0]!.id).ok).toBe(true);
    expect(removalEffect(quiz, survivalTrials[0]!.id)).toBe('locked');
    expect(removalEffects(quiz)[survivalTrials[0]!.id]).toBe('locked');
  });

  it('the last spare while the swap buff is on', () => {
    const quiz: Quiz = { ...makeRoundsQuiz([classicRound('r1', [withId(single, 'q1')])], { buffs: ['swap'] }), spares: [withId(text, 's1')] };
    expect(quizSchema.safeParse(quiz).success).toBe(true);
    expect(removalEffect(quiz, 's1')).toBe('locked');
  });

  it('a word cloud that a later survey reads from', () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [cloud, surveyCloud, withId(single, 'q1')])]);
    expect(quizSchema.safeParse(quiz).success).toBe(true);
    expect(removalEffect(quiz, cloud.id)).toBe('locked');
    expect(removalEffect(quiz, surveyCloud.id)).toBe('question');
  });
});

describe('player truth round (28b)', () => {
  it('has no questions to remove; removing from another round keeps it', () => {
    const quiz = makeRoundsQuiz([truthRound('t1'), classicRound('r1', [withId(single, 'q1'), withId(single, 'q2')])]);
    const result = remove(quiz, 'q1');
    expect(result).toMatchObject({ ok: true, effect: 'question' });
    if (result.ok) expect(result.quiz.rounds.map((r) => r.type)).toEqual(['truth', 'classic']);
    expect(remove(quiz, 'truth-0')).toEqual({ ok: false, error: 'not_found' });
    // останнє запитання вікторини лишається: сам раунд truth запитань не має
    expect(remove(makeRoundsQuiz([truthRound('t1'), classicRound('r1', [withId(single, 'q1')])]), 'q1')).toEqual({ ok: false, error: 'last_question' });
  });
});
