import { describe, expect, it } from 'vitest';
import { questionsOf, quizSchema } from '@quiz/shared';
import { demoQuiz } from './demo-quiz';
import { partyQuiz } from './party-quiz';
import { movieQuiz } from './movie-quiz';
import { eruditeQuiz } from './erudite-quiz';

describe('the seeded demo quiz', () => {
  it('is valid and shows every question type including pairs', () => {
    expect(quizSchema.safeParse(demoQuiz).success).toBe(true);
    const questions = questionsOf(demoQuiz);
    expect(new Set(questions.map((q) => q.type)).has('match')).toBe(true);
    for (const question of questions) {
      if (question.type !== 'match') continue;
      for (const pair of question.pairs) expect(pair.right.id).not.toBe(pair.left.id.replace('l', 'r'));
    }
  });

  it('has the owner chain in the warm-up round', () => {
    const chain = questionsOf({ ...demoQuiz, rounds: [demoQuiz.rounds[0]] }).find((q) => q.type === 'chain');
    expect(chain?.type === 'chain' && [chain.words[0], chain.words.at(-1)]).toEqual(['Форель', 'Літак']);
    expect(quizSchema.safeParse(demoQuiz).success).toBe(true);
  });

  it('has a video question in the classic and the blitz round', () => {
    const rounds = demoQuiz.rounds.filter((r) => questionsOf({ ...demoQuiz, rounds: [r] }).some((q) => q.video !== null));
    expect(rounds.map((r) => r.type).sort()).toEqual(['blitz', 'classic']);
    expect(questionsOf(demoQuiz).filter((q) => q.video !== null).length).toBeGreaterThanOrEqual(2);
    expect(questionsOf(partyQuiz()).filter((q) => q.video !== null).length).toBeGreaterThanOrEqual(1);
    expect(quizSchema.safeParse(partyQuiz()).success).toBe(true);
  });

  it('ends with a final round', () => {
    const last = demoQuiz.rounds[demoQuiz.rounds.length - 1];
    expect(last.type).toBe('final');
    expect(last.title).toBe('Фінал: Космос');
    expect(quizSchema.safeParse(demoQuiz).success).toBe(true);
  });

  it('the movie quiz is valid and covers every round type and the five films', () => {
    expect(quizSchema.safeParse(movieQuiz).success).toBe(true);
    expect(movieQuiz.rounds.map((r) => r.type)).toEqual(['classic', 'blitz', 'board', 'final']);
    const types = new Set(questionsOf(movieQuiz).map((q) => q.type));
    for (const type of ['single', 'multi', 'boolean', 'text', 'numeric', 'order', 'match', 'chain']) expect(types.has(type as never)).toBe(true);
    const board = movieQuiz.rounds.find((r) => r.type === 'board');
    expect(board?.type === 'board' && board.categories.length).toBe(5);
  });

  it('the erudite quiz is valid, has every question and round type and twelve themes', () => {
    const parsed = quizSchema.safeParse(eruditeQuiz);
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(new Set(eruditeQuiz.rounds.map((r) => r.type))).toEqual(new Set(['classic', 'board', 'blitz', 'final']));
    const questions = questionsOf(eruditeQuiz);
    const types = new Set(questions.map((q) => q.type));
    for (const type of ['single', 'multi', 'boolean', 'text', 'numeric', 'order', 'match', 'chain']) expect(types.has(type as never)).toBe(true);
    expect(questions.some((q) => q.video !== null)).toBe(true);
    const categories = eruditeQuiz.rounds.flatMap((r) => (r.type === 'board' ? r.categories : []));
    expect(categories).toHaveLength(12);
  });
});
