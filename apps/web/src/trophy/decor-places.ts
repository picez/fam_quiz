import { DECOR_SUPPORT, INSCRIPTION_PLACES, STICKER_PLACES, shownDecor } from '@quiz/shared';
import type { Inscription, InscriptionPlace, StickerPlace, TrophyDecor, TrophyKind, TrophyPhotoPlace } from '@quiz/shared';
import { TROPHY_ANCHORS } from './anchors';
import type { BandAnchor, KindAnchors, Plate, Spot, Vec3 } from './anchors';
import { gemSpots } from './decor-layout';

/** Хто займає ділянку: фото (місце), напис (його місце в даних), наліпка (де вона фактично лежить). */
export type Occupant =
  | { type: 'photos'; place: TrophyPhotoPlace }
  | { type: 'inscription'; place: InscriptionPlace }
  | { type: 'sticker'; place: StickerPlace; id: string };

/**
 * Ділянка на поверхні: u — кут (поверхня обертання, радіани) чи координата вздовж грані (пласка), 'all' — усе коло;
 * v — висота y. Обидва інтервали вже розширені на MARGIN / 2 з кожного боку, тож дві ділянки накладаються,
 * коли між ними менше MARGIN (для кута — MARGIN / r).
 */
export interface Footprint {
  surface: string;
  u: readonly [number, number] | 'all';
  v: readonly [number, number];
}

export interface PlacedInscription {
  inscription: Inscription;
  /** own — на своєму місці, base-back — на задній грані постаменту, null — не вміщується. */
  at: 'own' | 'base-back' | null;
  blockedBy: Occupant | null;
}
export interface PlacedSticker {
  id: string;
  place: StickerPlace;
  at: StickerPlace | null;
  /** Хто зайняв place; null, якщо наліпка на своєму місці. */
  blockedBy: Occupant | null;
}
export interface DecorLayout {
  photos: TrophyPhotoPlace | null;
  inscriptions: PlacedInscription[];
  stickers: PlacedSticker[];
}

/** Найменший проміжок між частинами оформлення, в одиницях моделі. */
const MARGIN = 0.008;
const HALF = MARGIN / 2;
const TAU = Math.PI * 2;

const span = (center: number, half: number, pad: number): readonly [number, number] => [center - half - pad, center + half + pad];
const crosses = (a: readonly [number, number], b: readonly [number, number]) => a[0] < b[1] && b[0] < a[1];

export function overlaps(a: Footprint, b: Footprint): boolean {
  if (a.surface !== b.surface || !crosses(a.v, b.v)) return false;
  if (a.u === 'all' || b.u === 'all') return true;
  const bu = b.u;
  // Кут загортається: пробуємо зсуви на повне коло (пласкі грані вужчі за 2π, їм це не шкодить).
  return [0, TAU, -TAU].some((shift) => crosses(a.u as readonly [number, number], [bu[0] + shift, bu[1] + shift]));
}

/** Ділянка прямокутника шириною width з центром position на поверхні surface; normal — куди він дивиться. */
function rectFootprint(kind: TrophyKind, surface: string, position: Vec3, normal: Vec3, width: number, height: number): Footprint {
  const [x, y, z] = position;
  const v = span(y, height / 2, HALF);
  if (TROPHY_ANCHORS[kind].surfaces[surface] === 'revolved') {
    const r = Math.hypot(x, z);
    return { surface, u: span(Math.atan2(x, z), width / 2 / r, HALF / r), v };
  }
  // Пласка грань: уздовж неї — x для граней ±Z, z для граней ±X.
  const along = Math.abs(normal[0]) > Math.abs(normal[2]) ? z : x;
  return { surface, u: span(along, width / 2, HALF), v };
}

export function spotFootprint(kind: TrophyKind, spot: Spot): Footprint {
  return rectFootprint(kind, spot.surface, spot.position, spot.normal, spot.size, spot.size);
}

/** Таблички й поясок на грані дивляться до +Z (нахил лише навколо X). */
const plateFootprint = (kind: TrophyKind, plate: Plate): Footprint =>
  rectFootprint(kind, plate.surface, plate.position, [0, 0, 1], plate.width, plate.height);

function bandFootprint(kind: TrophyKind, band: BandAnchor): Footprint {
  switch (band.shape) {
    case 'profile':
      return { surface: band.surface, u: 'all', v: span((band.y0 + band.y1) / 2, (band.y1 - band.y0) / 2, HALF) };
    case 'raised':
      return { surface: band.surface, u: 'all', v: span(band.y, band.height / 2, HALF) };
    case 'face':
      return plateFootprint(kind, band.plate);
  }
}

function photoFootprints(kind: TrophyKind, anchors: KindAnchors, place: TrophyPhotoPlace, count: number): Footprint[] {
  switch (place) {
    case 'ring':
      return anchors.ring ? [bandFootprint(kind, anchors.ring)] : [];
    case 'medallion':
      return anchors.medallion ? [spotFootprint(kind, anchors.medallion)] : [];
    case 'gems': {
      const circle = anchors.gems;
      if (!circle) return [];
      return gemSpots(circle, count).map((gem) => spotFootprint(kind, gem));
    }
    case 'plaque':
      return anchors.plaque ? [plateFootprint(kind, anchors.plaque)] : [];
    case 'backdrop':
      return [];
  }
}

function inscriptionFootprint(kind: TrophyKind, anchors: KindAnchors, place: InscriptionPlace): Footprint | null {
  switch (place) {
    case 'rim':
      return anchors.rim ? bandFootprint(kind, anchors.rim) : null;
    case 'band':
      return anchors.band ? bandFootprint(kind, anchors.band) : null;
    case 'plaque':
      return anchors.plaque ? plateFootprint(kind, anchors.plaque) : null;
    case 'back':
      return anchors.back ? spotFootprint(kind, anchors.back) : null;
  }
}

