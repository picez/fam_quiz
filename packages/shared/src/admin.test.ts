import { describe, expect, it } from 'vitest';
import { ADMIN_ACTION_KINDS, adminBotCopySchema, adminListQuerySchema, adminPages, banSchema } from './admin';

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
  expect([...ADMIN_ACTION_KINDS]).toEqual(['ban', 'unban', 'quiz_delete', 'question_delete', 'prize_delete', 'award_delete', 'library_hide', 'library_restore', 'report_dismiss', 'appeal_reject', 'nickname_reset', 'avatar_reset', 'game_close', 'announcement_set', 'announcement_clear', 'bot_game_start', 'bot_copy', 'bot_quiz_delete', 'bot_plan_create', 'bot_plan_update', 'bot_plan_cancel', 'bot_plan_run', 'bot_plan_fail', 'quiz_view', 'achievement_grant', 'achievement_revoke', 'xp_adjust', 'prize_gift', 'gift_revoke', 'account_delete', 'bot_room_start', 'bot_room_pause', 'bot_room_resume', 'bot_room_end', 'bot_room_skip', 'bot_room_time', 'bot_room_end_round', 'bot_room_kick', 'bot_room_release', 'bot_room_teams', 'bot_room_lobby']);
});

describe('adminBotCopySchema', () => {
  it('takes a quiz uuid and nothing else', () => {
    const quizId = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b';
    expect(adminBotCopySchema.parse({ quizId })).toEqual({ quizId });
    expect(() => adminBotCopySchema.parse({ quizId: 'abc' })).toThrow();
    expect(() => adminBotCopySchema.parse({ quizId, extra: 1 })).toThrow();
  });
});
