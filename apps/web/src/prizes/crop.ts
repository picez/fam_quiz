import type { DecorPhoto } from '@quiz/shared';
import { PHOTO_BOX, coverCrop } from '../trophy/decor-layout';

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
