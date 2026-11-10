import { describe, expect, it } from 'vitest';
import { TRUTH_QUESTION_PREFIX, truthText } from './truth';

describe('truth fact text (28b)', () => {
  it('a fact is trimmed and spaces collapse', () => {
    expect(truthText('  Я  був\nу Перу ')).toBe('Я був у Перу');
    expect(truthText('   ')).toBe('');
  });

  it('keeps the question id prefix', () => {
    expect(TRUTH_QUESTION_PREFIX).toBe('truth-');
  });
});
