import { z } from 'zod';
import { NICK_FONTS, lookLevel, stickerOpen } from './levels';
import type { NickFont } from './levels';
import type { TrophyKind } from './prizes';
import { IMAGE_URL } from './quiz';
import { stickerOf } from './stickers';
import { UNSTORABLE, isStorable } from './text';

export const TROPHY_PHOTO_PLACES = ['ring', 'medallion', 'gems', 'plaque', 'backdrop'] as const;
export type TrophyPhotoPlace = (typeof TROPHY_PHOTO_PLACES)[number];
/** Не плутати з PHOTO_FRAMES профілю (24d). */
export const TROPHY_PHOTO_FRAMES = ['none', 'gold', 'round', 'rounded'] as const;
export type TrophyPhotoFrame = (typeof TROPHY_PHOTO_FRAMES)[number];
export const TROPHY_PHOTO_STYLES = ['normal', 'bw', 'sepia'] as const;
export type TrophyPhotoStyle = (typeof TROPHY_PHOTO_STYLES)[number];
export const INSCRIPTION_PLACES = ['rim', 'band', 'plaque', 'back'] as const;
export type InscriptionPlace = (typeof INSCRIPTION_PLACES)[number];
export const INSCRIPTION_LOOKS = ['engraved', 'embossed', 'colored'] as const;
export type InscriptionLook = (typeof INSCRIPTION_LOOKS)[number];
export const TROPHY_EFFECTS = ['glow', 'sparks', 'rays', 'fire', 'snow', 'none'] as const;
export type TrophyEffect = (typeof TROPHY_EFFECTS)[number];
export const TROPHY_APPEARANCES = ['spin', 'rise', 'drop', 'flash'] as const;
export type TrophyAppearance = (typeof TROPHY_APPEARANCES)[number];
export const STICKER_PLACES = ['front', 'back', 'left', 'right', 'base-left', 'base-right'] as const;
export type StickerPlace = (typeof STICKER_PLACES)[number];

export const DECOR_LIMITS = {
  ring: 16,
  gems: 8,
  single: 1,
  inscriptions: 4,
  stickers: 6,
  rim: 80,
  band: 40,
  plaque: 40,
  back: 60,
} as const;

export interface DecorPhoto {
  url: string;
  /** x, y ∈ [0,1] — центр кадру; scale ∈ [1,4], 1 — «заповнити». */
  crop: { x: number; y: number; scale: number };
}
export interface Inscription {
  place: InscriptionPlace;
  text: string;
  /** null — «класичний» шрифт Georgia, serif. */
  font: NickFont | null;
  look: InscriptionLook;
  /** #rrggbb */
  color: string;
}
export interface TrophyDecor {
  photos: DecorPhoto[];
  photoPlace: TrophyPhotoPlace;
  frame: TrophyPhotoFrame;
  photoStyle: TrophyPhotoStyle;
  inscriptions: Inscription[];
  effect: { kind: TrophyEffect; color?: string };
  appearance: TrophyAppearance;
  stickers: { id: string; place: StickerPlace }[];
}

/** Які місця має кожна форма: редактор пропонує лише їх, рендер решту мовчки пропускає. */
export const DECOR_SUPPORT: Record<
  TrophyKind,
  { photo: readonly TrophyPhotoPlace[]; inscription: readonly InscriptionPlace[]; sticker: readonly StickerPlace[] }
> = {
  cup: {
    photo: ['ring', 'medallion', 'gems', 'plaque', 'backdrop'],
    inscription: ['rim', 'band', 'plaque', 'back'],
    sticker: STICKER_PLACES,
  },
  medal: {
    photo: ['medallion', 'gems', 'backdrop'],
    inscription: ['back'],
    sticker: ['front', 'back', 'left', 'right'],
  },
  crown: {
    photo: ['ring', 'medallion', 'gems', 'plaque', 'backdrop'],
    inscription: ['band', 'plaque'],
    sticker: STICKER_PLACES,
  },
  star: {
    photo: ['medallion', 'gems', 'plaque', 'backdrop'],
    inscription: ['plaque', 'back'],
    sticker: STICKER_PLACES,
  },
  statuette: {
    photo: ['medallion', 'gems', 'plaque', 'backdrop'],
    inscription: ['band', 'plaque'],
    sticker: STICKER_PLACES,
  },
  grail: {
    photo: ['ring', 'medallion', 'gems', 'plaque', 'backdrop'],
    inscription: ['rim', 'band', 'plaque', 'back'],
    sticker: STICKER_PLACES,
  },
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_LINES = (place: InscriptionPlace): number => (place === 'plaque' ? 2 : 1);

/** Рядки: кожен стиснуто й обрізано, порожні прибрано. */
const normalizeLines = (raw: string): string =>
  raw
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');

const photoSchema = z
  .object({
    url: z.string().regex(IMAGE_URL),
    crop: z
      .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), scale: z.number().min(1).max(4) })
      .strict(),
  })
  .strict();

