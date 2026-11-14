import { z } from 'zod';
import { isAnti, type AchievementId } from './achievements';
import type { TrophyKind, TrophyMaterial } from './prizes';
import { legacyStickerOpen, packOf, STICKER_PACKS, type StickerPackId } from './sticker-packs';
import { stickerOf } from './stickers';

/** Нарахування досвіду за гру (15a). */
export const LEVEL_XP = { join: 50, correct: 10, place: [100, 60, 30], dailyCap: 600, minAccounts: 3, minQuestions: 5 } as const;

export const ACHIEVEMENT_XP = { common: 25, rare: 50, epic: 100 } as const;
export type AchievementRarity = keyof typeof ACHIEVEMENT_XP;

/** Рідкості в 12i немає, тож вона тут: антидосягнення (12j) — common, решта ачівок — rare. */
export const COMMON_ACHIEVEMENTS: readonly AchievementId[] = ['first_game', 'first_win', 'host', 'games_10', 'streak_5', 'fast_answer', 'early_bird', 'night_owl'];
export const EPIC_ACHIEVEMENTS: readonly AchievementId[] = ['games_100', 'wins_10', 'host_10', 'streak_10', 'perfect_game', 'win_streak_3', 'ladder_top', 'all_rounds', 'all_types', 'podium_10', 'veteran'];

