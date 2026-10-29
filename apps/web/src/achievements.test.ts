import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, type Achievement, type AchievementCard, type AchievementId } from '@quiz/shared';
import { ACHIEVEMENT_ICONS } from './achievement-meta';
import { groupCards, recentBadges } from './achievements';
import { hasText, t, type TextKey } from './i18n';

const name = (id: AchievementId) => t(`achievement_${id}` as TextKey);
const joke = (id: AchievementId) => t(`achievementJoke_${id}` as TextKey);
const hint = (id: AchievementId) => t(`achievementHint_${id}` as TextKey);

describe('achievement texts', () => {
  it('every achievement has an icon, a name, a joke and a condition', () => {
    for (const id of ACHIEVEMENTS) {
      expect(ACHIEVEMENT_ICONS[id], id).not.toBe('');
      for (const key of [`achievement_${id}`, `achievementJoke_${id}`, `achievementHint_${id}`]) expect(hasText(key), key).toBe(true);
    }
  });

  it('reads word for word from the plan', () => {
    expect(name('host')).toBe('За пультом');
    expect(joke('host')).toBe('Перша гра по той бік пульта. Тепер ти знаєш, як це.');
    expect(name('fast_answer')).toBe('Швидкі пальці');
    expect(hint('fast_answer')).toBe('Правильна відповідь швидше ніж за 2 с');
    expect(name('veteran')).toBe('250 ігор');
    expect(ACHIEVEMENT_ICONS.first_game).toBe('🎈');
    expect(ACHIEVEMENT_ICONS.veteran).toBe('🛡️');
  });

  it('names and jokes do not speak of a player in a gendered past tense', () => {
    const words = ['відповів', 'переміг', 'вгадав', 'знайшов', 'лишився', 'поставив', 'купив', 'грав', 'бачив', 'дійшов', 'ніс', 'вийшов', 'спробував', 'влучив', 'підглядав', 'забув', 'його', 'Єдиний'];
    for (const id of ACHIEVEMENTS) {
      for (const text of [name(id), joke(id)]) {
        for (const word of words) expect(new RegExp(`(?<!\\p{L})${word}(?!\\p{L})`, 'iu').test(text), `${id}: ${text}`).toBe(false);
      }
    }
  });

  it('nothing about russia or the USSR, not even its household tropes', () => {
    for (const id of ACHIEVEMENTS) {
      for (const text of [name(id), joke(id), hint(id)]) expect(text, id).not.toMatch(/росі|москв|ссср|радянськ|сервант/iu);
    }
    expect(joke('sort_clean')).toBe('Усе по поличках, як у бабусі в комоді.');
  });
});

const got = (id: AchievementId, earnedAt: string | null): Achievement => ({ id, earned: true, earnedAt });

describe('recentBadges', () => {
  it('newest first, «long ago» after the dated ones, without the not earned ones; ties keep the catalog order', () => {
    const list: Achievement[] = [
      got('first_game', null),
      got('host', '2026-10-01T10:00:00.000Z'),
      { id: 'games_10', earned: false, earnedAt: null },
      got('veteran', '2026-10-20T10:00:00.000Z'),
      got('first_win', '2026-10-01T10:00:00.000Z'),
      got('streak_5', '2026-10-10T10:00:00.000Z'),
    ];
    expect(recentBadges(list).map((item) => item.id)).toEqual(['veteran', 'streak_5', 'first_win', 'host', 'first_game']);
  });
});

const card = (id: AchievementId): AchievementCard => ({ id, earned: false, earnedAt: null, progress: null });

describe('groupCards', () => {
  it('groups in their order, cards in the catalog order, empty groups left out', () => {
    const groups = groupCards([card('host'), card('fast_answer'), card('veteran'), card('first_game'), card('author_hit')]);
    expect(groups.map((entry) => entry.group)).toEqual(['start', 'speed', 'host']);
    expect(groups.map((entry) => entry.items.map((item) => item.id))).toEqual([['first_game', 'veteran'], ['fast_answer'], ['host', 'author_hit']]);
  });
});