interface Taken {
  who: Occupant;
  areas: Footprint[];
}

/** Перший, хто накладається на ділянки (у порядку зайняття: фото → написи → наліпки); null — вільно. */
const blocker = (taken: readonly Taken[], areas: readonly Footprint[]): Occupant | null =>
  taken.find((t) => t.areas.some((a) => areas.some((b) => overlaps(a, b))))?.who ?? null;

const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Розкладка й зайняті ділянки: спільна основа для layoutDecor і stickerPlaceChoices. */
function place(kind: TrophyKind, decor: TrophyDecor): { layout: DecorLayout; taken: Taken[] } {
  const shown = shownDecor(kind, decor);
  const anchors = TROPHY_ANCHORS[kind];
  const taken: Taken[] = [];

  const photos = shown.photos.length > 0 ? shown.photoPlace : null;
  if (photos) taken.push({ who: { type: 'photos', place: photos }, areas: photoFootprints(kind, anchors, photos, shown.photos.length) });

  // Написи — у порядку INSCRIPTION_PLACES; у результаті — в порядку даних.
  const placed = new Map<Inscription, PlacedInscription>();
  const ordered = [...shown.inscriptions].sort((a, b) => INSCRIPTION_PLACES.indexOf(a.place) - INSCRIPTION_PLACES.indexOf(b.place));
  for (const inscription of ordered) {
    const who: Occupant = { type: 'inscription', place: inscription.place };
    const own = inscriptionFootprint(kind, anchors, inscription.place);
    if (!own) {
      placed.set(inscription, { inscription, at: null, blockedBy: null });
      continue;
    }
    const blockedBy = blocker(taken, [own]);
    if (!blockedBy) {
      taken.push({ who, areas: [own] });
      placed.set(inscription, { inscription, at: 'own', blockedBy: null });
      continue;
    }
    const spare = inscription.place === 'back' && anchors.baseBack ? spotFootprint(kind, anchors.baseBack) : null;
    if (spare && !blocker(taken, [spare])) {
      taken.push({ who, areas: [spare] });
      placed.set(inscription, { inscription, at: 'base-back', blockedBy });
    } else {
      placed.set(inscription, { inscription, at: null, blockedBy });
    }
  }

  // Наліпки: спершу всі на вільних власних місцях, потім витіснені — на найближче вільне.
  const spotOf = (p: StickerPlace) => anchors.stickers[p];
  const used = new Set<StickerPlace>();
  const stickers: PlacedSticker[] = shown.stickers.map((s) => ({ id: s.id, place: s.place, at: null, blockedBy: null }));
  const take = (sticker: PlacedSticker, at: StickerPlace) => {
    sticker.at = at;
    used.add(at);
    taken.push({ who: { type: 'sticker', place: at, id: sticker.id }, areas: [spotFootprint(kind, spotOf(at)!)] });
  };
  for (const sticker of stickers) {
    const spot = spotOf(sticker.place);
    if (!spot || used.has(sticker.place)) continue;
    sticker.blockedBy = blocker(taken, [spotFootprint(kind, spot)]);
    if (!sticker.blockedBy) take(sticker, sticker.place);
  }
  for (const sticker of stickers) {
    if (sticker.at !== null) continue;
    const from = spotOf(sticker.place);
    if (!from) continue;
    // Без того, хто накладається, власне місце вже взяла наліпка з тим самим місцем раніше в масиві.
    sticker.blockedBy ??= taken.find((t) => t.who.type === 'sticker' && t.who.place === sticker.place)?.who ?? null;
    let best: StickerPlace | null = null;
    let bestDistance = Infinity;
    for (const candidate of STICKER_PLACES) {
      const spot = spotOf(candidate);
      if (!spot || used.has(candidate) || !DECOR_SUPPORT[kind].sticker.includes(candidate)) continue;
      if (blocker(taken, [spotFootprint(kind, spot)])) continue;
      const d = distance(from.position, spot.position);
      if (d < bestDistance) {
        best = candidate;
        bestDistance = d;
      }
    }
    if (best) take(sticker, best);
  }

  return { layout: { photos, inscriptions: shown.inscriptions.map((i) => placed.get(i)!), stickers }, taken };
}

/** Де фактично лежить кожна частина оформлення: рахується щоразу з (kind, shownDecor), дані не змінюються. */
export function layoutDecor(kind: TrophyKind, decor: TrophyDecor): DecorLayout {
  return place(kind, decor).layout;
}

/**
 * Місця для нової (editing = null) чи змінюваної наліпки: хто займає кожне місце форми.
 * Змінювана наліпка (з власним місцем editing) не займає нічого — ні свого місця, ні того, куди переїхала.
 */
export function stickerPlaceChoices(
  kind: TrophyKind,
  decor: TrophyDecor,
  editing: StickerPlace | null,
): { place: StickerPlace; takenBy: Occupant | null }[] {
  const others = { ...decor, stickers: decor.stickers.filter((s) => s.place !== editing) };
  const { layout, taken } = place(kind, others);
  const anchors = TROPHY_ANCHORS[kind];
  return DECOR_SUPPORT[kind].sticker.map((p) => {
    const spot = anchors.stickers[p];
    const byArea = spot ? blocker(taken, [spotFootprint(kind, spot)]) : null;
    const stored = layout.stickers.find((s) => s.place === p);
    const takenBy = byArea ?? (stored ? { type: 'sticker' as const, place: p, id: stored.id } : null);
    return { place: p, takenBy };
  });
}
