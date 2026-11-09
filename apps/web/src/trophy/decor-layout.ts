import { shownDecor } from '@quiz/shared';
import type { DecorPhoto, TrophyDecor, TrophyKind, TrophyMaterial, TrophyPhotoPlace } from '@quiz/shared';
import type { Circle, Vec3 } from './anchors';

/** Клітинка атласу кільця: як у запеченому грааль. */
export const RING_TILE = { width: 150, height: 204, pad: 8, background: '#20160c' } as const;

/** Пропорції рамки фото на кубку для кожного місця: ними кадрує і малювання, і діалог кадрування редактора. */
export const PHOTO_BOX: Record<TrophyPhotoPlace, { width: number; height: number }> = {
  ring: { width: RING_TILE.width, height: RING_TILE.height },
  medallion: { width: 1, height: 1 },
  gems: { width: 1, height: 1 },
  plaque: { width: 1024, height: 400 },
  backdrop: { width: 1024, height: 1024 },
};

/** На скільки фото в рамці (не `none`) відступає від краю прямокутника: місце під обводку. */
export const PHOTO_FRAME_INSET = 3;

export function ringAtlasSize(count: number): { width: number; height: number } {
  return { width: RING_TILE.width * count, height: RING_TILE.height };
}

/** Клітинка i з відступом pad; клітинка займає u ∈ [i/n, (i+1)/n]. */
export function tileRect(index: number): { x: number; y: number; width: number; height: number } {
  const { width, height, pad } = RING_TILE;
  return { x: index * width + pad, y: pad, width: width - 2 * pad, height: height - 2 * pad };
}

/** Кадр фото (у пікселях джерела) для «заповнити» + scale навколо центру crop; не виходить за край. */
export function coverCrop(
  image: { width: number; height: number },
  box: { width: number; height: number },
  crop: DecorPhoto['crop'],
): { sx: number; sy: number; sw: number; sh: number } {
  const fill = Math.min(image.width / box.width, image.height / box.height);
  const sw = (box.width * fill) / crop.scale;
  const sh = (box.height * fill) / crop.scale;
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);
  return {
    sx: clamp(crop.x * image.width - sw / 2, image.width - sw),
    sy: clamp(crop.y * image.height - sh / 2, image.height - sh),
    sw,
    sh,
  };
}

/** Самоцвіти рівномірно по колу: 'y' — у площині XZ, перший спереду (+Z); 'z' — у площині XY, перший угорі. */
export function gemSpots(circle: Circle, count: number): { position: Vec3; normal: Vec3 }[] {
  const [cx, cy, cz] = circle.center;
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    const s = Math.sin(angle);
    const c = Math.cos(angle);
    return circle.axis === 'y'
      ? { position: [cx + circle.radius * s, cy, cz + circle.radius * c] as Vec3, normal: [s, 0, c] as Vec3 }
      : { position: [cx + circle.radius * s, cy + circle.radius * c, cz] as Vec3, normal: [0, 0, 1] as Vec3 };
  });
}

export function rimUnit(text: string): string {
  return text.toUpperCase() + '    ✦    ';
}

export function rimRepeats(unitWidth: number, canvasWidth: number): number {
  return Math.max(1, Math.floor(canvasWidth / unitWidth));
}

/** До 2 рядків: явні розриви лишаються, довгий рядок ділиться на пробілі там, де довший із двох найкоротший. */
export function plaqueLines(text: string, measure: (line: string) => number, maxWidth: number): string[] {
  const lines = text.split('\n').filter((line) => line.length > 0);
  if (lines.length === 0) return [];
  if (lines.length > 1) return lines.slice(0, 2);
  const only = lines[0]!;
  if (measure(only) <= maxWidth) return [only];
  let best: string[] = [only];
  let bestWidth = Infinity;
  for (let i = 0; i < only.length; i++) {
    if (only[i] !== ' ') continue;
    const a = only.slice(0, i).trim();
    const b = only.slice(i + 1).trim();
    if (a === '' || b === '') continue;
    const width = Math.max(measure(a), measure(b));
    if (width < bestWidth) {
      bestWidth = width;
      best = [a, b];
    }
  }
  return best;
}

/** Міжрядковий інтервал, у частках кегля. */
export const LINE_HEIGHT = 1.1;

/** Найбільший кегль ≤ maxPx, при якому рядки вміщуються в поле. */
export function fitFontPx(
  lines: string[],
  measure: (line: string, px: number) => number,
  box: { width: number; height: number },
  maxPx: number,
): number {
  const fits = (px: number) =>
    lines.length * px * LINE_HEIGHT <= box.height && lines.every((line) => measure(line, px) <= box.width);
  for (let px = Math.floor(maxPx); px > 8; px--) {
    if (fits(px)) return px;
  }
  return 8;
}

const METAL: Record<TrophyMaterial, { band: readonly [string, string, string]; plate: readonly [string, string, string] }> = {
  gold: { band: ['#e6c164', '#caa23f', '#a07d2a'], plate: ['#f0cf72', '#cda53f', '#9c7827'] },
  silver: { band: ['#e4e8ee', '#c2c8d2', '#8f96a3'], plate: ['#eef1f5', '#cdd3dc', '#9aa1ae'] },
  bronze: { band: ['#d19a62', '#b0703a', '#7e4a22'], plate: ['#dba873', '#b97a44', '#85522a'] },
  diamond: { band: ['#eaf8ff', '#cfefff', '#8cc4e0'], plate: ['#f2fbff', '#d6f1ff', '#96cbe6'] },
};

/** Три зупинки градієнта стрічки або платівки в кольорі металу. */
export function metalStops(material: TrophyMaterial, part: 'band' | 'plate'): readonly [string, string, string] {
  return METAL[material][part];
}

/** Відстань камери, щоб сфера radius влізла і по висоті, і по ширині, з запасом 5 %. */
export function fitDistance(radius: number, fovDeg: number, aspect: number): number {
  const vertical = (fovDeg * Math.PI) / 360;
  const horizontal = Math.atan(Math.tan(vertical) * aspect);
  return (radius / Math.sin(Math.min(vertical, horizontal))) * 1.05;
}

/** Що намальовано, для data-decor: фото (місце й кількість), написи, наліпки; '' без decor. */
export function decorSummary(kind: TrophyKind, decor: TrophyDecor | null | undefined): string {
  if (decor == null) return '';
  const shown = shownDecor(kind, decor);
  const parts = [shown.photos.length > 0 ? `photos:${shown.photoPlace}:${shown.photos.length}` : 'photos:none'];
  if (shown.inscriptions.length > 0) parts.push(`inscriptions:${shown.inscriptions.map((i) => i.place).join(',')}`);
  if (shown.stickers.length > 0) parts.push(`stickers:${shown.stickers.map((s) => s.place).join(',')}`);
  return parts.join(';');
}
