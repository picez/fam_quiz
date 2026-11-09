import {
  DECOR_LIMITS,
  EMPTY_DECOR,
  INSCRIPTION_PLACES,
  STICKER_PLACES,
  isEmptyDecor,
  prizeContentSchema,
  shownDecor,
  type DecorPhoto,
  type Inscription,
  type InscriptionPlace,
  type PrizeContent,
  type StickerPlace,
  type TrophyAppearance,
  type TrophyDecor,
  type TrophyEffect,
  type TrophyKind,
  type TrophyLook,
  type TrophyMaterial,
  type TrophyPhotoFrame,
  type TrophyPhotoPlace,
  type TrophyPhotoStyle,
} from '@quiz/shared';
import { GLOW_DEFAULT } from '../trophy/effect-plan';
import { CROP_RESET } from './crop';

export interface StudioDraft {
  name: string;
  trophy: { kind: TrophyKind; material: TrophyMaterial } | null;
  /** Завжди є; місця, яких форма не має, теж лишаються (форму можна змінити туди й назад). */
  decor: TrophyDecor;
  /** '' → null */
  engraving: string;
  real: { text: string; photoUrl: string | null } | null;
  /** '' → null */
  title: string;
  diploma: boolean;
}

export const STUDIO_SWATCHES = [
  { id: 'gold', hex: '#ffd36b' },
  { id: 'white', hex: '#ffffff' },
  { id: 'dark', hex: '#3a2a0e' },
  { id: 'red', hex: '#e02531' },
  { id: 'blue', hex: '#4fc3f7' },
  { id: 'mint', hex: '#3ddcc0' },
  { id: 'violet', hex: '#9b8cff' },
  { id: 'orange', hex: '#ff7a1a' },
] as const;

/** Колір нового напису. */
export const INSCRIPTION_COLOR = '#3a2a0e';

export function draftFrom(initial: PrizeContent | null): StudioDraft {
  if (initial === null) {
    return {
      name: '',
      trophy: { kind: 'cup', material: 'gold' },
      decor: EMPTY_DECOR,
      engraving: '',
      real: null,
      title: '',
      diploma: false,
    };
  }
  return {
    name: initial.name,
    trophy: initial.trophy === null ? null : { kind: initial.trophy.kind, material: initial.trophy.material },
    decor: initial.trophy?.decor ?? EMPTY_DECOR,
    engraving: initial.engraving ?? '',
    real: initial.real === null ? null : { ...initial.real },
    title: initial.title ?? '',
    diploma: initial.diploma,
  };
}

/**
 * Чернетка → зміст. Оформлення без місць, яких форма не має, і без фото понад межу місця. Порожнє оформлення:
 * у призу, що мав decor, — `null` (прибрати); у призу без нього — ключа немає (лишається як було);
 * грааль завжди зберігає decor (сервер теж це гарантує).
 */
export function contentOf(draft: StudioDraft, initial: PrizeContent | null): PrizeContent {
  let trophy: PrizeContent['trophy'] = null;
  if (draft.trophy !== null) {
    const { kind, material } = draft.trophy;
    const decor = shownDecor(kind, withinPlaceLimit(draft.decor));
    if (!isEmptyDecor(decor) || kind === 'grail') trophy = { kind, material, decor };
    else if (initial?.trophy?.decor != null) trophy = { kind, material, decor: null };
    else trophy = { kind, material };
  }
  return {
    name: draft.name,
    trophy,
    engraving: draft.engraving.trim() === '' ? null : draft.engraving,
    real: draft.real === null ? null : { ...draft.real },
    title: draft.title.trim() === '' ? null : draft.title,
    diploma: draft.diploma,
  };
}

/** Що показує кубок на сцені; null — приз без трофея. */
export function studioLook(draft: StudioDraft): TrophyLook | null {
  return draft.trophy === null ? null : { kind: draft.trophy.kind, material: draft.trophy.material, decor: withinPlaceLimit(draft.decor) };
}

/**
 * Фото, що влазять у вибране місце (перші photoLimit). Чернетка тримає всі: місце можна змінити туди й назад без
 * втрат, а в збережене й на кубок ідуть лише ці.
 */
export function withinPlaceLimit(decor: TrophyDecor): TrophyDecor {
  const limit = photoLimit(decor.photoPlace);
  return decor.photos.length <= limit ? decor : { ...decor, photos: decor.photos.slice(0, limit) };
}

/** id поля назви в «Приз»: коли його покидають, редактор показує, чому приз ще не зберегти. */
export const STUDIO_NAME_FIELD = 'studio-name';

export type StudioAction =
  | { type: 'name' | 'engraving' | 'title'; value: string }
  | { type: 'trophy'; kind: TrophyKind | null }
  | { type: 'material'; material: TrophyMaterial }
  | { type: 'real'; value: StudioDraft['real'] }
  /** Лише фото справжнього призу: завантаження може прийти, коли інструмент «Приз» уже закрито (текст тоді не чіпаємо). */
  | { type: 'realPhoto'; photoUrl: string | null }
  | { type: 'diploma'; value: boolean }
  | { type: 'photoPlace'; place: TrophyPhotoPlace }
  | { type: 'addPhotos'; urls: string[] }
  | { type: 'movePhoto'; from: number; to: number }
  | { type: 'removePhoto'; index: number }
  | { type: 'crop'; index: number; crop: DecorPhoto['crop'] }
  | { type: 'frame'; frame: TrophyPhotoFrame }
  | { type: 'photoStyle'; style: TrophyPhotoStyle }
  | { type: 'inscription'; place: InscriptionPlace; value: Inscription | null }
  | { type: 'sticker'; place: StickerPlace; id: string | null }
  | { type: 'effect'; kind: TrophyEffect; color?: string }
  | { type: 'appearance'; appearance: TrophyAppearance };

