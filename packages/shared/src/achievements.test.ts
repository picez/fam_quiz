import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, ACHIEVEMENT_GROUPS, ACHIEVEMENT_INFO, ANTI_ACHIEVEMENTS, PROFILE_STRIP_BADGES, isAnti } from './achievements';
import { QUESTION_TYPES, ROUND_TYPES } from './quiz';

describe('the achievements catalog', () => {
  it('has 71 different ids, the first 48 in their old order', () => {
    expect(ACHIEVEMENTS).toHaveLength(71);
    expect(new Set(ACHIEVEMENTS).size).toBe(71);
    expect(ACHIEVEMENTS.slice(0, 48)).toEqual([
      'first_game', 'first_win', 'games_10', 'streak_5', 'perfect_game', 'host', 'games_50', 'wins_10',
      'games_100', 'host_10', 'streak_10', 'win_streak_3', 'blitz_win', 'final_hit', 'comeback', 'friends_5',
      'fast_answer', 'fast_10', 'last_second', 'sniper', 'eagle_eye', 'jeweler', 'clairvoyant', 'wall_clean',
      'sort_clean', 'chain_full', 'survey_top', 'lone_genius', 'bluff_master', 'lie_detector', 'ladder_top', 'wipeout_bank',
      'last_hero', 'duelist', 'board_owner', 'all_rounds', 'all_types', 'buff_gourmet', 'double_jackpot', 'prankster',
      'unbreakable', 'team_win', 'night_owl', 'early_bird', 'marathon', 'podium_10', 'author_hit', 'veteran',
    ]);
    expect(ACHIEVEMENTS.slice(48)).toEqual([
      'in_debt', 'zero', 'last_place', 'last_place_5', 'black_stripe', 'so_close', 'gullible', 'all_in_lost',
      'burned', 'umbrella', 'same_river', 'slowpoke', 'debuff_magnet', 'who_am_i',
      'lawyer', 'hammer', 'honest', 'wanderer', 'own_pace', 'risky', 'peeker', 'chosen_one',
      'chronicler',
    ]);
  });

  it('puts every achievement in one known group, with the agreed group sizes', () => {
    expect(Object.keys(ACHIEVEMENT_INFO).sort()).toEqual([...ACHIEVEMENTS].sort());
    for (const id of ACHIEVEMENTS) expect(ACHIEVEMENT_GROUPS).toContain(ACHIEVEMENT_INFO[id].group);
    const sizes = Object.fromEntries(ACHIEVEMENT_GROUPS.map((group) => [group, ACHIEVEMENTS.filter((id) => ACHIEVEMENT_INFO[id].group === group).length]));
    expect(sizes).toEqual({ start: 14, accuracy: 10, speed: 4, formats: 13, powers: 6, company: 5, host: 3, anti: 16 });
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
    expect(ACHIEVEMENTS.filter((id) => ACHIEVEMENT_INFO[id].goal === null)).toHaveLength(53);
  });

  it('12l: «Літописець» is the last one, in «Компанія», 20 group records, rare', async () => {
    const { achievementRarity } = await import('./levels');
    expect(ACHIEVEMENTS.at(-1)).toBe('chronicler');
    expect(ACHIEVEMENT_INFO.chronicler).toEqual({ group: 'company', goal: 20 });
    expect(achievementRarity('chronicler')).toBe('rare');
  });

  it('lists the 16 anti-achievements in catalogue order', () => {
    expect(ANTI_ACHIEVEMENTS).toEqual([
      'in_debt', 'zero', 'last_place', 'last_place_5', 'black_stripe', 'so_close', 'gullible', 'all_in_lost',
      'burned', 'umbrella', 'same_river', 'slowpoke', 'debuff_magnet', 'who_am_i', 'hammer', 'wanderer',
    ]);
    expect(isAnti('in_debt')).toBe(true);
    expect(isAnti('lawyer')).toBe(false);
  });

  it('shows 8 badges in a profile', () => {
    expect(PROFILE_STRIP_BADGES).toBe(8);
  });
});
