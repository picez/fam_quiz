import type { StickerPlace, TrophyKind } from '@quiz/shared';

/** Координати в просторі моделі (висота ~1, низ на y = 0, лице до +Z). */
export type Vec3 = readonly [number, number, number];

/** Поверхня форми: тіло обертання навколо Y (ділянка — кут × y) чи пласка грань (ділянка — вздовж грані × y). */
export type SurfaceKind = 'revolved' | 'flat';

/** Зовнішній профіль лате моделі: [r, y] знизу вгору (y не спадає), segments — сегменти лате по колу. */
export interface Profile {
  points: readonly (readonly [number, number])[];
  segments: number;
}

/** Пляма на поверхні: size — діаметр (ширина); surface — id поверхні форми. */
export interface Spot {
  position: Vec3;
  normal: Vec3;
  size: number;
  surface: string;
}
export interface Plate {
  position: Vec3;
  tiltX: number;
  width: number;
  height: number;
  surface: string;
}
/**
 * Самоцвіти по колу; 'y' — коло в площині XZ (перший спереду), 'z' — в площині XY (перший угорі).
 * avoid — сектори кола 'y' (кут atan2(x, z) ± halfWidth, радіани), де самоцвіт ховався б (ручки кубка).
 */
export interface Circle {
  center: Vec3;
  axis: 'y' | 'z';
  radius: number;
  size: number;
  surface: string;
  avoid?: { angles: readonly number[]; halfWidth: number };
}

/**
 * Смуга оформлення:
 * - profile — по профілю форми між y0 і y1 (обідки-тори на краях з tube);
 * - raised — піднятий зрізаний конус (запечений вигляд грааля) з торами;
 * - face — пластина на пласкій грані.
 */
export type BandAnchor =
  | { shape: 'profile'; surface: string; y0: number; y1: number; tori: readonly ('bottom' | 'top')[]; tube: number }
  | {
      shape: 'raised';
      surface: string;
      y: number;
      height: number;
      radiusTop: number;
      radiusBottom: number;
      segments: number;
      tori: readonly { y: number; radius: number; tube: number }[];
    }
  | { shape: 'face'; plate: Plate };

export interface KindAnchors {
  profile?: Profile;
  surfaces: Record<string, SurfaceKind>;
  ring?: BandAnchor;
  rim?: BandAnchor;
  band?: BandAnchor;
  medallion?: Spot;
  back?: Spot;
  /** Запасне місце звороту: задня грань постаменту. */
  baseBack?: Spot;
  gems?: Circle;
  plaque?: Plate;
  stickers: Partial<Record<StickerPlace, Spot>>;
}

/** Радіус профілю на висоті y: лінійно між сусідніми точками; поза межами — крайня точка. */
export function profileRadius(profile: Profile, y: number): number {
  const points = profile.points;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (y >= last[1]) return last[0];
  for (let i = 0; i < points.length - 1; i++) {
    const [r0, y0] = points[i]!;
    const [r1, y1] = points[i + 1]!;
    // Відрізки з рівними y (дно) пропускаються: береться наступний, зовнішній.
    if (y1 <= y0 || y > y1) continue;
    if (y <= y0) return r0;
    const t = (y - y0) / (y1 - y0);
    return r0 * (1 - t) + r1 * t;
  }
  return first[0];
}

const unit = (x: number, y: number, z: number): Vec3 => {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
};
const spot = (position: Vec3, normal: Vec3, size: number, surface: string): Spot => ({ position, normal, size, surface });

const FRONT: Vec3 = [0, 0, 1];
const BACK: Vec3 = [0, 0, -1];
const LEFT: Vec3 = [-1, 0, 0];
const RIGHT: Vec3 = [1, 0, 0];

const PLINTH = {
  'plinth-front': 'flat',
  'plinth-back': 'flat',
  'plinth-left': 'flat',
  'plinth-right': 'flat',
} as const satisfies Record<string, SurfaceKind>;

/**
 * Точки кріплення, виміряні за профілями з build-trophies.mjs. Грааль — числа запеченого сімейного кубка.
 * Квадратний постамент (4 сегменти, поворот 45°) має грані по осях: half·cos45 від центру.
 */
