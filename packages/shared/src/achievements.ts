import { QUESTION_TYPES, ROUND_TYPES } from './quiz';
import type { ProfileCard } from './profile';

/** Усі ачівки: 16 перших (до 12i) у старому порядку, потім 32 нові (12i) у порядку специфікації. */
export const ACHIEVEMENTS = [
  'first_game', 'first_win', 'games_10', 'streak_5', 'perfect_game', 'host', 'games_50', 'wins_10',
  'games_100', 'host_10', 'streak_10', 'win_streak_3', 'blitz_win', 'final_hit', 'comeback', 'friends_5',
  'fast_answer', 'fast_10', 'last_second', 'sniper', 'eagle_eye', 'jeweler', 'clairvoyant', 'wall_clean',
  'sort_clean', 'chain_full', 'survey_top', 'lone_genius', 'bluff_master', 'lie_detector', 'ladder_top', 'wipeout_bank',
  'last_hero', 'duelist', 'board_owner', 'all_rounds', 'all_types', 'buff_gourmet', 'double_jackpot', 'prankster',
  'unbreakable', 'team_win', 'night_owl', 'early_bird', 'marathon', 'podium_10', 'author_hit', 'veteran',
] as const;
export type AchievementId = (typeof ACHIEVEMENTS)[number];

/** Групи сторінки ачівок у порядку показу; anti — антиачівки 12j (у 12i порожня). */
export const ACHIEVEMENT_GROUPS = ['start', 'accuracy', 'speed', 'formats', 'powers', 'company', 'host', 'anti'] as const;
export type AchievementGroup = (typeof ACHIEVEMENT_GROUPS)[number];

/** Група й ціль лічильника (null — разова ачівка без поступу). */
export const ACHIEVEMENT_INFO: Record<AchievementId, { group: AchievementGroup; goal: number | null }> = {
  first_game: { group: 'start', goal: null },
  first_win: { group: 'start', goal: null },
  games_10: { group: 'start', goal: 10 },
  streak_5: { group: 'accuracy', goal: 5 },
  perfect_game: { group: 'accuracy', goal: null },
  host: { group: 'host', goal: null },
  games_50: { group: 'start', goal: 50 },
  wins_10: { group: 'start', goal: 10 },
  games_100: { group: 'start', goal: 100 },
  host_10: { group: 'host', goal: 10 },
  streak_10: { group: 'accuracy', goal: 10 },
  win_streak_3: { group: 'start', goal: 3 },
  blitz_win: { group: 'speed', goal: null },
  final_hit: { group: 'formats', goal: null },
  comeback: { group: 'start', goal: null },
  friends_5: { group: 'company', goal: 5 },
  fast_answer: { group: 'speed', goal: null },
  fast_10: { group: 'speed', goal: null },
  last_second: { group: 'speed', goal: null },
  sniper: { group: 'accuracy', goal: null },
  eagle_eye: { group: 'accuracy', goal: null },
  jeweler: { group: 'accuracy', goal: null },
  clairvoyant: { group: 'accuracy', goal: null },
  wall_clean: { group: 'formats', goal: null },
  sort_clean: { group: 'formats', goal: null },
  chain_full: { group: 'formats', goal: null },
  survey_top: { group: 'accuracy', goal: null },
  lone_genius: { group: 'accuracy', goal: null },
  bluff_master: { group: 'formats', goal: null },
  lie_detector: { group: 'formats', goal: null },
  ladder_top: { group: 'formats', goal: null },
  wipeout_bank: { group: 'formats', goal: null },
  last_hero: { group: 'formats', goal: null },
  duelist: { group: 'formats', goal: null },
  board_owner: { group: 'formats', goal: null },
  all_rounds: { group: 'formats', goal: ROUND_TYPES.length },
  all_types: { group: 'formats', goal: QUESTION_TYPES.length },
  buff_gourmet: { group: 'powers', goal: null },
  double_jackpot: { group: 'powers', goal: null },
  prankster: { group: 'powers', goal: 10 },
  unbreakable: { group: 'powers', goal: null },
  team_win: { group: 'company', goal: null },
  night_owl: { group: 'start', goal: null },
  early_bird: { group: 'start', goal: null },
  marathon: { group: 'start', goal: null },
  podium_10: { group: 'start', goal: 10 },
  author_hit: { group: 'host', goal: 10 },
  veteran: { group: 'start', goal: 250 },
};

/** Скільки останніх значків показує профіль. */
export const PROFILE_BADGES = 8;

/** Ачівка в профілі: earnedAt — ISO-мить отримання; null — не отримано або отримано «давно» (до 12i). */
export interface Achievement {
  id: AchievementId;
  earned: boolean;
  earnedAt: string | null;
}

/** Картка сторінки ачівок: поступ лише для лічильних неотриманих на своїй сторінці. */
export interface AchievementCard extends Achievement {
  progress: { current: number; goal: number } | null;
}

/** Сторінка ачівок: own — свій вигляд (усі з поступом); інакше лише отримані. */
export interface AchievementsPage {
  profile: ProfileCard;
  own: boolean;
  earned: number;
  total: number;
  items: AchievementCard[];
}
