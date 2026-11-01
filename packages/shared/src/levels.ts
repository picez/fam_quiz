import { z } from 'zod';
import type { AchievementId } from './achievements';
import { STICKER_SERIES, stickerOf, type StickerSeries } from './stickers';

/** Нарахування досвіду за гру (15a). */
export const LEVEL_XP = { join: 50, correct: 10, place: [100, 60, 30], dailyCap: 600, minAccounts: 3, minQuestions: 5 } as const;

export const ACHIEVEMENT_XP = { common: 25, rare: 50, epic: 100 } as const;
export type AchievementRarity = keyof typeof ACHIEVEMENT_XP;

/** Рідкості в 12i немає, тож вона тут: решта ачівок — rare. */
export const COMMON_ACHIEVEMENTS: readonly AchievementId[] = ['first_game', 'first_win', 'host', 'games_10', 'streak_5', 'fast_answer', 'early_bird', 'night_owl'];
export const EPIC_ACHIEVEMENTS: readonly AchievementId[] = ['games_100', 'wins_10', 'host_10', 'streak_10', 'perfect_game', 'win_streak_3', 'ladder_top', 'all_rounds', 'all_types', 'podium_10', 'veteran'];

export function achievementRarity(id: AchievementId): AchievementRarity {
  if (COMMON_ACHIEVEMENTS.includes(id)) return 'common';
  if (EPIC_ACHIEVEMENTS.includes(id)) return 'epic';
  return 'rare';
}

/** Загальний досвід, з яким починається рівень N. */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round((100 * level ** 1.5) / 10) * 10;
}

export function levelOf(xp: number): number {
  let level = Math.max(1, Math.floor((Math.max(0, xp) / 100) ** (2 / 3)) - 1);
  while (xpForLevel(level + 1) <= xp) level++;
  while (level > 1 && xpForLevel(level) > xp) level--;
  return level;
}

export interface LevelProgress {
  level: number;
  xp: number;
  levelAt: number;
  nextAt: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelOf(xp);
  return { level, xp, levelAt: xpForLevel(level), nextAt: xpForLevel(level + 1) };
}

export const LEVEL_PERKS = ['time', 'hint', 'ward'] as const;
export type LevelPerk = (typeof LEVEL_PERKS)[number];
export type ActivePerk = Exclude<LevelPerk, 'ward'>;
export const PERK_TIME_MS = { base: 5_000, boosted: 10_000 } as const;

export interface PerkGrant {
  kinds: LevelPerk[];
  timeMs: number;
}

export const NICK_COLORS = ['sky', 'mint', 'sun', 'coral', 'violet', 'gold', 'rainbow'] as const;
export type NickColor = (typeof NICK_COLORS)[number];
export const NICK_FRAMES = ['bronze', 'silver', 'gold', 'neon', 'fire', 'rainbow'] as const;
export type NickFrame = (typeof NICK_FRAMES)[number];
export const PROFILE_BADGES = ['⭐', '🎯', '🧠', '⚡', '🦉', '🚀', '🏅', '💎', '🔱'] as const;
export type ProfileBadge = (typeof PROFILE_BADGES)[number];

export type LevelReward =
  | { kind: 'stickers'; series: StickerSeries }
  | { kind: 'color'; id: NickColor }
  | { kind: 'frame'; id: NickFrame }
  | { kind: 'badge'; id: ProfileBadge }
  | { kind: 'perk'; perk: LevelPerk }
  | { kind: 'perk_boost'; perk: 'time' };

const REWARD_ROWS: LevelReward[] = [
  { kind: 'stickers', series: 'nya' },
  { kind: 'color', id: 'sky' },
  { kind: 'stickers', series: 'nyaa' },
  { kind: 'badge', id: '⭐' },
  { kind: 'perk', perk: 'time' },
  { kind: 'stickers', series: 'nyas' },
  { kind: 'color', id: 'mint' },
  { kind: 'frame', id: 'bronze' },
  { kind: 'stickers', series: 'other' },
  { kind: 'perk', perk: 'hint' },
  { kind: 'color', id: 'sun' },
  { kind: 'frame', id: 'silver' },
  { kind: 'badge', id: '🎯' },
  { kind: 'color', id: 'coral' },
  { kind: 'perk', perk: 'ward' },
  { kind: 'frame', id: 'gold' },
  { kind: 'badge', id: '🧠' },
  { kind: 'color', id: 'violet' },
  { kind: 'badge', id: '⚡' },
  { kind: 'perk_boost', perk: 'time' },
  { kind: 'frame', id: 'neon' },
  { kind: 'color', id: 'gold' },
  { kind: 'badge', id: '🦉' },
  { kind: 'badge', id: '🚀' },
  { kind: 'frame', id: 'fire' },
  { kind: 'color', id: 'rainbow' },
  { kind: 'badge', id: '🏅' },
  { kind: 'badge', id: '💎' },
  { kind: 'badge', id: '🔱' },
  { kind: 'frame', id: 'rainbow' },
];

