import { z } from 'zod';
import { trophyDecorSchema } from './decor';
import type { TrophyDecor } from './decor';
import { trophyUnlockLevel } from './levels';
import { IMAGE_URL } from './quiz';
import type { ShowcasePins } from './showcase';
import { UNSTORABLE, isStorable } from './text';

/** Переліки лише доповнюються (25e): старі рядки prize / prize_award лишаються чинними. */
export const TROPHY_KINDS = [
  'cup', 'medal', 'crown', 'star', 'statuette', 'grail',
  'lovingcup', 'vase', 'plate', 'goblet', 'starmedal', 'cross', 'octagon', 'ribbon', 'diadem', 'laurel', 'olive', 'figure', 'flame', 'wings', 'fist',
] as const;
export type TrophyKind = (typeof TROPHY_KINDS)[number];
export const TROPHY_MATERIALS = ['bronze', 'silver', 'gold', 'diamond', 'rosegold', 'platinum', 'copper', 'obsidian', 'jade', 'pearl', 'ruby', 'sapphire', 'neon', 'marble', 'wood'] as const;
export type TrophyMaterial = (typeof TROPHY_MATERIALS)[number];
/** «Преміум» — лише позначка в редакторі (платежів немає): відкривається тим самим рівнем, сервер її не перевіряє. */
export const PREMIUM_KINDS: readonly TrophyKind[] = ['diadem', 'wings'];
export const PREMIUM_MATERIALS: readonly TrophyMaterial[] = ['sapphire', 'ruby', 'neon'];
export type PrizePlace = 1 | 2 | 3;
export const PRIZE_LIMITS = { name: 40, engraving: 80, realText: 120, title: 32, perOwner: 50 } as const;
/** Скільки стоїть титул біля ніку: 7 днів. */
export const TITLE_MS = 7 * 24 * 60 * 60_000;
export const CEREMONY_MS = { step: 3500, winner: 6000 } as const;
export const SHOWCASE_MAX = 60;

export type TrophyLook = { kind: TrophyKind; material: TrophyMaterial; decor?: TrophyDecor | null };

export interface PrizeContent {
  name: string;
  trophy: TrophyLook | null;
  engraving: string | null;
  real: { text: string; photoUrl: string | null } | null;
  title: string | null;
  diploma: boolean;
}

/**
 * Форма чи матеріал закриті для рівня. Як у шрифтів: збережене в цьому призі (stored) лишається чинним,
 * навіть якщо рівень упав чи приз створив адмін.
 */
export function trophyLocked(
  trophy: { kind: TrophyKind; material: TrophyMaterial },
  level: number,
  stored: { kind: TrophyKind; material: TrophyMaterial } | null | undefined,
): boolean {
  const kindLocked = trophyUnlockLevel('shape', trophy.kind) > level && trophy.kind !== stored?.kind;
  const materialLocked = trophyUnlockLevel('material', trophy.material) > level && trophy.material !== stored?.material;
  return kindLocked || materialLocked;
}

/** Текст призу: краї обрізано, пробіли стиснуто, придатний для бази, 1..max символів. */
const text = (max: number) =>
  z
    .string()
    .max(max * 4)
    .transform((value) => value.replace(/\s+/g, ' ').trim())
    .pipe(z.string().min(1).max(max).refine(isStorable, UNSTORABLE));

export const prizeContentSchema = z
  .object({
    name: text(PRIZE_LIMITS.name),
    trophy: z
      .object({
        kind: z.enum(TROPHY_KINDS),
        material: z.enum(TROPHY_MATERIALS),
        decor: trophyDecorSchema.nullable().optional(),
      })
      .strict()
      .nullable(),
    engraving: text(PRIZE_LIMITS.engraving).nullable(),
    real: z
      .object({ text: text(PRIZE_LIMITS.realText), photoUrl: z.string().regex(IMAGE_URL).nullable() })
      .strict()
      .nullable(),
    title: text(PRIZE_LIMITS.title).nullable(),
    diploma: z.boolean(),
  })
  .strict()
  .refine((c) => c.trophy !== null || c.engraving !== null || c.real !== null || c.title !== null || c.diploma, {
    message: 'prize_empty',
  }) as unknown as z.ZodType<PrizeContent>;

export type PrizeStatus = 'free' | 'reserved';
/** Приз складу для власника. */
export interface PrizeItem {
  id: string;
  content: PrizeContent;
  status: PrizeStatus;
  createdAt: string;
  /** Резерв належить збереженій (недограній) грі; поле є лише коли true. */
  inSavedGame?: true;
}

type Places = [string | null, string | null, string | null];

/** Тіло PUT …/prizes: id призу чи null для кожного з трьох місць; не-null різні. */
export const placesSchema = z
  .object({ places: z.tuple([z.string().uuid().nullable(), z.string().uuid().nullable(), z.string().uuid().nullable()]) })
  .strict()
  .refine(
    ({ places }) => {
      const ids = places.filter((id): id is string => id !== null);
      return new Set(ids).size === ids.length;
    },
    { message: 'prize_twice' },
  ) as unknown as z.ZodType<{ places: Places }>;

/** GET …/by-code/:code/prizes: що можна покласти і що лежить зараз. */
export interface PrizePlacesInfo {
  options: PrizeItem[];
  places: Places;
}

/** Приз на місці кімнати (сервер; і в знімку кімнати). */
export interface PlacedPrize {
  place: PrizePlace;
  id: string;
  content: PrizeContent;
}
export const placedPrizeSchema = z
  .object({
    place: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    id: z.string().uuid(),
    content: prizeContentSchema,
  })
  .strict() as unknown as z.ZodType<PlacedPrize>;

export interface PrizeWinner {
  name: string;
  members: string[];
}
/** Зріз: зміст без name; winner — лише у finished, null — на місці нікого немає. */
export interface PrizeShown {
  place: PrizePlace;
  content: Omit<PrizeContent, 'name'>;
  winner: PrizeWinner | null;
}
export interface PrizesView {
  places: PrizeShown[];
  /** Лише телефон у finished: місце цієї людини; account — чи піде у вітрину. */
  mine: { place: PrizePlace; account: boolean } | null;
}
export interface AwardCard {
  id: string;
  place: PrizePlace;
  content: Omit<PrizeContent, 'name'>;
  quizTitle: string;
  nickname: string;
  awardedAt: string;
}
export interface Showcase {
  title: { text: string; until: string } | null;
  awards: AwardCard[];
  /** Закріплене власником (23a): лише наявні нагороди й отримані ачівки, у порядку закріплення. */
  pins: ShowcasePins;
}

/** Без name: зміст для сцени й вітрини. */
export function publicContent(content: PrizeContent): Omit<PrizeContent, 'name'> {
  const { name: _name, ...rest } = content;
  return rest;
}
