/** Найбільше наближення рамки точки. */
export const PIN_MAX_ZOOM = 5;

/** Наближення рамки: scale 1…PIN_MAX_ZOOM, зсув у пікселях рамки (transform: translate(x, y) scale(scale), origin 0 0). */
export interface ZoomView {
  scale: number;
  x: number;
  y: number;
}

export const NO_ZOOM: ZoomView = { scale: 1, x: 0, y: 0 };

export interface Box {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
// Без «-0»: toEqual відрізняє його від 0, а користі в ньому немає.
const plain = (value: number) => (value === 0 ? 0 : value);

/** Картинка не виходить за рамку: зсув притискається до [box × (1 − scale), 0]. */
export function clampView(view: ZoomView, box: Box): ZoomView {
  const scale = clamp(Number.isFinite(view.scale) ? view.scale : 1, 1, PIN_MAX_ZOOM);
  return {
    scale,
    x: plain(clamp(view.x, box.width * (1 - scale), 0)),
    y: plain(clamp(view.y, box.height * (1 - scale), 0)),
  };
}

/** Новий масштаб, за якого точка картинки під (cx, cy) лишається під (cx, cy). */
function anchored(view: ZoomView, scale: number, from: Point, to: Point, box: Box): ZoomView {
  const next = clamp(scale, 1, PIN_MAX_ZOOM);
  const localX = (from.x - view.x) / view.scale;
  const localY = (from.y - view.y) / view.scale;
  return clampView({ scale: next, x: to.x - localX * next, y: to.y - localY * next }, box);
}

/** Наближення в factor разів навколо точки рамки (cx, cy). */
export function zoomAround(view: ZoomView, factor: number, cx: number, cy: number, box: Box): ZoomView {
  return anchored(view, view.scale * factor, { x: cx, y: cy }, { x: cx, y: cy }, box);
}

/** Дві руки: від початкового view і початкових точок a0, b0 до поточних a1, b1 (масштаб — за відстанню, зсув — за серединою). */
export function pinchView(start: ZoomView, a0: Point, b0: Point, a1: Point, b1: Point, box: Box): ZoomView {
  const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y);
  const d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
  const ratio = d0 > 0 ? d1 / d0 : 1;
  const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
  const m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
  return anchored(start, start.scale * ratio, m0, m1, box);
}

/** Точка рамки (px, py) → частки основи 0…1; mirrored — рамка під «Дзеркалом» (x перевертається). */
export function toImagePoint(view: ZoomView, px: number, py: number, box: Box, mirrored: boolean): { x: number; y: number } {
  const localX = mirrored ? box.width - px : px;
  const x = box.width > 0 ? (localX - view.x) / view.scale / box.width : 0;
  const y = box.height > 0 ? (py - view.y) / view.scale / box.height : 0;
  return { x: plain(clamp(x, 0, 1)), y: plain(clamp(y, 0, 1)) };
}
