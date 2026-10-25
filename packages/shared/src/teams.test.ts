import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, DEFAULT_TEAM_FORM, TEAM_FORMS, bandSizes, defaultTeams, teamsOf, teamsSettingsSchema } from './index';

describe('teams (10j)', () => {
  it('four ways to form teams, players pick by default', () => {
    expect([...TEAM_FORMS]).toEqual(['host', 'pick', 'random', 'dice']);
    expect(DEFAULT_TEAM_FORM).toBe('pick');
  });

  it('default teams take the first names and pass the schema', () => {
    expect(defaultTeams(3)).toEqual({ count: 3, names: ['Червоні', 'Сині', 'Зелені'] });
    for (let count = 2; count <= 6; count++) expect(teamsSettingsSchema.safeParse(defaultTeams(count)).success).toBe(true);
  });

  it('band sizes: the first n mod k teams get one more', () => {
    expect(bandSizes(4, 2)).toEqual([2, 2]);
    expect(bandSizes(5, 2)).toEqual([3, 2]);
    expect(bandSizes(7, 3)).toEqual([3, 2, 2]);
    expect(bandSizes(2, 6)).toEqual([1, 1, 0, 0, 0, 0]);
  });

  it('teamsOf is null for a solo quiz', () => {
    expect(teamsOf({ settings: DEFAULT_SETTINGS })).toBeNull();
    expect(teamsOf({ settings: { ...DEFAULT_SETTINGS, teams: defaultTeams(2) } })).toEqual(defaultTeams(2));
  });
});
