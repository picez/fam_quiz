import { clamp, shownDecor } from '@quiz/shared';
import type { DecorPhoto, TrophyDecor, TrophyKind, TrophyMaterial, TrophyPhotoPlace } from '@quiz/shared';
import type { Circle, Spot, Vec3 } from './anchors';
import { layoutDecor } from './decor-places';

/** Клітинка атласу кільця: як у запеченому грааль. */
export const RING_TILE = { width: 150, height: 204, pad: 8, background: '#20160c' } as const;

/** Розміри текстури пояска: ring — по колу (смуга з профілю), face — пластина на передній грані основи кубка. */
export const BAND_PX = { ring: { width: 1024, height: 64 }, face: { width: 1024, height: 128 } } as const;

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
  return {
    sx: clamp(crop.x * image.width - sw / 2, 0, image.width - sw),
    sy: clamp(crop.y * image.height - sh / 2, 0, image.height - sh),
    sw,
    sh,
  };
}

/** Кутова відстань між a і b по колу, [0, π]. */
const angleGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return Math.min(d, Math.PI * 2 - d);
};

/**
 * Поворот кола самоцвітів: 0 — перший спереду; якщо так якийсь самоцвіт заходить у сектор avoid (з власною
 * півшириною size / 2 / radius), коло повертається на пів кроку (для 4 і 8 на кубку — між ручками).
 */
function gemPhase(circle: Circle, count: number): number {
  const avoid = circle.axis === 'y' ? circle.avoid : undefined;
  if (avoid === undefined || count === 0) return 0;
  const reach = avoid.halfWidth + circle.size / 2 / circle.radius;
  const clear = (phase: number) =>
    Array.from({ length: count }, (_, i) => phase + (i / count) * Math.PI * 2).every((angle) =>
      avoid.angles.every((sector) => angleGap(angle, sector) >= reach),
    );
  return clear(0) ? 0 : Math.PI / count;
}

/**
 * Самоцвіти рівномірно по колу: 'y' — у площині XZ, перший спереду (+Z), або на пів кроку далі, якщо спереду
 * якийсь із них лягав би в сектор avoid; 'z' — у площині XY, перший угорі. Кожен — пляма з розміром і поверхнею кола.
 */
export function gemSpots(circle: Circle, count: number): Spot[] {
  const [cx, cy, cz] = circle.center;
  const { size, surface } = circle;
  const phase = gemPhase(circle, count);
  return Array.from({ length: count }, (_, i) => {
    const angle = phase + (i / count) * Math.PI * 2;
    const s = Math.sin(angle);
    const c = Math.cos(angle);
    return circle.axis === 'y'
      ? { position: [cx + circle.radius * s, cy, cz + circle.radius * c] as Vec3, normal: [s, 0, c] as Vec3, size, surface }
      : { position: [cx + circle.radius * s, cy + circle.radius * c, cz] as Vec3, normal: [0, 0, 1] as Vec3, size, surface };
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
  // 25e: [темніше на 35 %, колір матеріалу, світліше на 35 %], однакові для стрічки й платівки.
  rosegold: { band: ['#926b5b', '#e0a48c', '#ebc4b4'], plate: ['#926b5b', '#e0a48c', '#ebc4b4'] },
  platinum: { band: ['#959493', '#e5e4e2', '#eeedec'], plate: ['#959493', '#e5e4e2', '#eeedec'] },
  copper: { band: ['#7f4527', '#c46a3c', '#d99e80'], plate: ['#7f4527', '#c46a3c', '#d99e80'] },
  obsidian: { band: ['#141117', '#1e1a24', '#6d6a71'], plate: ['#141117', '#1e1a24', '#6d6a71'] },
  jade: { band: ['#286748', '#3e9e6e', '#82c0a1'], plate: ['#286748', '#3e9e6e', '#82c0a1'] },
  pearl: { band: ['#9d9992', '#f2ebe0', '#f7f2eb'], plate: ['#9d9992', '#f2ebe0', '#f7f2eb'] },
  ruby: { band: ['#720c1e', '#b0122e', '#cc6577'], plate: ['#720c1e', '#b0122e', '#cc6577'] },
  sapphire: { band: ['#143378', '#1f4fb8', '#6d8dd1'], plate: ['#143378', '#1f4fb8', '#6d8dd1'] },
  neon: { band: ['#a61e40', '#ff2e63', '#ff779a'], plate: ['#a61e40', '#ff2e63', '#ff779a'] },
  marble: { band: ['#9a9894', '#edeae4', '#f3f1ed'], plate: ['#9a9894', '#edeae4', '#f3f1ed'] },
  wood: { band: ['#5a3b21', '#8a5a33', '#b3947a'], plate: ['#5a3b21', '#8a5a33', '#b3947a'] },
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

/** Місце в data-decor: як є без переїзду, `front>left` з переїздом, `front>none`, якщо не вміщується. */
const moved = (own: string, at: string | null) => (at === own ? own : `${own}>${at ?? 'none'}`);

/** Що намальовано, для data-decor: фото (місце й кількість), написи, наліпки — де фактично лежать; '' без decor. */
export function decorSummary(kind: TrophyKind, decor: TrophyDecor | null | undefined): string {
  if (decor == null) return '';
  const shown = shownDecor(kind, decor);
  const layout = layoutDecor(kind, decor);
  const parts = [shown.photos.length > 0 ? `photos:${shown.photoPlace}:${shown.photos.length}` : 'photos:none'];
  if (layout.inscriptions.length > 0) {
    const places = layout.inscriptions.map((i) => moved(i.inscription.place, i.at === 'own' ? i.inscription.place : i.at));
    parts.push(`inscriptions:${places.join(',')}`);
  }
  if (layout.stickers.length > 0) parts.push(`stickers:${layout.stickers.map((s) => moved(s.place, s.at)).join(',')}`);
  return parts.join(';');
}