export function photoLimit(place: TrophyPhotoPlace): number {
  return place === 'ring' ? DECOR_LIMITS.ring : place === 'gems' ? DECOR_LIMITS.gems : DECOR_LIMITS.single;
}

const withDecor = (draft: StudioDraft, patch: Partial<TrophyDecor>): StudioDraft => ({
  ...draft,
  decor: { ...draft.decor, ...patch },
});

export function studioReducer(draft: StudioDraft, action: StudioAction): StudioDraft {
  const { decor } = draft;
  switch (action.type) {
    case 'name':
      return { ...draft, name: action.value };
    case 'engraving':
      return { ...draft, engraving: action.value };
    case 'title':
      return { ...draft, title: action.value };
    case 'real':
      return { ...draft, real: action.value };
    case 'realPhoto':
      return draft.real === null ? draft : { ...draft, real: { ...draft.real, photoUrl: action.photoUrl } };
    case 'diploma':
      return { ...draft, diploma: action.value };
    case 'trophy':
      if (action.kind === null) return { ...draft, trophy: null };
      return { ...draft, trophy: { kind: action.kind, material: draft.trophy?.material ?? 'gold' } };
    case 'material':
      return draft.trophy === null ? draft : { ...draft, trophy: { ...draft.trophy, material: action.material } };
    case 'photoPlace':
      return withDecor(draft, { photoPlace: action.place });
    case 'addPhotos': {
      const room = Math.max(0, photoLimit(decor.photoPlace) - decor.photos.length);
      const added = action.urls.slice(0, room).map((url): DecorPhoto => ({ url, crop: { ...CROP_RESET } }));
      return added.length === 0 ? draft : withDecor(draft, { photos: [...decor.photos, ...added] });
    }
    case 'movePhoto': {
      const { from, to } = action;
      const last = decor.photos.length - 1;
      if (from === to || from < 0 || to < 0 || from > last || to > last) return draft;
      const photos = [...decor.photos];
      const [moved] = photos.splice(from, 1);
      photos.splice(to, 0, moved!);
      return withDecor(draft, { photos });
    }
    case 'removePhoto':
      return withDecor(draft, { photos: decor.photos.filter((_, i) => i !== action.index) });
    case 'crop':
      return withDecor(draft, { photos: decor.photos.map((p, i) => (i === action.index ? { ...p, crop: action.crop } : p)) });
    case 'frame':
      return withDecor(draft, { frame: action.frame });
    case 'photoStyle':
      return withDecor(draft, { photoStyle: action.style });
    case 'inscription': {
      const others = decor.inscriptions.filter((i) => i.place !== action.place);
      const inscriptions = action.value === null ? others : [...others, action.value];
      inscriptions.sort((a, b) => INSCRIPTION_PLACES.indexOf(a.place) - INSCRIPTION_PLACES.indexOf(b.place));
      return withDecor(draft, { inscriptions });
    }
    case 'sticker': {
      const others = decor.stickers.filter((s) => s.place !== action.place);
      const stickers = action.id === null ? others : [...others, { id: action.id, place: action.place }];
      stickers.sort((a, b) => STICKER_PLACES.indexOf(a.place) - STICKER_PLACES.indexOf(b.place));
      return withDecor(draft, { stickers });
    }
    case 'effect':
      return withDecor(draft, {
        effect: action.kind === 'glow' ? { kind: 'glow', color: action.color ?? GLOW_DEFAULT } : { kind: action.kind },
      });
    case 'appearance':
      return withDecor(draft, { appearance: action.appearance });
  }
}

export type StudioIssue = 'prize_empty' | 'name' | 'decor_text_length' | 'decor_too_many_photos' | 'decor_plaque_twice' | 'fill';

const DECOR_CODES = ['decor_text_length', 'decor_too_many_photos', 'decor_plaque_twice'] as const;

/** Що не дає зберегти приз, за порядком; [] — можна зберігати. */
export function studioIssues(content: PrizeContent): StudioIssue[] {
  const issues: StudioIssue[] = [];
  const add = (issue: StudioIssue) => {
    if (!issues.includes(issue)) issues.push(issue);
  };
  const emptyName = content.name.trim() === '';
  if (content.trophy === null && content.engraving === null && content.real === null && content.title === null && !content.diploma) {
    add('prize_empty');
  }
  if (emptyName) add('name');
  const parsed = prizeContentSchema.safeParse(content);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const code = DECOR_CODES.find((c) => c === issue.message);
      if (code !== undefined) add(code);
      else if (issue.message === 'prize_empty') continue;
      else if (emptyName && issue.path[0] === 'name') continue;
      else add('fill');
    }
  }
  return issues;
}
