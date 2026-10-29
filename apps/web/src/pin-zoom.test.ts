import { describe, expect, it } from 'vitest';
import { NO_ZOOM, PIN_MAX_ZOOM, clampView, pinchView, toImagePoint, zoomAround } from './pin-zoom';

const box = { width: 300, height: 150 };

describe('pin zoom', () => {
  it('keeps the picture inside the frame', () => {
    expect(clampView({ scale: 2, x: 50, y: -999 }, box)).toEqual({ scale: 2, x: 0, y: -150 });
    expect(clampView({ scale: 9, x: 0, y: 0 }, box).scale).toBe(PIN_MAX_ZOOM);
    expect(clampView({ scale: 0.5, x: -40, y: 10 }, box)).toEqual(NO_ZOOM);
  });

  it('zooms around a point that stays in place', () => {
    const before = toImagePoint(NO_ZOOM, 150, 75, box, false);
    const zoomed = zoomAround(NO_ZOOM, 2, 150, 75, box);
    expect(zoomed.scale).toBe(2);
    expect(before).toEqual({ x: 0.5, y: 0.5 });
    expect(toImagePoint(zoomed, 150, 75, box, false)).toEqual({ x: 0.5, y: 0.5 });
    // Біля краю зсув притискається: картинка не відривається від рамки.
    const corner = zoomAround(NO_ZOOM, 2, 0, 0, box);
    expect(toImagePoint(corner, 0, 0, box, false)).toEqual({ x: 0, y: 0 });
  });

  it('pinch: fingers twice as far apart zoom ×2, never above the limit', () => {
    const view = pinchView(NO_ZOOM, { x: 130, y: 75 }, { x: 170, y: 75 }, { x: 110, y: 75 }, { x: 190, y: 75 }, box);
    expect(view.scale).toBeCloseTo(2);
    expect(toImagePoint(view, 150, 75, box, false).x).toBeCloseTo(0.5);
    const far = pinchView(NO_ZOOM, { x: 145, y: 75 }, { x: 155, y: 75 }, { x: 0, y: 75 }, { x: 300, y: 75 }, box);
    expect(far.scale).toBe(PIN_MAX_ZOOM);
  });

  it('maps a frame point to shares of the picture, mirrored and clamped', () => {
    expect(toImagePoint(NO_ZOOM, 75, 75, box, false)).toEqual({ x: 0.25, y: 0.5 });
    expect(toImagePoint(NO_ZOOM, 75, 75, box, true)).toEqual({ x: 0.75, y: 0.5 });
    // «Догори дриґом» (12h): рамка повернута на 180°, тож перевертаються обидві осі.
    expect(toImagePoint(NO_ZOOM, 75, 30, box, { x: true, y: true })).toEqual({ x: 0.75, y: 0.8 });
    expect(toImagePoint(NO_ZOOM, 75, 30, box, { x: false, y: false })).toEqual({ x: 0.25, y: 0.2 });
    expect(toImagePoint(NO_ZOOM, -20, 400, box, false)).toEqual({ x: 0, y: 1 });
    expect(toImagePoint({ scale: 2, x: -150, y: -75 }, 150, 75, box, false)).toEqual({ x: 0.5, y: 0.5 });
  });
});
