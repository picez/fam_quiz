import type { TrophyDecor, TrophyMaterial } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import {
  coverCrop,
  decorSummary,
  fitDistance,
  fitFontPx,
  gemSpots,
  metalStops,
  plaqueLines,
  ringAtlasSize,
  rimRepeats,
  rimUnit,
  tileRect,
} from './decor-layout';

const base: TrophyDecor = {
  photos: [],
  photoPlace: 'ring',
  frame: 'none',
  photoStyle: 'normal',
  inscriptions: [],
  effect: { kind: 'none' },
  appearance: 'spin',
  stickers: [],
};
const photo = { url: '/uploads/aaaaaaaaaaaaaaaa.jpg', crop: { x: 0.5, y: 0.5, scale: 1 } };
const inscription = (place: 'rim' | 'plaque' | 'back') => ({
  place,
  text: 'x',
  font: null,
  look: 'engraved' as const,
  color: '#3a2a0e',
});

describe('ring atlas', () => {
  it('sizes the atlas and tiles', () => {
    expect(ringAtlasSize(13)).toEqual({ width: 1950, height: 204 });
    expect(tileRect(2)).toEqual({ x: 308, y: 8, width: 134, height: 188 });
  });
});

describe('coverCrop', () => {
  const box = { width: 134, height: 188 };
  const image = { width: 800, height: 600 };
  it('centres at scale 1 like the bake', () => {
    const sw = (600 * 134) / 188;
    const c = coverCrop(image, box, { x: 0.5, y: 0.5, scale: 1 });
    expect(c.sw).toBeCloseTo(sw, 6);
    expect(c.sh).toBeCloseTo(600, 6);
    expect(c.sx).toBeCloseTo((800 - sw) / 2, 6);
    expect(c.sy).toBeCloseTo(0, 6);
  });
  it('scale 2 halves the frame around the same centre', () => {
    const one = coverCrop(image, box, { x: 0.5, y: 0.5, scale: 1 });
    const two = coverCrop(image, box, { x: 0.5, y: 0.5, scale: 2 });
    expect(two.sw).toBeCloseTo(one.sw / 2, 6);
    expect(two.sh).toBeCloseTo(one.sh / 2, 6);
    expect(two.sx + two.sw / 2).toBeCloseTo(400, 6);
    expect(two.sy + two.sh / 2).toBeCloseTo(300, 6);
  });
  it('never leaves the image', () => {
    const left = coverCrop(image, box, { x: 0, y: 0, scale: 2 });
    expect(left.sx).toBe(0);
    expect(left.sy).toBe(0);
    const right = coverCrop(image, box, { x: 1, y: 1, scale: 1 });
    expect(right.sx + right.sw).toBeCloseTo(800, 6);
    expect(right.sy + right.sh).toBeCloseTo(600, 6);
  });
});

describe('gemSpots', () => {
  it('spreads evenly starting at the front', () => {
    const spots = gemSpots({ center: [0, 0.23, 0], axis: 'y', radius: 0.11, size: 0.05 }, 4);
    expect(spots).toHaveLength(4);
    expect(spots[0]!.position[0]).toBeCloseTo(0, 9);
    expect(spots[0]!.position[1]).toBeCloseTo(0.23, 9);
    expect(spots[0]!.position[2]).toBeCloseTo(0.11, 9);
    expect(spots[0]!.normal.map((v) => Math.round(v))).toEqual([0, 0, 1]);
    const angles = spots.map((s) => Math.atan2(s.position[0], s.position[2]));
    expect(Math.abs(angles[1]! - angles[0]!)).toBeCloseTo(Math.PI / 2, 9);
  });
  it('starts at the top for a z circle', () => {
    const spots = gemSpots({ center: [0, 0.4, 0.05], axis: 'z', radius: 0.3, size: 0.04 }, 3);
    expect(spots[0]!.position[0]).toBeCloseTo(0, 9);
    expect(spots[0]!.position[1]).toBeCloseTo(0.7, 9);
    expect(spots[0]!.position[2]).toBeCloseTo(0.05, 9);
    expect(spots[0]!.normal).toEqual([0, 0, 1]);
  });
});