/** Одна нагорода на рівень 1..30. */
export const LEVEL_REWARDS: readonly { level: number; reward: LevelReward }[] = REWARD_ROWS.map((reward, i) => ({ level: i + 1, reward }));

export function rewardsUpTo(level: number): { level: number; reward: LevelReward }[] {
  return LEVEL_REWARDS.filter((r) => r.level <= level);
}

export function perksFor(level: number): PerkGrant {
  const got = new Set<LevelPerk>();
  for (const { reward } of rewardsUpTo(level)) if (reward.kind === 'perk') got.add(reward.perk);
  const boostAt = LEVEL_REWARDS.find((r) => r.reward.kind === 'perk_boost')?.level ?? Infinity;
  return { kinds: LEVEL_PERKS.filter((k) => got.has(k)), timeMs: level >= boostAt ? PERK_TIME_MS.boosted : PERK_TIME_MS.base };
}

/** Рівень, з якого відкрито серію (для «з рівня N»). */
export function seriesLevel(series: StickerSeries): number {
  return LEVEL_REWARDS.find((r) => r.reward.kind === 'stickers' && r.reward.series === series)?.level ?? 1;
}

/** null — гість: лише 'nya'. */
export function stickerSeriesOpen(level: number | null): StickerSeries[] {
  const at = level ?? 1;
  return STICKER_SERIES.filter((s) => seriesLevel(s) <= at);
}

export function stickerOpen(id: string, level: number | null): boolean {
  const sticker = stickerOf(id);
  return sticker !== undefined && stickerSeriesOpen(level).includes(sticker.series);
}

export interface NickLooks {
  color: NickColor | null;
  frame: NickFrame | null;
  badge: ProfileBadge | null;
}

export const looksSchema: z.ZodType<NickLooks> = z
  .object({
    color: z.enum(NICK_COLORS).nullable(),
    frame: z.enum(NICK_FRAMES).nullable(),
    badge: z.enum(PROFILE_BADGES).nullable(),
  })
  .strict();

function unlockLevel(kind: 'color' | 'frame' | 'badge', id: string): number {
  return LEVEL_REWARDS.find((r) => r.reward.kind === kind && (r.reward as { id: string }).id === id)?.level ?? Infinity;
}

export function looksAllowed(looks: NickLooks, level: number): boolean {
  return (
    (looks.color === null || unlockLevel('color', looks.color) <= level) &&
    (looks.frame === null || unlockLevel('frame', looks.frame) <= level) &&
    (looks.badge === null || unlockLevel('badge', looks.badge) <= level)
  );
}

/** Відкидає закрите (рівень упав): кожне поле або відкрите, або null. */
export function looksShown(looks: NickLooks, level: number): NickLooks {
  return {
    color: looks.color !== null && unlockLevel('color', looks.color) <= level ? looks.color : null,
    frame: looks.frame !== null && unlockLevel('frame', looks.frame) <= level ? looks.frame : null,
    badge: looks.badge !== null && unlockLevel('badge', looks.badge) <= level ? looks.badge : null,
  };
}

/** Біля ніку в зрізах. */
export interface NickLevel {
  level: number;
  color: NickColor | null;
  frame: NickFrame | null;
}

export interface LevelUnlock {
  level: number;
  reward: LevelReward;
  at: string | null;
}

export interface OwnLevel {
  progress: LevelProgress;
  unlocked: LevelUnlock[];
  next: { level: number; reward: LevelReward }[];
  looks: NickLooks;
}

export interface PublicLevel {
  level: number;
  looks: NickLooks;
}

export const perkSchema: z.ZodType<{ kind: ActivePerk }> = z.object({ kind: z.enum(['time', 'hint']) });
