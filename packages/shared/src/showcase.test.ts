import { describe, expect, it } from 'vitest';
import type { Achievement, AchievementId } from './achievements';
import type { AwardCard, PrizeContent } from './prizes';
import { EMPTY_PINS, SHOWCASE_PIN_LIMITS, shelfAchievements, shelfAwards, shelfColumns, showcasePinSchema } from './showcase';

const UUID = '11111111-1111-4111-8111-111111111111';

const award = (id: string, awardedAt: string, content: Partial<Omit<PrizeContent, 'name'>>): AwardCard => ({
  id,
  place: 1,
  content: { trophy: null, engraving: null, real: null, title: null, diploma: false, ...content },
  quizTitle: 'Україна',
  nickname: 'Оля',
  awardedAt,
});
const A = award('a', '2026-10-04T10:00:00.000Z', { diploma: true });
const B = award('b', '2026-10-03T10:00:00.000Z', { trophy: { kind: 'cup', material: 'gold' } });
const C = award('c', '2026-10-02T10:00:00.000Z', { trophy: { kind: 'medal', material: 'silver' } });
const D = award('d', '2026-10-05T10:00:00.000Z', { real: { text: 'Піца', photoUrl: null } });

const got = (id: AchievementId, earnedAt: string | null): Achievement => ({ id, earned: true, earnedAt });
const not = (id: AchievementId): Achievement => ({ id, earned: false, earnedAt: null });

describe('showcasePinSchema', () => {
  it('accepts a prize by uuid and an achievement by id', () => {
    expect(showcasePinSchema.safeParse({ kind: 'prize', id: UUID }).success).toBe(true);
    expect(showcasePinSchema.safeParse({ kind: 'achievement', id: 'sniper' }).success).toBe(true);
  });
  it('rejects a bad prize id, an unknown achievement, an extra key and an unknown kind', () => {
    expect(showcasePinSchema.safeParse({ kind: 'prize', id: 'x' }).success).toBe(false);
    expect(showcasePinSchema.safeParse({ kind: 'achievement', id: 'nope' }).success).toBe(false);
    expect(showcasePinSchema.safeParse({ kind: 'prize', id: UUID, extra: 1 }).success).toBe(false);
    expect(showcasePinSchema.safeParse({ kind: 'title', id: UUID }).success).toBe(false);
  });
  it('has the limits and an empty value', () => {
    expect(SHOWCASE_PIN_LIMITS).toEqual({ prize: 3, achievement: 5 });
    expect(EMPTY_PINS).toEqual({ prizes: [], achievements: [] });
  });
});

describe('shelfAwards', () => {
  it('picks trophies first, then diplomas, then the rest, newer first, up to 3', () => {
    expect(shelfAwards([D, A, B, C], []).map((a) => a.id)).toEqual(['b', 'c', 'a']);
  });
  it('shows only the pinned that exist, in the order of pinning', () => {
    expect(shelfAwards([D, A, B, C], ['c', 'зниклий', 'a']).map((a) => a.id)).toEqual(['c', 'a']);
  });
});

describe('shelfAchievements', () => {
  const list = [got('first_game', null), got('host', '2026-10-20T10:00:00.000Z'), got('sniper', '2026-10-01T10:00:00.000Z'), not('veteran')];
  it('picks the newest earned, null at the end', () => {
    expect(shelfAchievements(list, []).map((a) => a.id)).toEqual(['host', 'sniper', 'first_game']);
  });
  it('shows only the pinned earned ones', () => {
    expect(shelfAchievements(list, ['first_game', 'veteran']).map((a) => a.id)).toEqual(['first_game']);
  });
  it('picks at most 5 of 7 earned', () => {
    const seven = (['first_game', 'first_win', 'games_10', 'streak_5', 'perfect_game', 'host', 'games_50'] as const).map((id, i) =>
      got(id, `2026-10-0${i + 1}T10:00:00.000Z`),
    );
    expect(shelfAchievements(seven, []).map((a) => a.id)).toEqual(['games_50', 'host', 'perfect_game', 'streak_5', 'games_10']);
  });
  it('keeps the ACHIEVEMENTS order on a tie', () => {
    expect(shelfAchievements([got('host', null), got('first_game', null)], []).map((a) => a.id)).toEqual(['first_game', 'host']);
  });
});

describe('shelfColumns', () => {
  it('puts the first of three in the middle', () => {
    expect(shelfColumns(['a', 'b', 'c'])).toEqual(['b', 'a', 'c']);
  });
  it('keeps other lengths as they are', () => {
    expect(shelfColumns(['a', 'b'])).toEqual(['a', 'b']);
  });
});
