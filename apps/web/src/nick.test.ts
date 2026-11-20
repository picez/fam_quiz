import { DELETED_FACT, DELETED_NICKNAME } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { activateLocaleForTests } from './i18n';
import { deletedShown, nickText } from './nick';

describe('nickText', () => {
  it('shows the placeholder for a missing nickname', () => {
    expect(nickText(null)).toBe('Гравець');
    expect(nickText('')).toBe('Гравець');
    expect(nickText('Оля')).toBe('Оля');
  });
});

describe('the deleted-player marks (58)', () => {
  it('are stored in Ukrainian and shown in the active language', () => {
    activateLocaleForTests('en', { ui: { deletedPlayer: 'Deleted player', deletedFact: '(fact deleted)' } });
    try {
      expect(nickText(DELETED_NICKNAME)).toBe('Deleted player');
      const detail = { title: 'Гра', rows: [{ nickname: DELETED_NICKNAME, score: 5 }, { nickname: 'Оля', score: 3 }], truth: { author: DELETED_NICKNAME, question: { text: DELETED_FACT } } };
      expect(deletedShown(detail)).toEqual({ title: 'Гра', rows: [{ nickname: 'Deleted player', score: 5 }, { nickname: 'Оля', score: 3 }], truth: { author: 'Deleted player', question: { text: '(fact deleted)' } } });
      expect(detail.rows[0]!.nickname).toBe(DELETED_NICKNAME);
    } finally {
      activateLocaleForTests('uk');
    }
  });
});
