import { QUESTION_TYPES, ROUND_TYPES } from './quiz';
import type { ProfileCard } from './profile';

/** Усі ачівки: 16 перших (до 12i) у старому порядку, потім 32 нові (12i), потім 22 нові (12j: 14 антидосягнень, далі 8 досягнень механік) у порядку специфікації, потім 1 нова (12l), потім 31 нова (33: 5 раундів, 17 типів запитань, 6 додаткових, 3 антидосягнення). */
export const ACHIEVEMENTS = [
  'first_game', 'first_win', 'games_10', 'streak_5', 'perfect_game', 'host', 'games_50', 'wins_10',
  'games_100', 'host_10', 'streak_10', 'win_streak_3', 'blitz_win', 'final_hit', 'comeback', 'friends_5',
  'fast_answer', 'fast_10', 'last_second', 'sniper', 'eagle_eye', 'jeweler', 'clairvoyant', 'wall_clean',
  'sort_clean', 'chain_full', 'survey_top', 'lone_genius', 'bluff_master', 'lie_detector', 'ladder_top', 'wipeout_bank',
  'last_hero', 'duelist', 'board_owner', 'all_rounds', 'all_types', 'buff_gourmet', 'double_jackpot', 'prankster',
  'unbreakable', 'team_win', 'night_owl', 'early_bird', 'marathon', 'podium_10', 'author_hit', 'veteran',
  'in_debt', 'zero', 'last_place', 'last_place_5', 'black_stripe', 'so_close', 'gullible', 'all_in_lost',
  'burned', 'umbrella', 'same_river', 'slowpoke', 'debuff_magnet', 'who_am_i',
  'lawyer', 'hammer', 'honest', 'wanderer', 'own_pace', 'risky', 'peeker', 'chosen_one',
  'chronicler',
  'classic_clean', 'cold_bets', 'sold', 'mind_reader', 'code_breaker',
  'single_ten', 'all_at_once', 'not_a_coin', 'word_for_word', 'in_order', 'pair_to_pair', 'short_path', 'full_list',
  'longest_word', 'number_sense', 'masterpiece', 'sudoku_first', 'crossword_full', 'jigsaw_first', 'spotdiff_all', 'elephant_memory', 'first_note',
  'buffet', 'host_marathon', 'team_soul', 'quick_sketch', 'dark_horse', 'holiday',
  'modern_art', 'mirror_logic', 'last_piece',
] as const;
export type AchievementId = (typeof ACHIEVEMENTS)[number];

/** Групи сторінки ачівок у порядку показу; anti — антидосягнення 12j. */
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
  in_debt: { group: 'anti', goal: null },
  zero: { group: 'anti', goal: null },
  last_place: { group: 'anti', goal: null },
  last_place_5: { group: 'anti', goal: 5 },
  black_stripe: { group: 'anti', goal: null },
  so_close: { group: 'anti', goal: null },
  gullible: { group: 'anti', goal: null },
  all_in_lost: { group: 'anti', goal: null },
  burned: { group: 'anti', goal: null },
  umbrella: { group: 'anti', goal: null },
  same_river: { group: 'anti', goal: null },
  slowpoke: { group: 'anti', goal: null },
  debuff_magnet: { group: 'anti', goal: null },
  who_am_i: { group: 'anti', goal: null },
  lawyer: { group: 'company', goal: null },
  hammer: { group: 'anti', goal: null },
  honest: { group: 'start', goal: 10 },
  wanderer: { group: 'anti', goal: null },
  own_pace: { group: 'accuracy', goal: null },
  risky: { group: 'powers', goal: null },
  peeker: { group: 'powers', goal: null },
  chosen_one: { group: 'company', goal: null },
  chronicler: { group: 'company', goal: 20 },
  // План 33: усі 31 разові.
  classic_clean: { group: 'accuracy', goal: null },
  cold_bets: { group: 'formats', goal: null },
  sold: { group: 'formats', goal: null },
  mind_reader: { group: 'company', goal: null },
  code_breaker: { group: 'formats', goal: null },
  single_ten: { group: 'accuracy', goal: null },
  all_at_once: { group: 'accuracy', goal: null },
  not_a_coin: { group: 'accuracy', goal: null },
  word_for_word: { group: 'accuracy', goal: null },
  in_order: { group: 'formats', goal: null },
  pair_to_pair: { group: 'formats', goal: null },
  short_path: { group: 'formats', goal: null },
  full_list: { group: 'formats', goal: null },
  longest_word: { group: 'formats', goal: null },
  number_sense: { group: 'accuracy', goal: null },
  masterpiece: { group: 'formats', goal: null },
  sudoku_first: { group: 'speed', goal: null },
  crossword_full: { group: 'formats', goal: null },
  jigsaw_first: { group: 'speed', goal: null },
  spotdiff_all: { group: 'speed', goal: null },
  elephant_memory: { group: 'formats', goal: null },
  first_note: { group: 'formats', goal: null },
  buffet: { group: 'formats', goal: null },
  host_marathon: { group: 'host', goal: null },
  team_soul: { group: 'company', goal: null },
  quick_sketch: { group: 'speed', goal: null },
  dark_horse: { group: 'company', goal: null },
  holiday: { group: 'start', goal: null },
  modern_art: { group: 'anti', goal: null },
  mirror_logic: { group: 'anti', goal: null },
  last_piece: { group: 'anti', goal: null },
};

/** Антидосягнення (12j): група anti, у порядку ACHIEVEMENTS. */
export const ANTI_ACHIEVEMENTS: readonly AchievementId[] = ACHIEVEMENTS.filter((id) => ACHIEVEMENT_INFO[id].group === 'anti');
export const isAnti = (id: AchievementId): boolean => ACHIEVEMENT_INFO[id].group === 'anti';

/** Скільки останніх значків показує профіль. */
export const PROFILE_STRIP_BADGES = 8;

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
  /** Лише своя сторінка: чи сховано антидосягнення від інших (12j). */
  hideAnti?: boolean;
}
