import { describe, expect, it } from 'vitest';
import { questionsOf, quizSchema } from '@quiz/shared';
import { demoQuiz } from './demo-quiz';

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
});
