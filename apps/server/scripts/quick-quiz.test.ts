import { quizSchema } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { quickQuiz } from './quick-quiz';

describe('quick seed quiz', () => {
  it('passes the schema and carries every new type', () => {
    const quiz = quickQuiz();
    const parsed = quizSchema.safeParse(quiz);
    expect(parsed.success ? 'ok' : JSON.stringify(parsed.error.issues.slice(0, 3))).toBe('ok');
    expect(quiz.rounds.map((r) => r.type)).toEqual(['classic', 'bets', 'auction', 'truth', 'puzzles']);
    const types = quiz.rounds.flatMap((r) => ('questions' in r ? r.questions.map((q) => q.type) : []));
    for (const type of ['moreless', 'timedlist', 'letterwords', 'wordladder', 'drawing', 'sudoku', 'crossword']) expect(types).toContain(type);
  });
});
