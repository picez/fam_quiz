import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, ACHIEVEMENT_GROUPS, ACHIEVEMENT_INFO, PROFILE_BADGES } from './achievements';
import { QUESTION_TYPES, ROUND_TYPES } from './quiz';

describe('the achievements catalog', () => {
  it('has 48 different ids, the first 16 in their old order', () => {
    expect(ACHIEVEMENTS).toHaveLength(48);
    expect(new Set(ACHIEVEMENTS).size).toBe(48);
    expect(ACHIEVEMENTS.slice(0, 16)).toEqual([
      'first_game', 'first_win', 'games_10', 'streak_5', 'perfect_game', 'host', 'games_50', 'wins_10',
      'games_100', 'host_10', 'streak_10', 'win_streak_3', 'blitz_win', 'final_hit', 'comeback', 'friends_5',
    ]);
  });

  it('puts every achievement in one known group, with the agreed group sizes', () => {
    expect(Object.keys(ACHIEVEMENT_INFO).sort()).toEqual([...ACHIEVEMENTS].sort());
    for (const id of ACHIEVEMENTS) expect(ACHIEVEMENT_GROUPS).toContain(ACHIEVEMENT_INFO[id].group);
    const sizes = Object.fromEntries(ACHIEVEMENT_GROUPS.map((group) => [group, ACHIEVEMENTS.filter((id) => ACHIEVEMENT_INFO[id].group === group).length]));
    expect(sizes).toEqual({ start: 13, accuracy: 9, speed: 4, formats: 13, powers: 4, company: 2, host: 3, anti: 0 });
    expect(ACHIEVEMENT_GROUPS).toEqual(['start', 'accuracy', 'speed', 'formats', 'powers', 'company', 'host', 'anti']);
  });

  it('gives goals to the 15 counters only, the type collections from the type lists', () => {
    const goals = Object.fromEntries(ACHIEVEMENTS.filter((id) => ACHIEVEMENT_INFO[id].goal !== null).map((id) => [id, ACHIEVEMENT_INFO[id].goal]));
    expect(goals).toEqual({
      games_10: 10, games_50: 50, games_100: 100, veteran: 250, wins_10: 10, host_10: 10, podium_10: 10, prankster: 10,
      author_hit: 10, friends_5: 5, streak_5: 5, streak_10: 10, win_streak_3: 3, all_rounds: 7, all_types: 17,
    });
    expect(ACHIEVEMENT_INFO.all_rounds.goal).toBe(ROUND_TYPES.length);
    expect(ACHIEVEMENT_INFO.all_types.goal).toBe(QUESTION_TYPES.length);
    expect(ACHIEVEMENTS.filter((id) => ACHIEVEMENT_INFO[id].goal === null)).toHaveLength(33);
  });

  it('shows 8 badges in a profile', () => {
    expect(PROFILE_BADGES).toBe(8);
  });
});
