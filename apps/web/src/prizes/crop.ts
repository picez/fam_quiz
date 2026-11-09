import type { DecorPhoto, TrophyPhotoFrame, TrophyPhotoPlace } from '@quiz/shared';
import { PHOTO_BOX, PHOTO_FRAME_INSET, coverCrop, tileRect } from '../trophy/decor-layout';

export { PHOTO_BOX };

type Crop = DecorPhoto['crop'];

export const CROP_RESET: Crop = { x: 0.5, y: 0.5, scale: 1 };
export const CROP_SCALE = { min: 1, max: 4 } as const;

/** Центр кадру в діапазоні, де кадр завширшки frame (у пікселях фото) не виходить за фото; ширший за фото — 0.5. */
function clampCenter(center: number, frame: number, size: number): number {
  const half = frame / 2 / size;
  if (half >= 0.5) return 0.5;
  return Math.min(Math.max(center, half), 1 - half);
}

/** Тяг пальцем: кадр їде проти пальця; dxPx/dyPx — у пікселях полотна завширшки viewWidth. */
export function panCrop(
  crop: Crop,
  image: { width: number; height: number },
  box: { width: number; height: number },
  dxPx: number,
  dyPx: number,
  viewWidth: number,
): Crop {
  if (!(viewWidth > 0)) return crop;
  const { sw, sh } = coverCrop(image, box, crop);
  const perPixel = sw / viewWidth;
  return {
    x: clampCenter(crop.x - (dxPx * perPixel) / image.width, sw, image.width),
    y: clampCenter(crop.y - (dyPx * perPixel) / image.height, sh, image.height),
    scale: crop.scale,
  };
}

export function zoomCrop(crop: Crop, scale: number): Crop {
  return { ...crop, scale: Math.min(Math.max(scale, CROP_SCALE.min), CROP_SCALE.max) };
}

/**
 * Прямокутник, у який кубок справді кладе фото (decor-canvas): клітинка кільця без відступу pad, у рамці — ще без
 * PHOTO_FRAME_INSET з кожного боку; медальйон і самоцвіт — коло, тож квадрат за будь-якої рамки. Діалог кадрування
 * кадрує саме в ці пропорції, тож попередній перегляд збігається з кубком.
 */
export function cropFrameBox(place: TrophyPhotoPlace, frame: TrophyPhotoFrame): { width: number; height: number } {
  if (place === 'medallion' || place === 'gems') return PHOTO_BOX[place];
  const inset = frame === 'none' ? 0 : PHOTO_FRAME_INSET;
  const base = place === 'ring' ? tileRect(0) : PHOTO_BOX[place];
  return { width: base.width - 2 * inset, height: base.height - 2 * inset };
}

/** Обрис фото на кубку: коло (медальйон, самоцвіт, кругла рамка), заокруглений чи звичайний прямокутник. */
export function cropShape(place: TrophyPhotoPlace, frame: TrophyPhotoFrame): 'circle' | 'rounded' | 'rect' {
  if (place === 'medallion' || place === 'gems' || frame === 'round') return 'circle';
  return frame === 'rounded' ? 'rounded' : 'rect';
}