export const TROPHY_ANCHORS: Record<TrophyKind, KindAnchors> = {
  // Чаша 0.66–0.94 (r 0.22→0.33, ручки на ±X), вінець 0.95–1.0, кругла ніжка 0.2–0.25, постамент half 0.26 (грань 0.184) заввишки 0.2.
  cup: {
    profile: {
      points: [
        [0.17, 0.2],
        [0.16, 0.25],
        [0.06, 0.3],
        [0.045, 0.42],
        [0.07, 0.45],
        [0.045, 0.48],
        [0.1, 0.55],
        [0.22, 0.66],
        [0.3, 0.8],
        [0.33, 0.95],
        [0.35, 1.0],
      ],
      segments: 40,
    },
    surfaces: { bowl: 'revolved', foot: 'revolved', ...PLINTH },
    ring: { shape: 'profile', surface: 'bowl', y0: 0.72, y1: 0.94, tori: ['bottom', 'top'], tube: 0.012 },
    rim: { shape: 'profile', surface: 'bowl', y0: 0.955, y1: 0.995, tori: ['bottom', 'top'], tube: 0.008 },
    // Поясок — на передній грані постаменту, над табличкою (проміжок 0.01).
    band: { shape: 'face', plate: { position: [0, 0.17, 0.186], tiltX: 0, width: 0.32, height: 0.04, surface: 'plinth-front' } },
    medallion: spot([0, 0.82, 0.31], unit(0, -0.1, 1), 0.2, 'bowl'),
    back: spot([0, 0.82, -0.31], unit(0, -0.1, -1), 0.2, 'bowl'),
    baseBack: spot([0, 0.1, -0.186], BACK, 0.16, 'plinth-back'),
    // Ручки на ±X займають ±4.9° (виміряно за cup.glb на висотах чаші) — з запасом 6°.
    gems: {
      center: [0, 0.8, 0],
      axis: 'y',
      radius: 0.31,
      size: 0.07,
      surface: 'bowl',
      avoid: { angles: [Math.PI / 2, -Math.PI / 2], halfWidth: (6 * Math.PI) / 180 },
    },
    plaque: { position: [0, 0.09, 0.186], tiltX: 0, width: 0.24, height: 0.1, surface: 'plinth-front' },
    stickers: {
      front: spot([0, 0.75, 0.3], unit(0, -0.2, 1), 0.12, 'bowl'),
      back: spot([0, 0.75, -0.3], unit(0, -0.2, -1), 0.12, 'bowl'),
      // Повернуті на 40° від осі ручок (±X) до переду: на чаші між ручкою й front.
      left: spot([-0.21, 0.75, 0.177], unit(-0.766, -0.2, 0.643), 0.12, 'bowl'),
      right: spot([0.21, 0.75, 0.177], unit(0.766, -0.2, 0.643), 0.12, 'bowl'),
      'base-left': spot([-0.186, 0.1, 0], LEFT, 0.12, 'plinth-left'),
      'base-right': spot([0.186, 0.1, 0], RIGHT, 0.12, 'plinth-right'),
    },
  },
  // Диск r 0.34 по центру (0, 0.42), повернутий лицем до +Z: перед z 0.05, зірка до z 0.10, зворот z -0.04.
  medal: {
    surfaces: { front: 'flat', back: 'flat', 'edge-left': 'flat', 'edge-right': 'flat' },
    medallion: spot([0, 0.42, 0.105], FRONT, 0.3, 'front'),
    back: spot([0, 0.42, -0.042], BACK, 0.52, 'back'),
    gems: { center: [0, 0.42, 0.045], axis: 'z', radius: 0.28, size: 0.045, surface: 'front' },
    stickers: {
      front: spot([0, 0.17, 0.04], FRONT, 0.12, 'front'),
      back: spot([0, 0.17, -0.042], BACK, 0.12, 'back'),
      left: spot([-0.342, 0.42, 0], LEFT, 0.06, 'edge-left'),
      right: spot([0.342, 0.42, 0], RIGHT, 0.06, 'edge-right'),
    },
  },
  // Обруч r 0.34 на y 0.3–0.54 (п'ять камінців r 0.35 на y 0.4), розтруб 0.22–0.3 до r 0.36; постамент plinth(0.3, 0.2)
  // (грань 0.212, верх 0.23): корона піднята на 0.12, щоб розтруб не ховав табличку.
  crown: {
    profile: {
      points: [
        [0.34, 0.22],
        [0.36, 0.26],
        [0.34, 0.3],
        [0.34, 0.54],
      ],
      segments: 40,
    },
    surfaces: { hoop: 'revolved', ...PLINTH },
    ring: { shape: 'profile', surface: 'hoop', y0: 0.3, y1: 0.54, tori: ['bottom', 'top'], tube: 0.01 },
    band: { shape: 'profile', surface: 'hoop', y0: 0.235, y1: 0.285, tori: [], tube: 0 },
    medallion: spot([0, 0.42, 0.345], FRONT, 0.14, 'hoop'),
    gems: { center: [0, 0.49, 0], axis: 'y', radius: 0.345, size: 0.04, surface: 'hoop' },
    plaque: { position: [0, 0.085, 0.214], tiltX: 0, width: 0.26, height: 0.1, surface: 'plinth-front' },
    stickers: {
      front: spot([0, 0.42, 0.345], FRONT, 0.12, 'hoop'),
      back: spot([0, 0.42, -0.345], BACK, 0.12, 'hoop'),
      // y 0.48: уся пляма (0.42–0.54) на обручі, нижче зубців.
      left: spot([-0.342, 0.48, 0], LEFT, 0.12, 'hoop'),
      right: spot([0.342, 0.48, 0], RIGHT, 0.12, 'hoop'),
      'base-left': spot([-0.214, 0.1, 0], LEFT, 0.12, 'plinth-left'),
      'base-right': spot([0.214, 0.1, 0], RIGHT, 0.12, 'plinth-right'),
    },
  },
  // Зірка (outer 0.4, inner 0.17) на y 0.62, лицем до +Z: товщина 0.12 у центрі; постамент half 0.2 (грань 0.141) заввишки 0.18.
  star: {
    surfaces: { front: 'flat', back: 'flat', ...PLINTH },
    medallion: spot([0, 0.62, 0.121], FRONT, 0.2, 'front'),
    back: spot([0, 0.62, -0.121], BACK, 0.2, 'back'),
    gems: { center: [0, 0.62, 0.109], axis: 'z', radius: 0.06, size: 0.04, surface: 'front' },
    plaque: { position: [0, 0.09, 0.143], tiltX: 0, width: 0.2, height: 0.09, surface: 'plinth-front' },
    stickers: {
      front: spot([0, 0.62, 0.121], FRONT, 0.12, 'front'),
      back: spot([0, 0.62, -0.121], BACK, 0.12, 'back'),
      left: spot([-0.12, 0.6, 0.072], unit(-0.5, 0, 0.87), 0.1, 'front'),
      right: spot([0.12, 0.6, 0.072], unit(0.5, 0, 0.87), 0.1, 'front'),
      'base-left': spot([-0.143, 0.09, 0], LEFT, 0.1, 'plinth-left'),
      'base-right': spot([0.143, 0.09, 0], RIGHT, 0.1, 'plinth-right'),
    },
  },
  // Постамент half 0.2 (грань 0.141) заввишки 0.22 (верх 0.25 зі скосом); шати r 0.12 (y 0.22) → 0.07 (y 0.6): груди ~y 0.52 r 0.082.
  statuette: {
    profile: {
      points: [
        [0.12, 0.22],
        [0.1, 0.4],
        [0.07, 0.6],
      ],
      segments: 28,
    },
    surfaces: { robe: 'revolved', ...PLINTH },
    band: { shape: 'profile', surface: 'robe', y0: 0.262, y1: 0.338, tori: [], tube: 0 },
    medallion: spot([0, 0.52, 0.083], unit(0, -0.1, 1), 0.1, 'robe'),
    gems: { center: [0, 0.5, 0], axis: 'y', radius: 0.088, size: 0.03, surface: 'robe' },
    plaque: { position: [0, 0.11, 0.143], tiltX: 0, width: 0.18, height: 0.1, surface: 'plinth-front' },
    stickers: {
      front: spot([0, 0.45, 0.09], unit(0, -0.1, 1), 0.07, 'robe'),
      back: spot([0, 0.45, -0.09], unit(0, -0.1, -1), 0.07, 'robe'),
      left: spot([-0.09, 0.45, 0], unit(-1, -0.1, 0), 0.07, 'robe'),
      right: spot([0.09, 0.45, 0], unit(1, -0.1, 0), 0.07, 'robe'),
      'base-left': spot([-0.143, 0.11, 0], LEFT, 0.1, 'plinth-left'),
      'base-right': spot([0.143, 0.11, 0], RIGHT, 0.1, 'plinth-right'),
    },
  },
  // Запечений сімейний кубок (generate-glb.mjs): тіло r 0.37–0.44 на y 0.7–1.48, ніжка, основа r 0.27.
  grail: {
    profile: {
      points: [
        [0, 0],
        [0.26, 0],
        [0.27, 0.03],
        [0.22, 0.065],
        [0.09, 0.1],
        [0.075, 0.16],
        [0.11, 0.23],
        [0.075, 0.3],
        [0.09, 0.36],
        [0.12, 0.42],
        [0.26, 0.52],
        [0.37, 0.7],
        [0.405, 0.95],
        [0.41, 1.22],
        [0.435, 1.44],
        [0.44, 1.48],
      ],
      segments: 120,
    },
    surfaces: { body: 'revolved', base: 'revolved' },
    // Кільце й рим — навмисно підняті над тілом, як на запеченому.
    ring: {
      shape: 'raised',
      surface: 'body',
      y: 1.0,
      height: 0.52,
      radiusTop: 0.49,
      radiusBottom: 0.475,
      segments: 120,
      tori: [
        { y: 1.27, radius: 0.5, tube: 0.028 },
        { y: 0.73, radius: 0.485, tube: 0.028 },
      ],
    },
    rim: {
      shape: 'raised',
      surface: 'body',
      y: 1.37,
      height: 0.16,
      radiusTop: 0.463,
      radiusBottom: 0.455,
      segments: 220,
      tori: [
        { y: 1.455, radius: 0.452, tube: 0.012 },
        { y: 1.285, radius: 0.452, tube: 0.012 },
      ],
    },
    band: { shape: 'profile', surface: 'base', y0: 0, y1: 0.03, tori: [], tube: 0 },
    medallion: spot([0, 0.95, 0.41], FRONT, 0.3, 'body'),
    back: spot([0, 0.95, -0.41], BACK, 0.3, 'body'),
    gems: { center: [0, 0.95, 0], axis: 'y', radius: 0.405, size: 0.06, surface: 'body' },
    // Табличка лежить на пологому схилі основи (r 0.22 → 0.09 на y 0.065–0.1, нахил 1.308 рад від вертикалі) уздовж
    // середньої лінії: нижній край y ≈ 0.07, z ≈ 0.211 — над пояском (y 0–0.03); ширина 0.256 (пропорція полотна
    // 1024×400), щоб кути не звисали за основу (r ≤ 0.27).
    plaque: { position: [0, 0.083, 0.1625], tiltX: -1.308, width: 0.256, height: 0.1, surface: 'base' },
    stickers: {
      front: spot([0, 0.85, 0.395], FRONT, 0.12, 'body'),
      back: spot([0, 0.85, -0.395], BACK, 0.12, 'body'),
      left: spot([-0.395, 0.85, 0], LEFT, 0.12, 'body'),
      right: spot([0.395, 0.85, 0], RIGHT, 0.12, 'body'),
      // y 0.025: уся пляма (0–0.05) над підлогою.
      'base-left': spot([-0.268, 0.025, 0], LEFT, 0.05, 'base'),
      'base-right': spot([0.268, 0.025, 0], RIGHT, 0.05, 'base'),
    },
  },
  // ── 25e: числа з коментарів до функцій моделей у build-trophies.mjs ──
  // Постамент plinth(0.26, 0.2) (грань 0.184), ніжка 0.23–0.47, чаша 0.47–0.98 (r 0.12 → 0.37), вінець 0.98–1.005 (r 0.39);
  // вуха — тор r 0.03 у площині XY на ±X біля стінки чаші, y 0.62–0.98.
  lovingcup: {
    profile: {
      points: [
        [0.2, 0.23],
        [0.2, 0.26],
        [0.16, 0.27],
        [0.16, 0.3],
        [0.1, 0.31],
        [0.06, 0.36],
        [0.045, 0.42],
        [0.07, 0.45],
        [0.05, 0.47],
        [0.12, 0.48],
        [0.22, 0.53],
        [0.3, 0.6],
        [0.345, 0.7],
        [0.365, 0.82],
        [0.37, 0.94],
        [0.37, 0.98],
        [0.39, 0.99],
        [0.39, 1.005],
      ],
      segments: 36,
    },
    surfaces: { bowl: 'revolved', foot: 'revolved', ...PLINTH },
    ring: { shape: 'profile', surface: 'bowl', y0: 0.7, y1: 0.925, tori: ['bottom', 'top'], tube: 0.012 },
    // Рим — на прямій стінці під вінцем (вище 0.98 вінець різко розходиться).
    rim: { shape: 'profile', surface: 'bowl', y0: 0.95, y1: 0.977, tori: ['bottom', 'top'], tube: 0.008 },
    band: { shape: 'face', plate: { position: [0, 0.17, 0.186], tiltX: 0, width: 0.32, height: 0.04, surface: 'plinth-front' } },
    medallion: spot([0, 0.8, 0.364], unit(0, -0.12, 1), 0.2, 'bowl'),
    back: spot([0, 0.83, -0.367], unit(0, -0.1, -1), 0.18, 'bowl'),
    baseBack: spot([0, 0.1, -0.186], BACK, 0.16, 'plinth-back'),
    // Вуха на ±X займають ±4.6–5.2° (r 0.03 на стінці r 0.33–0.37) — з запасом 7°.
    gems: {
      center: [0, 0.8, 0],
      axis: 'y',
      radius: 0.364,
      size: 0.07,
      surface: 'bowl',
      avoid: { angles: [Math.PI / 2, -Math.PI / 2], halfWidth: (7 * Math.PI) / 180 },
    },
    plaque: { position: [0, 0.09, 0.186], tiltX: 0, width: 0.24, height: 0.1, surface: 'plinth-front' },
    stickers: {
      // front і back — нижче звороту (0.74–0.92): напис звороту й задня наліпка не накладаються.
      front: spot([0, 0.66, 0.329], unit(0, -0.4, 1), 0.1, 'bowl'),
      back: spot([0, 0.66, -0.329], unit(0, -0.4, -1), 0.1, 'bowl'),
      // Повернуті на 40° від осі вух (±X) до переду, як у кубка.
      left: spot([-0.272, 0.75, 0.228], unit(-0.766, -0.15, 0.643), 0.12, 'bowl'),
      right: spot([0.272, 0.75, 0.228], unit(0.766, -0.15, 0.643), 0.12, 'bowl'),
      'base-left': spot([-0.186, 0.1, 0], LEFT, 0.12, 'plinth-left'),
      'base-right': spot([0.186, 0.1, 0], RIGHT, 0.12, 'plinth-right'),
    },
  },
  // Без постаменту: ніжка r 0.16 (y 0–0.04), черево r 0.27 на y 0.5, горло r 0.1 на y 0.9, розтруб r 0.16 на y 1.0.
  vase: {
    profile: {
      points: [
        [0.16, 0],
        [0.16, 0.04],
        [0.12, 0.06],
        [0.17, 0.15],
        [0.23, 0.3],
        [0.265, 0.42],
        [0.27, 0.5],
        [0.26, 0.6],
        [0.22, 0.72],
        [0.15, 0.82],
        [0.1, 0.9],
        [0.115, 0.96],
        [0.16, 1.0],
      ],
      segments: 48,
    },
    surfaces: { belly: 'revolved', foot: 'revolved' },
    ring: { shape: 'profile', surface: 'belly', y0: 0.38, y1: 0.62, tori: ['bottom', 'top'], tube: 0.01 },
    // Поясок — на прямій стінці ніжки, з відступом від підлоги й від зламу на 0.04.
    band: { shape: 'profile', surface: 'foot', y0: 0.005, y1: 0.035, tori: [], tube: 0 },
    medallion: spot([0, 0.5, 0.272], FRONT, 0.2, 'belly'),
    gems: { center: [0, 0.5, 0], axis: 'y', radius: 0.272, size: 0.07, surface: 'belly' },
    // Наліпки — під кільцем (0.38–0.62): фото кільцем чи самоцвітами їх не витісняють. Черево там r 0.22, схил 0.4.
    stickers: {
      front: spot([0, 0.27, 0.219], unit(0, -0.4, 1), 0.1, 'belly'),
      back: spot([0, 0.27, -0.219], unit(0, -0.4, -1), 0.1, 'belly'),
      left: spot([-0.219, 0.27, 0], unit(-1, -0.4, 0), 0.1, 'belly'),
      right: spot([0.219, 0.27, 0], unit(1, -0.4, 0), 0.1, 'belly'),
    },
  },
  // Диск r 0.4 лицем до +Z з центром (0, 0.68): гладке заглиблення z 0.012 до r 0.3, зворот z −0.03 до r 0.36;
  // ззаду підпора до (0, 0.6, −0.025). Постамент plinth(0.24, 0.2) (грань 0.17).
  plate: {
    surfaces: { 'dish-front': 'flat', 'dish-back': 'flat', ...PLINTH },
    band: { shape: 'face', plate: { position: [0, 0.17, 0.172], tiltX: 0, width: 0.3, height: 0.04, surface: 'plinth-front' } },
    medallion: spot([0, 0.68, 0.013], FRONT, 0.36, 'dish-front'),
    // Зворот — вище підпори (її верх y ≈ 0.605).
    back: spot([0, 0.75, -0.031], BACK, 0.28, 'dish-back'),
    // Не менші за 0.09: коробка проєктора (±0.05) за нижнім самоцвітом сягає підпори за диском.
    gems: { center: [0, 0.68, 0.013], axis: 'z', radius: 0.18, size: 0.09, surface: 'dish-front' },
    plaque: { position: [0, 0.09, 0.172], tiltX: 0, width: 0.22, height: 0.1, surface: 'plinth-front' },
    stickers: {
      front: spot([0, 0.52, 0.013], FRONT, 0.12, 'dish-front'),
      'base-left': spot([-0.172, 0.1, 0], LEFT, 0.12, 'plinth-left'),
      'base-right': spot([0.172, 0.1, 0], RIGHT, 0.12, 'plinth-right'),
    },
  },
  // Диск ніжки r 0.2 (y 0–0.03), ніжка r 0.03 з кулею на 0.3, чаша 0.46–0.93 (r до 0.27), вінець 0.93–0.965 (r 0.29).
  goblet: {
    profile: {
      points: [
        [0.2, 0],
        [0.2, 0.03],
        [0.17, 0.045],
        [0.06, 0.075],
        [0.035, 0.1],
        [0.03, 0.2],
        [0.03, 0.4],
        [0.05, 0.46],
        [0.12, 0.5],
        [0.19, 0.56],
        [0.24, 0.64],
        [0.265, 0.74],
        [0.27, 0.85],
        [0.27, 0.93],
        [0.29, 0.945],
        [0.29, 0.965],
      ],
      segments: 40,
    },
    surfaces: { bowl: 'revolved', foot: 'revolved' },
    ring: { shape: 'profile', surface: 'bowl', y0: 0.64, y1: 0.845, tori: ['bottom', 'top'], tube: 0.01 },
    // Рим — на прямій стінці чаші r 0.27 під вінцем.
    rim: { shape: 'profile', surface: 'bowl', y0: 0.865, y1: 0.92, tori: ['bottom', 'top'], tube: 0.008 },
    band: { shape: 'profile', surface: 'foot', y0: 0.003, y1: 0.027, tori: [], tube: 0 },
    medallion: spot([0, 0.74, 0.267], unit(0, -0.15, 1), 0.18, 'bowl'),
    gems: { center: [0, 0.74, 0], axis: 'y', radius: 0.267, size: 0.06, surface: 'bowl' },
    stickers: {
      // Під кільцем (0.64–0.845) на схилі чаші (r 0.21, схил 0.625): фото кільцем чи самоцвітами їх не витісняють.
      front: spot([0, 0.59, 0.21], unit(0, -0.65, 1), 0.08, 'bowl'),
      back: spot([0, 0.59, -0.21], unit(0, -0.65, -1), 0.08, 'bowl'),
      left: spot([-0.21, 0.59, 0], unit(-1, -0.65, 0), 0.08, 'bowl'),
      right: spot([0.21, 0.59, 0], unit(1, -0.65, 0), 0.08, 'bowl'),
    },
  },
  // starShape(0.36, 0.15, 0.06, 0.02) з центром (0, 0.2912): лице z 0.06 у центрі → 0.02 на краях; бічні промені на 162° і 18°.
  starmedal: {
    surfaces: { face: 'flat', back: 'flat' },
    medallion: spot([0, 0.2912, 0.061], FRONT, 0.2, 'face'),
    back: spot([0, 0.2912, -0.061], BACK, 0.2, 'back'),
    gems: { center: [0, 0.2912, 0.05], axis: 'z', radius: 0.075, size: 0.045, surface: 'face' },
    stickers: {
      // На бічних променях за 0.19 від центру (лице там z ≈ 0.039).
      left: spot([-0.18, 0.35, 0.04], FRONT, 0.07, 'face'),
      right: spot([0.18, 0.35, 0.04], FRONT, 0.07, 'face'),
    },
  },
  // Хрест з центром (0, 0.35): рамена 0.16 завширшки, лице z 0.025; центральний диск r 0.13, лице z 0.045, зворот z −0.035.
  cross: {
    surfaces: { face: 'flat', back: 'flat' },
    medallion: spot([0, 0.35, 0.046], FRONT, 0.18, 'face'),
    back: spot([0, 0.35, -0.036], BACK, 0.18, 'back'),
    gems: { center: [0, 0.35, 0.045], axis: 'z', radius: 0.08, size: 0.045, surface: 'face' },
    stickers: {
      front: spot([0, 0.13, 0.026], FRONT, 0.12, 'face'),
      left: spot([-0.22, 0.35, 0.026], FRONT, 0.12, 'face'),
      right: spot([0.22, 0.35, 0.026], FRONT, 0.12, 'face'),
    },
  },
  // Восьмикутник r 0.34 з центром (0, 0.3141), лице z 0.035, бічні грані x ±0.314 (z ±0.035 з фасками);
  // піднятий r 0.25: лице z ±0.055, апофема 0.231 (пласке лице без фаски 0.015 — до 0.216).
  octagon: {
    surfaces: { face: 'flat', back: 'flat', 'edge-left': 'flat', 'edge-right': 'flat' },
    medallion: spot([0, 0.3141, 0.056], FRONT, 0.3, 'face'),
    back: spot([0, 0.3141, -0.056], BACK, 0.3, 'back'),
    gems: { center: [0, 0.3141, 0.056], axis: 'z', radius: 0.15, size: 0.06, surface: 'face' },
    stickers: {
      front: spot([0, 0.194, 0.056], FRONT, 0.1, 'face'),
      left: spot([-0.315, 0.3141, 0], LEFT, 0.06, 'edge-left'),
      right: spot([0.315, 0.3141, 0], RIGHT, 0.06, 'edge-right'),
    },
  },
  // Диск r 0.3 з центром (0, 0.3): лице z 0.045 → 0.04 до r 0.2, жолоб r 0.2–0.27, ребро r 0.3 (z −0.035…0.04 з фасками),
  // зворот z −0.035 до r 0.27; стрічки — вище 0.585.
  ribbon: {
    surfaces: { face: 'flat', back: 'flat', 'edge-left': 'flat', 'edge-right': 'flat' },
    medallion: spot([0, 0.3, 0.046], FRONT, 0.28, 'face'),
    back: spot([0, 0.3, -0.036], BACK, 0.38, 'back'),
    gems: { center: [0, 0.3, 0.036], axis: 'z', radius: 0.235, size: 0.045, surface: 'face' },
    stickers: {
      front: spot([0, 0.17, 0.043], FRONT, 0.1, 'face'),
      left: spot([-0.301, 0.3, 0.002], LEFT, 0.06, 'edge-left'),
      right: spot([0.301, 0.3, 0.002], RIGHT, 0.06, 'edge-right'),
    },
  },
  // Постамент plinth(0.22, 0.2) (грань 0.156); обруч r 0.3–0.31 на y 0.24–0.32; гребінь спереду (±74°) від 0.32 до 0.82;
  // камінь — куля r 0.06 у (0, 0.42, 0.315).
  diadem: {
    profile: {
      points: [
        [0.3, 0.24],
        [0.31, 0.28],
        [0.3, 0.32],
      ],
      segments: 48,
    },
    surfaces: { hoop: 'revolved', crest: 'flat', ...PLINTH },
    // Поясок — на грані постаменту, як у кубка: обруч (0.08 заввишки) лишається самоцвітам.
    band: { shape: 'face', plate: { position: [0, 0.17, 0.158], tiltX: 0, width: 0.27, height: 0.04, surface: 'plinth-front' } },
    // Медальйон — камея на центральному камені гребеня.
    medallion: spot([0, 0.42, 0.376], FRONT, 0.08, 'crest'),
    gems: { center: [0, 0.28, 0], axis: 'y', radius: 0.312, size: 0.05, surface: 'hoop' },
    plaque: { position: [0, 0.09, 0.158], tiltX: 0, width: 0.2, height: 0.1, surface: 'plinth-front' },
    stickers: {
      back: spot([0, 0.28, -0.312], BACK, 0.07, 'hoop'),
      left: spot([-0.312, 0.28, 0], LEFT, 0.07, 'hoop'),
      right: spot([0.312, 0.28, 0], RIGHT, 0.07, 'hoop'),
      'base-left': spot([-0.158, 0.1, 0], LEFT, 0.12, 'plinth-left'),
      'base-right': spot([0.158, 0.1, 0], RIGHT, 0.12, 'plinth-right'),
    },
  },
  // Постамент plinth(0.22, 0.2) (грань 0.156); вінок R 0.32 з центром (0, 0.62); вузол — куля r 0.024 у (0, 0.3, 0.016).
  // Наліпки front немає: грань постаменту зайнята пояском і табличкою, а на вузлі вміщується лише цятка.
  laurel: {
    surfaces: { ...PLINTH },
    band: { shape: 'face', plate: { position: [0, 0.17, 0.158], tiltX: 0, width: 0.27, height: 0.04, surface: 'plinth-front' } },
    plaque: { position: [0, 0.09, 0.158], tiltX: 0, width: 0.2, height: 0.1, surface: 'plinth-front' },
    stickers: {
      'base-left': spot([-0.158, 0.1, 0], LEFT, 0.12, 'plinth-left'),
      'base-right': spot([0.158, 0.1, 0], RIGHT, 0.12, 'plinth-right'),
    },
  },
  olive: {
    surfaces: { ...PLINTH },
    band: { shape: 'face', plate: { position: [0, 0.17, 0.158], tiltX: 0, width: 0.27, height: 0.04, surface: 'plinth-front' } },
    plaque: { position: [0, 0.09, 0.158], tiltX: 0, width: 0.2, height: 0.1, surface: 'plinth-front' },
    stickers: {
      'base-left': spot([-0.158, 0.1, 0], LEFT, 0.12, 'plinth-left'),
      'base-right': spot([0.158, 0.1, 0], RIGHT, 0.12, 'plinth-right'),
    },
  },
  // Постамент plinth(0.22, 0.2) (грань 0.156); барабан r 0.15 на y 0.23–0.36; тулуб r 0.075 → 0.1 на y 0.62–0.74.
  figure: {
    profile: {
      points: [
        [0.15, 0.23],
        [0.15, 0.36],
        [0.135, 0.375],
      ],
      segments: 40,
    },
    surfaces: { drum: 'revolved', torso: 'revolved', ...PLINTH },
    ring: { shape: 'profile', surface: 'drum', y0: 0.245, y1: 0.345, tori: ['bottom', 'top'], tube: 0.008 },
    band: { shape: 'face', plate: { position: [0, 0.17, 0.158], tiltX: 0, width: 0.27, height: 0.04, surface: 'plinth-front' } },
    // Медальйон — на грудях фігурки, між руками.
    medallion: spot([0, 0.69, 0.089], unit(0, -0.18, 1), 0.09, 'torso'),
    gems: { center: [0, 0.295, 0], axis: 'y', radius: 0.151, size: 0.05, surface: 'drum' },
    plaque: { position: [0, 0.09, 0.158], tiltX: 0, width: 0.2, height: 0.1, surface: 'plinth-front' },
    stickers: {
      front: spot([0, 0.295, 0.151], FRONT, 0.1, 'drum'),
      back: spot([0, 0.295, -0.151], BACK, 0.1, 'drum'),
      left: spot([-0.151, 0.295, 0], LEFT, 0.1, 'drum'),
      right: spot([0.151, 0.295, 0], RIGHT, 0.1, 'drum'),
      'base-left': spot([-0.158, 0.1, 0], LEFT, 0.12, 'plinth-left'),
      'base-right': spot([0.158, 0.1, 0], RIGHT, 0.12, 'plinth-right'),
    },
  },
  // Постамент plinth(0.22, 0.2) (грань 0.156); передній язик полум'я нахилений до +Z (лице z 0.165–0.185 на y 0.45–0.65),
  // задній — до −Z (лице z ≈ −0.165 на y 0.45–0.6).
  flame: {
    surfaces: { flame: 'revolved', ...PLINTH },
    band: { shape: 'face', plate: { position: [0, 0.17, 0.158], tiltX: 0, width: 0.27, height: 0.04, surface: 'plinth-front' } },
    medallion: spot([0, 0.49, 0.176], FRONT, 0.09, 'flame'),
    plaque: { position: [0, 0.09, 0.158], tiltX: 0, width: 0.2, height: 0.1, surface: 'plinth-front' },
    stickers: {
      front: spot([0, 0.49, 0.176], FRONT, 0.08, 'flame'),
      back: spot([-0.01, 0.5, -0.166], BACK, 0.08, 'flame'),
      'base-left': spot([-0.158, 0.1, 0], LEFT, 0.12, 'plinth-left'),
      'base-right': spot([0.158, 0.1, 0], RIGHT, 0.12, 'plinth-right'),
    },
  },
  // Постамент plinth(0.22, 0.2) (грань 0.156); куля r 0.1 на y 0.45; крила-віяла від (±0.05, 0.5), лице пір'їн z −0.034…−0.058.
  wings: {
    surfaces: { orb: 'revolved', 'wing-left': 'flat', 'wing-right': 'flat', ...PLINTH },
    band: { shape: 'face', plate: { position: [0, 0.17, 0.158], tiltX: 0, width: 0.27, height: 0.04, surface: 'plinth-front' } },
    medallion: spot([0, 0.45, 0.101], FRONT, 0.12, 'orb'),
    gems: { center: [0, 0.45, 0], axis: 'y', radius: 0.101, size: 0.04, surface: 'orb' },
    plaque: { position: [0, 0.09, 0.158], tiltX: 0, width: 0.2, height: 0.1, surface: 'plinth-front' },
    stickers: {
      // На віялі за 0.22 від кореня під кутом 0.6 від вертикалі: там пір'їни ще накривають одна одну.
      left: spot([-0.174, 0.68, -0.045], FRONT, 0.1, 'wing-left'),
      right: spot([0.174, 0.68, -0.045], FRONT, 0.1, 'wing-right'),
      'base-left': spot([-0.158, 0.1, 0], LEFT, 0.12, 'plinth-left'),
      'base-right': spot([0.158, 0.1, 0], RIGHT, 0.12, 'plinth-right'),
    },
  },
  // Постамент plinth(0.22, 0.2) (грань 0.156); передпліччя r 0.09–0.105 на y 0.23–0.5, манжета 0.5–0.545;
  // долоня — box 0.3 × 0.2 × 0.16 з центром (0, 0.72, 0) (тил z −0.08), загнуті пальці спереду (z до 0.18 на y 0.72–0.82).
  fist: {
    profile: {
      points: [
        [0.09, 0.23],
        [0.095, 0.32],
        [0.105, 0.42],
        [0.1, 0.5],
        [0.115, 0.5],
        [0.115, 0.545],
        [0.1, 0.545],
        [0.1, 0.64],
      ],
      segments: 32,
    },
    surfaces: { forearm: 'revolved', fingers: 'flat', hand: 'flat', ...PLINTH },
    ring: { shape: 'profile', surface: 'forearm', y0: 0.25, y1: 0.48, tori: ['bottom', 'top'], tube: 0.008 },
    band: { shape: 'face', plate: { position: [0, 0.17, 0.158], tiltX: 0, width: 0.27, height: 0.04, surface: 'plinth-front' } },
    medallion: spot([0, 0.37, 0.102], unit(0, -0.1, 1), 0.1, 'forearm'),
    plaque: { position: [0, 0.09, 0.158], tiltX: 0, width: 0.2, height: 0.1, surface: 'plinth-front' },
    stickers: {
      // Над великим пальцем (його верх y ≈ 0.726), нормаль трохи вгору — за вигином пальців.
      front: spot([0, 0.775, 0.16], unit(0, 0.2, 1), 0.09, 'fingers'),
      back: spot([0, 0.68, -0.081], BACK, 0.1, 'hand'),
      'base-left': spot([-0.158, 0.1, 0], LEFT, 0.12, 'plinth-left'),
      'base-right': spot([0.158, 0.1, 0], RIGHT, 0.12, 'plinth-right'),
    },
  },
};

/** Форми 25e (для тестів і e2e). */
export const NEW_KINDS_25E: readonly TrophyKind[] = [
  'lovingcup',
  'vase',
  'plate',
  'goblet',
  'starmedal',
  'cross',
  'octagon',
  'ribbon',
  'diadem',
  'laurel',
  'olive',
  'figure',
  'flame',
  'wings',
  'fist',
];
