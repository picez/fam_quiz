import { ACHIEVEMENTS, type AchievementId } from '@quiz/shared';
import { whoIn, type AchievementGame } from './achievement-games';
import { gameAchievements } from './game-achievements';

/** Пороги досягнень ведучого (план 33). */
export const HOST_LIMITS = {
  marathonQuestions: 50,
} as const;

/** Досягнення ведучого завершеної гри (план 33): «Марафон за пультом» — провести вручну (не автопілотом) гру з щонайменше 50 запитань. */
export function hostAchievements(game: AchievementGame, userId: string): AchievementId[] {
  if (game.status !== 'finished' || game.autopilot || game.hostId !== userId) return [];
  return game.questionsPlayed >= HOST_LIMITS.marathonQuestions ? ['host_marathon'] : [];
}

/** Ігрові досягнення користувача за гру: як учасника (whoIn + gameAchievements) і як ведучого, у порядку ACHIEVEMENTS. */
export function achievementsFor(game: AchievementGame, userId: string): AchievementId[] {
  const who = whoIn(game, userId);
  const got = new Set<AchievementId>([...(who === null ? [] : gameAchievements(game, who)), ...hostAchievements(game, userId)]);
  return ACHIEVEMENTS.filter((id) => got.has(id));
}