export function achievementRarity(id: AchievementId): AchievementRarity {
  if (COMMON_ACHIEVEMENTS.includes(id) || isAnti(id)) return 'common';
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

export const NICK_COLORS = ['sky', 'mint', 'sun', 'coral', 'violet', 'gold', 'rainbow', 'blood', 'flame', 'ice', 'venom', 'amethyst', 'moonsilver'] as const;
export type NickColor = (typeof NICK_COLORS)[number];
export const NICK_FRAMES = ['bronze', 'silver', 'gold', 'neon', 'fire', 'rainbow', 'glacier', 'aurora'] as const;
export type NickFrame = (typeof NICK_FRAMES)[number];
export const PROFILE_BADGES = [
  '⭐', '🎯', '🧠', '⚡', '🦉', '🚀', '🏅', '💎', '🔱',
  '🔥', '😎', '🎮', '📚', '🎵', '⚽', '☕', '🐱', '🦊', '🌙', '🍀', '🎲', '🧩', '🎨', '🌻', '🍕', '🎸', '🏀', '🌊', '🌸',
  '🦄', '🥷', '🐺', '👑', '🐉', '💀', '👻',
  '🦋', '🪐', '🌠',
] as const;
export type ProfileBadge = (typeof PROFILE_BADGES)[number];
export const PHOTO_FRAMES = ['crimson', 'silver', 'ink', 'gold', 'cloud', 'crows', 'fire', 'neon', 'thorns', 'eclipse', 'storm', 'aura', 'sunflowers', 'waves', 'constellation'] as const;
export type PhotoFrame = (typeof PHOTO_FRAMES)[number];
export const NICK_FONTS = ['hand', 'round', 'mono', 'poster', 'brush', 'pixel', 'elegant', 'heavy'] as const;
export type NickFont = (typeof NICK_FONTS)[number];

/** Ефекти ніку (34): анімація навколо імені, один на нік. */
export const NICK_EFFECTS = ['light', 'sparks', 'flame', 'frost', 'stardust', 'bolt', 'shimmer'] as const;
export type NickEffect = (typeof NICK_EFFECTS)[number];

export type LookSlot = 'color' | 'frame' | 'badge' | 'photo' | 'font' | 'effect';

export type LevelReward =
  | { kind: 'stickers'; pack: StickerPackId }
  | { kind: 'color'; id: NickColor }
  | { kind: 'frame'; id: NickFrame }
  | { kind: 'badge'; id: ProfileBadge }
  | { kind: 'photo'; id: PhotoFrame }
  | { kind: 'font'; id: NickFont }
  | { kind: 'effect'; id: NickEffect }
  | { kind: 'perk'; perk: LevelPerk }
  | { kind: 'perk_boost'; perk: 'time' }
  | { kind: 'shape'; id: TrophyKind }
  | { kind: 'material'; id: TrophyMaterial };

const REWARD_ROWS: LevelReward[] = [
  { kind: 'stickers', pack: 'basic' },
  { kind: 'color', id: 'sky' },
  { kind: 'stickers', pack: 'food' },
  { kind: 'badge', id: '⭐' },
  { kind: 'perk', perk: 'time' },
  { kind: 'stickers', pack: 'party' },
  { kind: 'color', id: 'mint' },
  { kind: 'frame', id: 'bronze' },
  { kind: 'stickers', pack: 'cozy' },
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

/** Відкрите з першого рівня, у нагороди не входить. */
export const FREE_LOOKS: { readonly [S in LookSlot]: readonly string[] } = {
  color: ['blood'],
  frame: [],
  badge: PROFILE_BADGES.slice(9, 29),
  photo: ['crimson', 'silver', 'ink'],
  font: ['hand', 'round'],
  effect: [],
};

export const LOOK_IDS: { readonly [S in LookSlot]: readonly string[] } = {
  color: NICK_COLORS,
  frame: NICK_FRAMES,
  badge: PROFILE_BADGES,
  photo: PHOTO_FRAMES,
  font: NICK_FONTS,
  effect: NICK_EFFECTS,
};

const EXTRA_REWARDS: { level: number; reward: LevelReward }[] = [
  { level: 3, reward: { kind: 'font', id: 'mono' } },
  { level: 4, reward: { kind: 'photo', id: 'gold' } },
  { level: 6, reward: { kind: 'color', id: 'flame' } },
  { level: 7, reward: { kind: 'font', id: 'poster' } },
  { level: 8, reward: { kind: 'photo', id: 'cloud' } },
  { level: 9, reward: { kind: 'color', id: 'ice' } },
  { level: 10, reward: { kind: 'badge', id: '💀' } },
  { level: 11, reward: { kind: 'badge', id: '🦄' } },
  { level: 12, reward: { kind: 'font', id: 'brush' } },
  { level: 13, reward: { kind: 'photo', id: 'crows' } },
  { level: 14, reward: { kind: 'color', id: 'venom' } },
  { level: 15, reward: { kind: 'badge', id: '👻' } },
  { level: 16, reward: { kind: 'font', id: 'pixel' } },
  { level: 17, reward: { kind: 'photo', id: 'fire' } },
  { level: 18, reward: { kind: 'badge', id: '🥷' } },
  { level: 19, reward: { kind: 'font', id: 'elegant' } },
  { level: 20, reward: { kind: 'photo', id: 'neon' } },
  { level: 21, reward: { kind: 'color', id: 'amethyst' } },
  { level: 22, reward: { kind: 'badge', id: '🐺' } },
  { level: 23, reward: { kind: 'photo', id: 'thorns' } },
  { level: 24, reward: { kind: 'font', id: 'heavy' } },
  { level: 25, reward: { kind: 'badge', id: '👑' } },
  { level: 26, reward: { kind: 'photo', id: 'eclipse' } },
  { level: 27, reward: { kind: 'color', id: 'moonsilver' } },
  { level: 28, reward: { kind: 'badge', id: '🐉' } },
  { level: 29, reward: { kind: 'photo', id: 'storm' } },
  { level: 30, reward: { kind: 'photo', id: 'aura' } },
  { level: 2, reward: { kind: 'shape', id: 'goblet' } },
  { level: 3, reward: { kind: 'material', id: 'copper' } },
  { level: 4, reward: { kind: 'shape', id: 'vase' } },
  { level: 5, reward: { kind: 'shape', id: 'laurel' } },
  { level: 6, reward: { kind: 'shape', id: 'starmedal' } },
  { level: 7, reward: { kind: 'material', id: 'rosegold' } },
  { level: 8, reward: { kind: 'shape', id: 'figure' } },
  { level: 9, reward: { kind: 'material', id: 'wood' } },
  { level: 10, reward: { kind: 'shape', id: 'octagon' } },
  { level: 11, reward: { kind: 'material', id: 'marble' } },
  { level: 12, reward: { kind: 'shape', id: 'lovingcup' } },
  { level: 13, reward: { kind: 'material', id: 'jade' } },
  { level: 14, reward: { kind: 'shape', id: 'ribbon' } },
  { level: 15, reward: { kind: 'material', id: 'platinum' } },
  { level: 16, reward: { kind: 'shape', id: 'flame' } },
  { level: 17, reward: { kind: 'material', id: 'obsidian' } },
  { level: 18, reward: { kind: 'shape', id: 'olive' } },
  { level: 19, reward: { kind: 'material', id: 'pearl' } },
  { level: 20, reward: { kind: 'shape', id: 'cross' } },
  { level: 21, reward: { kind: 'material', id: 'sapphire' } },
  { level: 22, reward: { kind: 'shape', id: 'diadem' } },
  { level: 23, reward: { kind: 'material', id: 'ruby' } },
  { level: 24, reward: { kind: 'shape', id: 'plate' } },
  { level: 25, reward: { kind: 'material', id: 'neon' } },
  { level: 26, reward: { kind: 'shape', id: 'wings' } },
  { level: 28, reward: { kind: 'shape', id: 'fist' } },
  // 34: нові набори стікерів, ефекти ніку й сходинка 31–40.
  { level: 12, reward: { kind: 'stickers', pack: 'animals' } },
  { level: 15, reward: { kind: 'stickers', pack: 'everyday' } },
  { level: 18, reward: { kind: 'effect', id: 'light' } },
  { level: 19, reward: { kind: 'stickers', pack: 'winter' } },
  { level: 23, reward: { kind: 'stickers', pack: 'love' } },
  { level: 27, reward: { kind: 'effect', id: 'sparks' } },
  { level: 28, reward: { kind: 'stickers', pack: 'hugs' } },
  { level: 31, reward: { kind: 'effect', id: 'flame' } },
  { level: 31, reward: { kind: 'badge', id: '🦋' } },
  { level: 32, reward: { kind: 'photo', id: 'sunflowers' } },
  { level: 32, reward: { kind: 'stickers', pack: 'baking' } },
  { level: 33, reward: { kind: 'effect', id: 'frost' } },
  { level: 33, reward: { kind: 'frame', id: 'glacier' } },
  { level: 34, reward: { kind: 'photo', id: 'waves' } },
  { level: 34, reward: { kind: 'badge', id: '🪐' } },
  { level: 35, reward: { kind: 'effect', id: 'stardust' } },
  { level: 36, reward: { kind: 'stickers', pack: 'spooky' } },
  { level: 36, reward: { kind: 'photo', id: 'constellation' } },
  { level: 37, reward: { kind: 'effect', id: 'bolt' } },
  { level: 38, reward: { kind: 'stickers', pack: 'mischief' } },
  { level: 39, reward: { kind: 'stickers', pack: 'extra' } },
  { level: 40, reward: { kind: 'effect', id: 'shimmer' } },
  { level: 40, reward: { kind: 'frame', id: 'aurora' } },
  { level: 40, reward: { kind: 'badge', id: '🌠' } },
];

/** Найвищий рівень із нагородою (34); далі рахуємо лише досвід. */
export const LEVEL_REWARDS_TOP = 40;

/** Нагороди рівнів 1..LEVEL_REWARDS_TOP (на рівні їх може бути кілька), стабільно за рівнем. */
export const LEVEL_REWARDS: readonly { level: number; reward: LevelReward }[] = [
  ...REWARD_ROWS.map((reward, i) => ({ level: i + 1, reward })),
  ...EXTRA_REWARDS,
]
  .map((r, i) => ({ r, i }))
  .sort((x, y) => x.r.level - y.r.level || x.i - y.i)
  .map(({ r }) => r);

export function rewardsUpTo(level: number): { level: number; reward: LevelReward }[] {
  return LEVEL_REWARDS.filter((r) => r.level <= level);
}

export function perksFor(level: number): PerkGrant {
  const got = new Set<LevelPerk>();
  for (const { reward } of rewardsUpTo(level)) if (reward.kind === 'perk') got.add(reward.perk);
  const boostAt = LEVEL_REWARDS.find((r) => r.reward.kind === 'perk_boost')?.level ?? Infinity;
  return { kinds: LEVEL_PERKS.filter((k) => got.has(k)), timeMs: level >= boostAt ? PERK_TIME_MS.boosted : PERK_TIME_MS.base };
}

/** Нагороди трьох найближчих рівнів, на яких щось відкривається. */
export function nextRewards(level: number): { level: number; reward: LevelReward }[] {
  const levels = [...new Set(LEVEL_REWARDS.filter((r) => r.level > level).map((r) => r.level))].slice(0, 3);
  return LEVEL_REWARDS.filter((r) => levels.includes(r.level));
}

/** Рівень, з якого відкрито набір стікерів (для «з рівня N»). */
export function packLevel(pack: StickerPackId): number {
  return LEVEL_REWARDS.find((r) => r.reward.kind === 'stickers' && r.reward.pack === pack)?.level ?? 1;
}

/** Рівень, з якого відкрито форму чи матеріал трофея; наявні й невідомі — 1. */
export function trophyUnlockLevel(what: 'shape' | 'material', id: string): number {
  return LEVEL_REWARDS.find((r) => r.reward.kind === what && r.reward.id === id)?.level ?? 1;
}

/**
 * Що відкриває стікери понад рівень (34): набори за здобуті досягнення і рівень успадкування —
 * рівень акаунта в мить переходу на набори (рішення власника «м'якше»: усе, що давало старе правило, лишається).
 */
export interface StickerExtra {
  packs?: readonly StickerPackId[];
  legacyLevel?: number | null;
}

/** Набори, відкриті цілком: за рівнем або досягненням. null — гість. */
export function stickerPacksOpen(level: number | null, extra: StickerExtra = {}): StickerPackId[] {
  const at = level ?? 1;
  return STICKER_PACKS.filter((p) => packLevel(p) <= at || (extra.packs ?? []).includes(p));
}

/**
 * Стікер відкрито: його набір відкрито, або його давало старе правило серій на рівні успадкування.
 * Старе правило на рівні 1 (серія nya, як у гостя досі) — це підлога для всіх: гість нічого не втрачає,
 * а вхід в акаунт ніколи не забирає стікерів.
 */
export function stickerOpen(id: string, level: number | null, extra: StickerExtra = {}): boolean {
  if (stickerOf(id) === undefined) return false;
  return legacyStickerOpen(id, Math.max(1, extra.legacyLevel ?? 1)) || stickerPacksOpen(level, extra).includes(packOf(id));
}

export interface NickLooks {
  color: NickColor | null;
  frame: NickFrame | null;
  badge: ProfileBadge | null;
  photo: PhotoFrame | null;
  font: NickFont | null;
  effect: NickEffect | null;
}

/** Старий клієнт шле тіло без photo, font чи effect: відсутнє означає «лишити збережене». */
export type LooksInput = Omit<NickLooks, 'photo' | 'font' | 'effect'> & Partial<Pick<NickLooks, 'photo' | 'font' | 'effect'>>;

export const looksSchema: z.ZodType<LooksInput> = z
  .object({
    color: z.enum(NICK_COLORS).nullable(),
    frame: z.enum(NICK_FRAMES).nullable(),
    badge: z.enum(PROFILE_BADGES).nullable(),
    photo: z.enum(PHOTO_FRAMES).nullable().optional(),
    font: z.enum(NICK_FONTS).nullable().optional(),
    effect: z.enum(NICK_EFFECTS).nullable().optional(),
  })
  .strict();

/** Рівень, з якого відкрито вигляд: вільне — 1, нагорода — її рівень, невідоме — Infinity. */
export function lookLevel(slot: LookSlot, id: string): number {
  if (FREE_LOOKS[slot].includes(id)) return 1;
  return LEVEL_REWARDS.find((r) => r.reward.kind === slot && (r.reward as { id: string }).id === id)?.level ?? Infinity;
}

const LOOK_SLOTS: readonly LookSlot[] = ['color', 'frame', 'badge', 'photo', 'font', 'effect'];

export function looksAllowed(looks: NickLooks, level: number): boolean {
  return LOOK_SLOTS.every((slot) => looks[slot] === null || lookLevel(slot, looks[slot]) <= level);
}

/** Відкидає закрите (рівень упав): кожне поле або відкрите, або null. */
export function looksShown(looks: NickLooks, level: number): NickLooks {
  const open = <T extends string>(slot: LookSlot, id: T | null): T | null => (id !== null && lookLevel(slot, id) <= level ? id : null);
  return {
    color: open('color', looks.color),
    frame: open('frame', looks.frame),
    badge: open('badge', looks.badge),
    photo: open('photo', looks.photo),
    font: open('font', looks.font),
    effect: open('effect', looks.effect),
  };
}

/** Біля ніку в зрізах. effect — лише коли ефект є (старі клієнти й фікстури без ключа). */
export interface NickLevel {
  level: number;
  color: NickColor | null;
  frame: NickFrame | null;
  font: NickFont | null;
  effect?: NickEffect;
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
