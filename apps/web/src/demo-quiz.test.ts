import { describe, expect, it } from 'vitest';
import { questionsOf, quizSchema } from '@quiz/shared';
import { demoQuiz } from './demo-quiz';

describe('demoQuiz', () => {
  it('is a valid quiz', () => {
    expect(quizSchema.safeParse(demoQuiz).success).toBe(true);
  });

  it('shows every question type', () => {
    const types = new Set(questionsOf(demoQuiz).map((question) => question.type));
    expect([...types].sort()).toEqual(['boolean', 'chain', 'match', 'multi', 'numeric', 'order', 'single', 'text']);
  });
});
