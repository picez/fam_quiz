import { describe, expect, it } from 'vitest';
import { PHOTO_FRAME_INSET, RING_TILE, tileRect } from '../trophy/decor-layout';
import { CROP_RESET, PHOTO_BOX, cropFrameBox, cropShape, panCrop, zoomCrop } from './crop';

const square = { width: 1000, height: 1000 };
const unit = { width: 1, height: 1 };

describe('crop', () => {
  it('pan moves the frame opposite the finger', () => {
    const next = panCrop({ x: 0.5, y: 0.5, scale: 2 }, square, unit, 100, 0, 200);
    expect(next.x).toBeCloseTo(0.25, 10);
    expect(next.y).toBe(0.5);
    expect(next.scale).toBe(2);
    expect(panCrop({ x: 0.5, y: 0.5, scale: 2 }, square, unit, -40, 0, 200).x).toBeCloseTo(0.6, 10);
    expect(panCrop({ x: 0.5, y: 0.5, scale: 2 }, square, unit, 0, 40, 200).y).toBeCloseTo(0.4, 10);
  });

  it('pan stays inside the photo', () => {
    expect(panCrop({ x: 0.5, y: 0.5, scale: 2 }, square, unit, 5000, 5000, 200)).toEqual({ x: 0.25, y: 0.25, scale: 2 });
    expect(panCrop({ x: 0.5, y: 0.5, scale: 2 }, square, unit, -5000, -5000, 200)).toEqual({ x: 0.75, y: 0.75, scale: 2 });
    expect(panCrop(CROP_RESET, square, unit, 300, 300, 200)).toEqual({ x: 0.5, y: 0.5, scale: 1 });
  });

  it('a frame wider than the photo stays centred', () => {
    // широка рамка на високому фото: по x кадр займає всю ширину, по y є куди їхати
    const next = panCrop(CROP_RESET, { width: 400, height: 1000 }, { width: 1024, height: 400 }, 50, 50, 200);
    expect(next.x).toBe(0.5);
    expect(next.y).toBeCloseTo(0.4, 10);
  });

  it('zoom clamps', () => {
    expect(zoomCrop(CROP_RESET, 5).scale).toBe(4);
    expect(zoomCrop(CROP_RESET, 0.5).scale).toBe(1);
    expect(zoomCrop({ x: 0.3, y: 0.7, scale: 1 }, 2.5)).toEqual({ x: 0.3, y: 0.7, scale: 2.5 });
  });

  it('boxes are the trophy ones', () => {
    expect(PHOTO_BOX.ring).toEqual({ width: RING_TILE.width, height: RING_TILE.height });
    expect(PHOTO_BOX.plaque).toEqual({ width: 1024, height: 400 });
    expect(PHOTO_BOX.backdrop).toEqual({ width: 1024, height: 1024 });
    expect(PHOTO_BOX.medallion).toEqual({ width: 1, height: 1 });
    expect(PHOTO_BOX.gems).toEqual({ width: 1, height: 1 });
  });

  it('pan with no view width keeps the crop', () => {
    const crop = { x: 0.4, y: 0.6, scale: 2 };
    expect(panCrop(crop, square, unit, 10, 10, 0)).toBe(crop);
    expect(panCrop(crop, square, unit, 10, 10, -5)).toBe(crop);
  });

  it('the crop box is where the trophy draws the photo', () => {
    const tile = tileRect(0);
    expect(cropFrameBox('ring', 'none')).toEqual({ width: tile.width, height: tile.height });
    expect(cropFrameBox('ring', 'gold')).toEqual({ width: tile.width - 2 * PHOTO_FRAME_INSET, height: tile.height - 2 * PHOTO_FRAME_INSET });
    expect(cropFrameBox('plaque', 'none')).toEqual(PHOTO_BOX.plaque);
    expect(cropFrameBox('backdrop', 'rounded')).toEqual({ width: 1024 - 2 * PHOTO_FRAME_INSET, height: 1024 - 2 * PHOTO_FRAME_INSET });
    expect(cropFrameBox('medallion', 'gold')).toEqual({ width: 1, height: 1 });
    expect(cropShape('gems', 'none')).toBe('circle');
    expect(cropShape('ring', 'round')).toBe('circle');
    expect(cropShape('plaque', 'rounded')).toBe('rounded');
    expect(cropShape('backdrop', 'gold')).toBe('rect');
  });
});
