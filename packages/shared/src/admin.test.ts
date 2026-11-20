import { describe, expect, it } from 'vitest';
import { ADMIN_ACTION_KINDS, ADMIN_LOG_GROUP_KINDS, ADMIN_LOG_GROUPS, adminBotCopySchema, adminListQuerySchema, adminLogFilterSchema, adminLogQuerySchema, adminPages, banSchema } from './admin';

describe('adminListQuerySchema', () => {
  it('defaults and coerces', () => {
    expect(adminListQuerySchema.parse({})).toEqual({ page: 1 });
    expect(adminListQuerySchema.parse({ q: '  Оля ', page: '3' })).toEqual({ q: 'Оля', page: 3 });
  });
  it('rejects bad input', () => {
    expect(() => adminListQuerySchema.parse({ page: '0' })).toThrow();
    expect(() => adminListQuerySchema.parse({ page: 'x' })).toThrow();
    expect(() => adminListQuerySchema.parse({ q: 'a'.repeat(101) })).toThrow();
    expect(() => adminListQuerySchema.parse({ sort: 'x' })).toThrow();
  });
});

describe('banSchema', () => {
  it('normalises reason', () => {
    expect(banSchema.parse({})).toEqual({ reason: null });
    expect(banSchema.parse({ reason: '   ' })).toEqual({ reason: null });
    expect(banSchema.parse({ reason: ' спам ' })).toEqual({ reason: 'спам' });
  });
  it('rejects bad input', () => {
    expect(() => banSchema.parse({ reason: 'a'.repeat(501) })).toThrow();
    expect(() => banSchema.parse({ extra: 1 })).toThrow();
  });
});

describe('adminPages', () => {
  it('counts pages', () => {
    expect(adminPages(0)).toBe(1);
    expect(adminPages(50)).toBe(1);
    expect(adminPages(51)).toBe(2);
  });
});

it('ADMIN_ACTION_KINDS', () => {
  expect([...ADMIN_ACTION_KINDS]).toEqual(['ban', 'unban', 'quiz_delete', 'question_delete', 'prize_delete', 'award_delete', 'library_hide', 'library_restore', 'report_dismiss', 'appeal_reject', 'nickname_reset', 'avatar_reset', 'game_close', 'announcement_set', 'announcement_clear', 'bot_game_start', 'bot_copy', 'bot_quiz_delete', 'bot_plan_create', 'bot_plan_update', 'bot_plan_cancel', 'bot_plan_run', 'bot_plan_fail', 'quiz_view', 'achievement_grant', 'achievement_revoke', 'xp_adjust', 'prize_gift', 'gift_revoke', 'account_delete', 'bot_room_start', 'bot_room_pause', 'bot_room_resume', 'bot_room_end', 'bot_room_skip', 'bot_room_time', 'bot_room_end_round', 'bot_room_kick', 'bot_room_release', 'bot_room_teams', 'bot_room_lobby', 'push_broadcast', 'feed_hide', 'feed_show', 'group_hide', 'group_restore', 'group_member_remove', 'group_owner_transfer', 'group_delete', 'group_item_hide', 'group_item_show', 'server_error_resolve', 'problem_resolve', 'problem_reply', 'backup_now']);
  for (const k of ['server_error_resolve', 'problem_resolve', 'problem_reply', 'backup_now']) expect(ADMIN_ACTION_KINDS).toContain(k);
});

describe('adminBotCopySchema', () => {
  it('takes a quiz uuid and nothing else', () => {
    const quizId = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b';
    expect(adminBotCopySchema.parse({ quizId })).toEqual({ quizId });
    expect(() => adminBotCopySchema.parse({ quizId: 'abc' })).toThrow();
    expect(() => adminBotCopySchema.parse({ quizId, extra: 1 })).toThrow();
  });
});

describe('admin log groups (63)', () => {
  it('every log kind is in exactly one group', () => {
    for (const kind of ADMIN_ACTION_KINDS) {
      expect(ADMIN_LOG_GROUPS.filter((g) => ADMIN_LOG_GROUP_KINDS[g].includes(kind))).toHaveLength(1);
    }
    expect(ADMIN_LOG_GROUPS.reduce((sum, g) => sum + ADMIN_LOG_GROUP_KINDS[g].length, 0)).toBe(ADMIN_ACTION_KINDS.length);
    expect(ADMIN_LOG_GROUP_KINDS.moderation).toEqual(expect.arrayContaining(['feed_hide', 'group_delete', 'library_hide', 'ban']));
    expect(ADMIN_LOG_GROUP_KINDS.bot).toEqual(expect.arrayContaining(['bot_plan_run', 'bot_room_lobby']));
    expect(ADMIN_LOG_GROUP_KINDS.announcements).toContain('push_broadcast');
    expect(ADMIN_LOG_GROUP_KINDS.system).toEqual(['server_error_resolve', 'problem_resolve', 'problem_reply', 'backup_now']);
  });

  it('the log filter: an admin, groups, a Kyiv day range and text', () => {
    expect(adminLogQuerySchema.parse({})).toEqual({ page: 1 });
    expect(adminLogQuerySchema.parse({ groups: 'moderation,bot' })).toEqual({ page: 1, groups: ['moderation', 'bot'] });
    expect(adminLogQuerySchema.parse({ groups: 'bot,bot' })).toEqual({ page: 1, groups: ['bot'] });
    expect(adminLogQuerySchema.parse({ admin: 'u1', from: '2026-11-20', to: '2026-11-20', page: '2' })).toEqual({ admin: 'u1', from: '2026-11-20', to: '2026-11-20', page: 2 });
    expect(adminLogQuerySchema.parse({ q: '  ' })).toEqual({ page: 1 });
    expect(adminLogQuerySchema.parse({ q: ' Оля ' })).toEqual({ page: 1, q: 'Оля' });
    expect(() => adminLogQuerySchema.parse({ groups: 'nope' })).toThrow();
    expect(() => adminLogQuerySchema.parse({ from: '2026-13-01' })).toThrow();
    expect(() => adminLogQuerySchema.parse({ from: '2026-02-30' })).toThrow();
    expect(() => adminLogQuerySchema.parse({ from: '20.11.2026' })).toThrow();
    expect(() => adminLogQuerySchema.parse({ from: '2026-11-21', to: '2026-11-20' })).toThrow();
    expect(() => adminLogQuerySchema.parse({ q: 'а'.repeat(101) })).toThrow();
    expect(() => adminLogQuerySchema.parse({ extra: '1' })).toThrow();
    expect(() => adminLogFilterSchema.parse({ page: '1' })).toThrow();
    expect(adminLogFilterSchema.parse({ groups: 'players' })).toEqual({ groups: ['players'] });
  });
});
