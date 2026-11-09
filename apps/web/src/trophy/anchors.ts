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
  // Обруч r 0.34 на y 0.18–0.42 (п'ять камінців r 0.35 на y 0.28), розтруб 0.1–0.18 до r 0.36, постамент half 0.22 (грань 0.156).
  crown: {
    profile: {
      points: [
        [0.34, 0.1],
        [0.36, 0.14],
        [0.34, 0.18],
        [0.34, 0.42],
      ],
      segments: 40,
    },
    surfaces: { hoop: 'revolved', ...PLINTH },
    ring: { shape: 'profile', surface: 'hoop', y0: 0.18, y1: 0.42, tori: ['bottom', 'top'], tube: 0.01 },
    band: { shape: 'profile', surface: 'hoop', y0: 0.115, y1: 0.165, tori: [], tube: 0 },
    medallion: spot([0, 0.3, 0.345], FRONT, 0.14, 'hoop'),
    gems: { center: [0, 0.37, 0], axis: 'y', radius: 0.345, size: 0.04, surface: 'hoop' },
    plaque: { position: [0, 0.04, 0.158], tiltX: 0, width: 0.18, height: 0.05, surface: 'plinth-front' },
    stickers: {
      front: spot([0, 0.3, 0.345], FRONT, 0.12, 'hoop'),
      back: spot([0, 0.3, -0.345], BACK, 0.12, 'hoop'),
      // y 0.36: уся пляма (0.30–0.42) на обручі, нижче зубців.
      left: spot([-0.342, 0.36, 0], LEFT, 0.12, 'hoop'),
      right: spot([0.342, 0.36, 0], RIGHT, 0.12, 'hoop'),
      'base-left': spot([-0.158, 0.04, 0], LEFT, 0.06, 'plinth-left'),
      'base-right': spot([0.158, 0.04, 0], RIGHT, 0.06, 'plinth-right'),
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
  // Нові форми 25e: місця й поверхні з'являються в задачі 4.
  lovingcup: { surfaces: {}, stickers: {} },
  vase: { surfaces: {}, stickers: {} },
  plate: { surfaces: {}, stickers: {} },
  goblet: { surfaces: {}, stickers: {} },
  starmedal: { surfaces: {}, stickers: {} },
  cross: { surfaces: {}, stickers: {} },
  octagon: { surfaces: {}, stickers: {} },
  ribbon: { surfaces: {}, stickers: {} },
  diadem: { surfaces: {}, stickers: {} },
  laurel: { surfaces: {}, stickers: {} },
  olive: { surfaces: {}, stickers: {} },
  figure: { surfaces: {}, stickers: {} },
  flame: { surfaces: {}, stickers: {} },
  wings: { surfaces: {}, stickers: {} },
  fist: { surfaces: {}, stickers: {} },
};
