import { describe, expect, it } from 'vitest';
import { adminMergeSchema, emptyMergeSummary, MERGE_COUNT_KEYS, MERGE_LOGINS, MERGE_REFUSALS } from './account-merge';
import { ADMIN_ACTION_KINDS, ADMIN_LOG_GROUP_KINDS } from './admin';

describe('account merge', () => {
  it('an empty summary has every count at zero, no logins and no dropped password', () => {
    expect(MERGE_COUNT_KEYS).toEqual(['games', 'hosted', 'quizzes', 'achievements', 'xp', 'friends', 'groups', 'prizes', 'likes', 'calendar', 'challenges', 'league']);
    const s = emptyMergeSummary();
    expect(MERGE_COUNT_KEYS.every((k) => s[k] === 0)).toBe(true);
    expect(s.logins).toEqual([]);
    expect(s.passwordDropped).toBe(false);
    expect([s.sameGames, s.sameGroups, s.sameFriends, s.sameAchievements]).toEqual([0, 0, 0, 0]);
    expect(emptyMergeSummary().logins).not.toBe(s.logins);
    expect(MERGE_LOGINS).toEqual(['google', 'credential', 'other']);
    expect(MERGE_REFUSALS).toEqual(['merge_same', 'merge_admin', 'merge_banned', 'merge_live']);
  });

  it('the merge body takes the secondary id and the typed confirmation only', () => {
    expect(adminMergeSchema.parse({ secondaryId: 'u2', confirm: 'Оля' })).toEqual({ secondaryId: 'u2', confirm: 'Оля' });
    expect(adminMergeSchema.safeParse({ secondaryId: 'u2', confirm: 'Оля', extra: 1 }).success).toBe(false);
    expect(adminMergeSchema.safeParse({ secondaryId: '', confirm: 'Оля' }).success).toBe(false);
    expect(adminMergeSchema.safeParse({ secondaryId: 'a'.repeat(65), confirm: 'Оля' }).success).toBe(false);
    expect(adminMergeSchema.safeParse({ secondaryId: 'a'.repeat(64), confirm: 'Оля' }).success).toBe(true);
    expect(adminMergeSchema.safeParse({ secondaryId: 'u2', confirm: 'a'.repeat(201) }).success).toBe(false);
    expect(adminMergeSchema.safeParse({ secondaryId: 'u2', confirm: 'a'.repeat(200) }).success).toBe(true);
    expect(adminMergeSchema.safeParse({ secondaryId: 'u2' }).success).toBe(false);
  });

  it('account_merge is a players log kind', () => {
    expect(ADMIN_ACTION_KINDS).toContain('account_merge');
    expect(ADMIN_LOG_GROUP_KINDS.players).toContain('account_merge');
  });
});
