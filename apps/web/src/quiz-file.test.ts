import { describe, expect, it } from 'vitest';
import { demoQuiz } from './demo-quiz';
import { parseQuizFile } from './quiz-file';

describe('parseQuizFile', () => {
  it('reads a valid quiz', () => {
    expect(parseQuizFile(JSON.stringify(demoQuiz))?.title).toBe(demoQuiz.title);
  });

  it('returns null for text that is not JSON', () => {
    expect(parseQuizFile('це не JSON')).toBeNull();
    expect(parseQuizFile('')).toBeNull();
  });

  it('returns null for JSON that is not a quiz', () => {
    expect(parseQuizFile('{"name":"package","version":"1.0.0"}')).toBeNull();
    expect(parseQuizFile('[1,2,3]')).toBeNull();
    expect(parseQuizFile(JSON.stringify({ ...demoQuiz, questions: [] }))).toBeNull();
  });
});
