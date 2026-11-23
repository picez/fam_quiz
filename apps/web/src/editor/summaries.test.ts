import { describe, expect, it } from 'vitest';
import { newDuelCategory, newDuels, newQuiz } from './draft';
import { generalSummaries } from './summaries';

const quizWith = (settings: Record<string, unknown>) => ({ ...newQuiz(), settings: { leaderboard: 'each' as const, ...settings } });

describe('generalSummaries (74)', () => {
  it('says everything is off for a quiz without powers, spares and duels', () => {
    expect(generalSummaries(quizWith({ buffs: [], debuffs: [] }))).toEqual({ powers: 'вимкнено', spares: 'запасних: 0', duels: 'вимкнено' });
  });

  it('counts chosen buffs and debuffs together', () => {
    expect(generalSummaries(quizWith({ buffs: ['fifty', 'double'], debuffs: ['shake', 'fog', 'mud'] })).powers).toBe('увімкнено: 5');
  });

  it('counts the legacy debuffs when the author never chose any', () => {
    expect(generalSummaries(quizWith({})).powers).toBe('увімкнено: 6');
  });

  it('counts duel categories', () => {
    const duels = { ...newDuels(), categories: [newDuelCategory(3), newDuelCategory(3), newDuelCategory(3)] };
    expect(generalSummaries({ ...newQuiz(), duels }).duels).toBe('категорій: 3');
  });
});
