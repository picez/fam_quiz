/**
 * Ясин «Сімейний Ґрааль» на trophy.decor (25a): фото по колу, рим і табличка — написи тим самим шрифтом, що й запечена модель.
 */
import { DECOR_LIMITS, prizeContentSchema, trophyDecorSchema, type PrizeContent, type TrophyDecor } from '@quiz/shared';

export const GRAIL_RIM = "Сімейний Ґрааль сім'ї комендантів · для найрозумнішого Індіани Джонса";
export const GRAIL_PLAQUE = 'Хочеш я тобі Ді…\nҐрааль покажу?';

const INK = '#3a2a0e';

/** Оформлення сімейного граалю: 1..16 адрес фото по колу в тому ж порядку. */
export function grailDecor(urls: string[]): TrophyDecor {
  if (urls.length < 1 || urls.length > DECOR_LIMITS.ring) throw new Error(`The grail ring takes 1..${DECOR_LIMITS.ring} photos, got ${urls.length}`);
  return trophyDecorSchema.parse({
    photos: urls.map((url) => ({ url, crop: { x: 0.5, y: 0.5, scale: 1 } })),
    photoPlace: 'ring',
    frame: 'none',
    photoStyle: 'normal',
    inscriptions: [
      { place: 'rim', text: GRAIL_RIM, font: null, look: 'engraved', color: INK },
      { place: 'plaque', text: GRAIL_PLAQUE, font: null, look: 'engraved', color: INK },
    ],
    effect: { kind: 'none' },
    appearance: 'spin',
    stickers: [],
  });
}

/** Зміст призу з оформленням: name/real/title/diploma з previous, engraving прибрано (тепер це написи). */
export function grailContent(previous: PrizeContent, urls: string[]): PrizeContent {
  return prizeContentSchema.parse({
    name: previous.name,
    trophy: { kind: 'grail', material: previous.trophy?.material ?? 'gold', decor: grailDecor(urls) },
    engraving: null,
    real: previous.real,
    title: previous.title,
    diploma: previous.diploma,
  });
}
