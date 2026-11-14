import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, ACHIEVEMENT_GROUPS, ACHIEVEMENT_INFO, ANTI_ACHIEVEMENTS, PROFILE_STRIP_BADGES, isAnti } from './achievements';
import { QUESTION_TYPES, ROUND_TYPES } from './quiz';

/** 31 нових (план 33) у порядку таблиці плану: 5 раундів, 17 типів, 6 додаткових, 3 анти. */
const ADDED_33 = [
  'classic_clean', 'cold_bets', 'sold', 'mind_reader', 'code_breaker',
  'single_ten', 'all_at_once', 'not_a_coin', 'word_for_word', 'in_order', 'pair_to_pair', 'short_path', 'full_list',
  'longest_word', 'number_sense', 'masterpiece', 'sudoku_first', 'crossword_full', 'jigsaw_first', 'spotdiff_all', 'elephant_memory', 'first_note',
  'buffet', 'host_marathon', 'team_soul', 'quick_sketch', 'dark_horse', 'holiday',
  'modern_art', 'mirror_logic', 'last_piece',
] as const;

describe('the achievements catalog', () => {
  it('has 102 different ids, the first 71 in their old order', () => {
    expect(ACHIEVEMENTS).toHaveLength(102);
    expect(new Set(ACHIEVEMENTS).size).toBe(102);
    expect(ACHIEVEMENTS.slice(0, 48)).toEqual([
      'first_game', 'first_win', 'games_10', 'streak_5', 'perfect_game', 'host', 'games_50', 'wins_10',
      'games_100', 'host_10', 'streak_10', 'win_streak_3', 'blitz_win', 'final_hit', 'comeback', 'friends_5',
      'fast_answer', 'fast_10', 'last_second', 'sniper', 'eagle_eye', 'jeweler', 'clairvoyant', 'wall_clean',
      'sort_clean', 'chain_full', 'survey_top', 'lone_genius', 'bluff_master', 'lie_detector', 'ladder_top', 'wipeout_bank',
      'last_hero', 'duelist', 'board_owner', 'all_rounds', 'all_types', 'buff_gourmet', 'double_jackpot', 'prankster',
      'unbreakable', 'team_win', 'night_owl', 'early_bird', 'marathon', 'podium_10', 'author_hit', 'veteran',
    ]);
    expect(ACHIEVEMENTS.slice(48, 71)).toEqual([
      'in_debt', 'zero', 'last_place', 'last_place_5', 'black_stripe', 'so_close', 'gullible', 'all_in_lost',
      'burned', 'umbrella', 'same_river', 'slowpoke', 'debuff_magnet', 'who_am_i',
      'lawyer', 'hammer', 'honest', 'wanderer', 'own_pace', 'risky', 'peeker', 'chosen_one',
      'chronicler',
    ]);
    expect(ACHIEVEMENTS.slice(71)).toEqual(ADDED_33);
  });

  it('33: the 31 new ones are one-off (no goal)', () => {
    for (const id of ADDED_33) expect(ACHIEVEMENT_INFO[id].goal).toBeNull();
  });

  it('puts every achievement in one known group, with the agreed group sizes', () => {
    expect(Object.keys(ACHIEVEMENT_INFO).sort()).toEqual([...ACHIEVEMENTS].sort());
    for (const id of ACHIEVEMENTS) expect(ACHIEVEMENT_GROUPS).toContain(ACHIEVEMENT_INFO[id].group);
    const sizes = Object.fromEntries(ACHIEVEMENT_GROUPS.map((group) => [group, ACHIEVEMENTS.filter((id) => ACHIEVEMENT_INFO[id].group === group).length]));
    expect(sizes).toEqual({ start: 15, accuracy: 16, speed: 8, formats: 26, powers: 6, company: 8, host: 4, anti: 19 });
    expect(ACHIEVEMENT_GROUPS).toEqual(['start', 'accuracy', 'speed', 'formats', 'powers', 'company', 'host', 'anti']);
  });

  it('gives goals to the 18 counters only, the type collections from the type lists', () => {
    const goals = Object.fromEntries(ACHIEVEMENTS.filter((id) => ACHIEVEMENT_INFO[id].goal !== null).map((id) => [id, ACHIEVEMENT_INFO[id].goal]));
    expect(goals).toEqual({
      games_10: 10, games_50: 50, games_100: 100, veteran: 250, wins_10: 10, host_10: 10, podium_10: 10, prankster: 10,
      author_hit: 10, friends_5: 5, streak_5: 5, streak_10: 10, win_streak_3: 3, all_rounds: 12, all_types: 28, last_place_5: 5, honest: 10, chronicler: 20, // 26c, 27c, 27d, 28a, 28c, 28d, 29c, 29d, 29e, 29f: нові типи запитань; 27a, 27b, 28b, 28d, 29g: нові типи раунду
    });
    expect(ACHIEVEMENT_INFO.all_rounds.goal).toBe(ROUND_TYPES.length);
    expect(ACHIEVEMENT_INFO.all_types.goal).toBe(QUESTION_TYPES.length);
    expect(ACHIEVEMENTS.filter((id) => ACHIEVEMENT_INFO[id].goal === null)).toHaveLength(84);
  });

  it('12l: «Літописець» is the last one before plan 33, in «Компанія», 20 group records, rare', async () => {
    const { achievementRarity } = await import('./levels');
    expect(ACHIEVEMENTS[70]).toBe('chronicler');
    expect(ACHIEVEMENT_INFO.chronicler).toEqual({ group: 'company', goal: 20 });
    expect(achievementRarity('chronicler')).toBe('rare');
  });

  it('lists the 19 anti-achievements in catalogue order', () => {
    expect(ANTI_ACHIEVEMENTS).toHaveLength(19);
    expect(ANTI_ACHIEVEMENTS).toEqual([
      'in_debt', 'zero', 'last_place', 'last_place_5', 'black_stripe', 'so_close', 'gullible', 'all_in_lost',
      'burned', 'umbrella', 'same_river', 'slowpoke', 'debuff_magnet', 'who_am_i', 'hammer', 'wanderer',
      'modern_art', 'mirror_logic', 'last_piece',
    ]);
    expect(isAnti('in_debt')).toBe(true);
    expect(isAnti('lawyer')).toBe(false);
  });

  it('shows 8 badges in a profile', () => {
    expect(PROFILE_STRIP_BADGES).toBe(8);
  });
});
