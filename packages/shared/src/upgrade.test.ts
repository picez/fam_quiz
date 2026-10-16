import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, DEFAULT_SETTINGS, quizSchema, upgradeQuiz } from './index';

const single = {
  id: 'q1',
  type: 'single',
  text: 'Столиця України?',
  imageUrl: null,
  timeLimit: 20,
  points: 1000,
  options: [
    { id: 'a', text: 'Львів' },
    { id: 'b', text: 'Київ' },
  ],
  correctId: 'b',
};

describe('upgradeQuiz', () => {
  it('turns a quiz of the old format into one classic round with the same settings', () => {
    const old = {
      title: 'Географія',
      description: 'Опис',
      settings: { speedBonus: false, leaderboard: 'end', shuffleOptions: true },
      questions: [single],
    };
    const upgraded = upgradeQuiz(old);
    expect(upgraded).toEqual({
      title: 'Географія',
      description: 'Опис',
      settings: { leaderboard: 'end' },
      rounds: [
        {
          id: 'r1',
          type: 'classic',
          title: '',
          speedBonus: false,
          shuffleOptions: true,
          rules: DEFAULT_RULES,
          questions: [single],
        },
      ],
    });
    expect(quizSchema.safeParse(upgraded).success).toBe(true);
  });

  it('returns a quiz of the new format as it is', () => {
    const current = {
      title: 'Географія',
      description: '',
      settings: DEFAULT_SETTINGS,
      rounds: [
        { id: 'r1', type: 'classic', title: '', speedBonus: true, shuffleOptions: false, rules: DEFAULT_RULES, questions: [single] },
      ],
    };
    expect(upgradeQuiz(current)).toBe(current);
  });

  it('leaves anything that is not a quiz untouched', () => {
    expect(upgradeQuiz(null)).toBeNull();
    expect(upgradeQuiz('quiz')).toBe('quiz');
  });
});