describe('rim text', () => {
  it('builds the unit and the repeats', () => {
    expect(rimUnit('ab')).toBe('AB    ✦    ');
    expect(rimRepeats(2500, 2048)).toBe(1);
    expect(rimRepeats(500, 2048)).toBe(4);
  });
});

describe('plaqueLines', () => {
  const measure = (s: string) => s.length * 10;
  it('keeps explicit lines', () => {
    expect(plaqueLines('Хочеш я тобі Ді…\nҐрааль покажу?', measure, 200)).toEqual([
      'Хочеш я тобі Ді…',
      'Ґрааль покажу?',
    ]);
  });
  it('breaks a long line where the longer half is shortest', () => {
    expect(plaqueLines('Хочеш я тобі Ді… Ґрааль покажу?', measure, 200)).toEqual([
      'Хочеш я тобі Ді…',
      'Ґрааль покажу?',
    ]);
  });
  it('keeps a short text on one line', () => {
    expect(plaqueLines('Привіт', measure, 200)).toEqual(['Привіт']);
  });
});

describe('fitFontPx', () => {
  const measure = (s: string, px: number) => s.length * px * 0.5;
  const box = { width: 972, height: 348 };
  it('keeps the max when it fits and shrinks otherwise', () => {
    expect(fitFontPx(['a'.repeat(16), 'b'.repeat(16)], measure, box, 108)).toBe(108);
    expect(fitFontPx(['a'.repeat(32), 'b'.repeat(32)], measure, box, 108)).toBeLessThan(108);
  });
});

describe('metalStops', () => {
  it('gold is the baked gradient', () => {
    expect(metalStops('gold', 'band')).toEqual(['#e6c164', '#caa23f', '#a07d2a']);
    expect(metalStops('gold', 'plate')).toEqual(['#f0cf72', '#cda53f', '#9c7827']);
  });
  const luma = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  };
  it.each(['silver', 'bronze', 'diamond'] as TrophyMaterial[])('%s darkens stop by stop', (material) => {
    for (const part of ['band', 'plate'] as const) {
      const stops = metalStops(material, part);
      stops.forEach((s) => expect(s).toMatch(/^#[0-9a-f]{6}$/));
      expect(luma(stops[0])).toBeGreaterThan(luma(stops[1]));
      expect(luma(stops[1])).toBeGreaterThan(luma(stops[2]));
    }
  });
});

describe('fitDistance', () => {
  it('fits the sphere with a margin', () => {
    expect(Math.abs(fitDistance(1, 30, 1) - (1 / Math.sin((15 * Math.PI) / 180)) * 1.05)).toBeLessThan(1e-6);
    expect(fitDistance(1, 30, 0.5)).toBeGreaterThan(fitDistance(1, 30, 1));
  });
});

describe('decorSummary', () => {
  const full: TrophyDecor = {
    ...base,
    photos: [photo, photo, photo],
    inscriptions: [inscription('rim'), inscription('plaque')],
    stickers: [
      { id: 'a', place: 'front' },
      { id: 'b', place: 'back' },
    ],
  };
  it('describes what is drawn', () => {
    expect(decorSummary('cup', full)).toBe('photos:ring:3;inscriptions:rim,plaque;stickers:front,back');
  });
  it('drops places the kind lacks', () => {
    expect(decorSummary('star', full)).toBe('photos:none;inscriptions:plaque;stickers:front,back');
  });
  it('omits empty parts', () => {
    const medal: TrophyDecor = { ...base, photos: [photo], photoPlace: 'medallion', inscriptions: [inscription('back')] };
    expect(decorSummary('medal', medal)).toBe('photos:medallion:1;inscriptions:back');
  });
  it('is empty without decor', () => {
    expect(decorSummary('cup', null)).toBe('');
    expect(decorSummary('cup', undefined)).toBe('');
  });
});
