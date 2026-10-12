import { describe, expect, it } from 'vitest';
import { quizSchema } from '@quiz/shared';
import { demoQuiz } from './demo-quiz';

describe('demoQuiz', () => {
  it('is a valid quiz', () => {
    expect(quizSchema.safeParse(demoQuiz).success).toBe(true);
  });

  it('shows every question type', () => {
    const types = new Set(demoQuiz.questions.map((question) => question.type));
    expect([...types].sort()).toEqual(['boolean', 'multi', 'numeric', 'order', 'single', 'text']);
  });
});