const inscriptionSchema = z
  .object({
    place: z.enum(INSCRIPTION_PLACES),
    text: z.string().max(400).transform(normalizeLines),
    font: z.enum(NICK_FONTS).nullable(),
    look: z.enum(INSCRIPTION_LOOKS),
    color: z.string().regex(HEX),
  })
  .strict()
  .superRefine((v, ctx) => {
    const lines = v.text.split('\n').length;
    if (v.text.length < 1 || v.text.length > DECOR_LIMITS[v.place] || lines > MAX_LINES(v.place)) {
      ctx.addIssue({ code: 'custom', message: 'decor_text_length', path: ['text'] });
    } else if (!isStorable(v.text)) {
      ctx.addIssue({ code: 'custom', message: UNSTORABLE, path: ['text'] });
    }
  });

const photoLimit = (place: TrophyPhotoPlace): number =>
  place === 'ring' ? DECOR_LIMITS.ring : place === 'gems' ? DECOR_LIMITS.gems : DECOR_LIMITS.single;

export const trophyDecorSchema = z
  .object({
    photos: z.array(photoSchema).max(DECOR_LIMITS.ring),
    photoPlace: z.enum(TROPHY_PHOTO_PLACES),
    frame: z.enum(TROPHY_PHOTO_FRAMES),
    photoStyle: z.enum(TROPHY_PHOTO_STYLES),
    inscriptions: z.array(inscriptionSchema).max(DECOR_LIMITS.inscriptions),
    effect: z
      .object({ kind: z.enum(TROPHY_EFFECTS), color: z.string().regex(HEX).optional() })
      .strict(),
    appearance: z.enum(TROPHY_APPEARANCES),
    stickers: z
      .array(z.object({ id: z.string(), place: z.enum(STICKER_PLACES) }).strict())
      .max(DECOR_LIMITS.stickers),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.photos.length > photoLimit(d.photoPlace)) {
      ctx.addIssue({ code: 'custom', message: 'decor_too_many_photos', path: ['photos'] });
    }
    if (new Set(d.inscriptions.map((i) => i.place)).size !== d.inscriptions.length) {
      ctx.addIssue({ code: 'custom', message: 'decor_place_twice', path: ['inscriptions'] });
    }
    if (d.photos.length > 0 && d.photoPlace === 'plaque' && d.inscriptions.some((i) => i.place === 'plaque')) {
      ctx.addIssue({ code: 'custom', message: 'decor_plaque_twice', path: ['inscriptions'] });
    }
    if (new Set(d.stickers.map((s) => s.place)).size !== d.stickers.length) {
      ctx.addIssue({ code: 'custom', message: 'decor_place_twice', path: ['stickers'] });
    }
    if (d.stickers.some((s) => !stickerOf(s.id))) {
      ctx.addIssue({ code: 'custom', message: 'decor_unknown_sticker', path: ['stickers'] });
    }
  }) as unknown as z.ZodType<TrophyDecor>;

/** Оформлення без місць, яких форма не має (форму могли змінити в старому редакторі). */
export function shownDecor(kind: TrophyKind, decor: TrophyDecor): TrophyDecor {
  const support = DECOR_SUPPORT[kind];
  return {
    ...decor,
    photos: support.photo.includes(decor.photoPlace) ? decor.photos : [],
    inscriptions: decor.inscriptions.filter((i) => support.inscription.includes(i.place)),
    stickers: decor.stickers.filter((s) => support.sticker.includes(s.place)),
  };
}

export const EMPTY_DECOR: TrophyDecor = {
  photos: [],
  photoPlace: 'ring',
  frame: 'none',
  photoStyle: 'normal',
  inscriptions: [],
  effect: { kind: 'none' },
  appearance: 'spin',
  stickers: [],
};

/** Глибока рівність з EMPTY_DECOR (колір ефекту теж має бути відсутній). */
export function isEmptyDecor(decor: TrophyDecor): boolean {
  return (
    decor.photos.length === 0 &&
    decor.photoPlace === EMPTY_DECOR.photoPlace &&
    decor.frame === EMPTY_DECOR.frame &&
    decor.photoStyle === EMPTY_DECOR.photoStyle &&
    decor.inscriptions.length === 0 &&
    decor.effect.kind === 'none' &&
    decor.effect.color === undefined &&
    decor.appearance === EMPTY_DECOR.appearance &&
    decor.stickers.length === 0
  );
}

/** true — є шрифт чи наліпка, закриті для level, і їх немає в stored. */
export function decorLocked(decor: TrophyDecor, level: number, stored: TrophyDecor | null | undefined): boolean {
  const fonts = new Set(stored?.inscriptions.map((i) => i.font));
  const stickers = new Set(stored?.stickers.map((s) => s.id));
  return (
    decor.inscriptions.some((i) => i.font !== null && !fonts.has(i.font) && lookLevel('font', i.font) > level) ||
    decor.stickers.some((s) => !stickers.has(s.id) && !stickerOpen(s.id, level))
  );
}
