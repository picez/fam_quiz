import { STICKER_LIST } from './sticker-list';

export type StickerSeries = 'nya' | 'nyaa' | 'nyas' | 'other';
export const STICKER_SERIES: readonly StickerSeries[] = ['nya', 'nyaa', 'nyas', 'other'];

export interface Sticker {
  id: string;
  ext: 'gif' | 'png';
  series: StickerSeries;
}

export const STICKER_ID = /^[A-Za-z][A-Za-z0-9]{0,39}$/;

export const STICKERS: readonly Sticker[] = STICKER_LIST;

const BY_ID = new Map<string, Sticker>(STICKERS.map((s) => [s.id, s]));

export function stickerOf(id: string): Sticker | undefined {
  return BY_ID.get(id);
}

export function stickerPath(sticker: Sticker): string {
  return `/stickers/${sticker.id}.${sticker.ext}`;
}

export function seriesOf(id: string): StickerSeries {
  const match = /^(nyaa|nyas|nya)(?=[A-Z0-9])/.exec(id);
  return match ? (match[1] as StickerSeries) : 'other';
}

export function compareStickers(a: Sticker, b: Sticker): number {
  const bySeries = STICKER_SERIES.indexOf(a.series) - STICKER_SERIES.indexOf(b.series);
  if (bySeries !== 0) return bySeries;
  return a.id.localeCompare(b.id, 'en', { sensitivity: 'base', numeric: true });
}
