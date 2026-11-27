import { describe, expect, it } from 'vitest';
import { isNewAccount } from './home-welcome';

describe('isNewAccount (78)', () => {
  it('is new only with no quizzes, no hosted and no played games', () => {
    expect(isNewAccount([], [], [])).toBe(true);
    expect(isNewAccount([{}], [], [])).toBe(false);
    expect(isNewAccount([], [{}], [])).toBe(false);
    expect(isNewAccount([], [], [{}])).toBe(false);
  });

  it('knows nothing when any request failed', () => {
    expect(isNewAccount(null, [], [])).toBe(false);
    expect(isNewAccount([], null, [])).toBe(false);
    expect(isNewAccount([], [], null)).toBe(false);
  });
});
