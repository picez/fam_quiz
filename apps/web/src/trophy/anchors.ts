import type { StickerPlace, TrophyKind } from '@quiz/shared';

/** Координати в просторі моделі (висота ~1, низ на y = 0, лице до +Z). */
export type Vec3 = readonly [number, number, number];

/** Стрічка навколо осі Y: зрізаний конус із необов'язковими обідками-торами. segments 0 — «n×8» (кільце фото). */
export interface Band {
  y: number;
  height: number;
  radiusTop: number;
  radiusBottom: number;
  segments: number;
  tori: readonly { y: number; radius: number; tube: number }[];
}
/** Пляма на поверхні: size — діаметр (ширина). */
export interface Spot {
  position: Vec3;
  normal: Vec3;
  size: number;
}
export interface Plate {
  position: Vec3;
  tiltX: number;
  width: number;
  height: number;
}
/** Самоцвіти по колу; 'y' — коло в площині XZ (перший спереду), 'z' — в площині XY (перший угорі). */
export interface Circle {
  center: Vec3;
  axis: 'y' | 'z';
  radius: number;
  size: number;
}
export interface KindAnchors {
  ring?: Band;
  rim?: Band;
  band?: Band;
  medallion?: Spot;
  back?: Spot;
  gems?: Circle;
  plaque?: Plate;
  stickers: Partial<Record<StickerPlace, Spot>>;
}

const unit = (x: number, y: number, z: number): Vec3 => {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
};
const spot = (position: Vec3, normal: Vec3, size: number): Spot => ({ position, normal, size });

const FRONT: Vec3 = [0, 0, 1];
const BACK: Vec3 = [0, 0, -1];
const LEFT: Vec3 = [-1, 0, 0];
const RIGHT: Vec3 = [1, 0, 0];

/**
 * Точки кріплення, виміряні за профілями з build-trophies.mjs. Грааль — числа запеченого сімейного кубка.
 * Квадратний постамент (4 сегменти, поворот 45°) має грані по осях: half·cos45 від центру.
 */
export const TROPHY_ANCHORS: Record<TrophyKind, KindAnchors> = {
  // Чаша 0.66–0.94 (r 0.22→0.33, ручки на ±X), вінець 0.95–1.0, кругла ніжка 0.2–0.25, постамент half 0.26 (грань 0.184).
  cup: {
    ring: {
      y: 0.8,
      height: 0.28,
      radiusTop: 0.345,
      radiusBottom: 0.26,
      segments: 0,
      tori: [
        { y: 0.94, radius: 0.34, tube: 0.012 },
        { y: 0.66, radius: 0.255, tube: 0.012 },
      ],
    },
    rim: {
      y: 0.975,
      height: 0.05,
      radiusTop: 0.352,
      radiusBottom: 0.335,
      segments: 120,
      tori: [
        { y: 0.995, radius: 0.35, tube: 0.008 },
        { y: 0.955, radius: 0.335, tube: 0.008 },
      ],
    },
    band: { y: 0.225, height: 0.05, radiusTop: 0.162, radiusBottom: 0.172, segments: 80, tori: [] },
    medallion: spot([0, 0.82, 0.31], unit(0, -0.1, 1), 0.2),
    back: spot([0, 0.82, -0.31], unit(0, -0.1, -1), 0.2),
    gems: { center: [0, 0.8, 0], axis: 'y', radius: 0.31, size: 0.07 },
    plaque: { position: [0, 0.1, 0.186], tiltX: 0, width: 0.24, height: 0.1 },
    stickers: {
      front: spot([0, 0.75, 0.3], unit(0, -0.2, 1), 0.12),
      back: spot([0, 0.75, -0.3], unit(0, -0.2, -1), 0.12),
      // Повернуті на 50° від осі ручок (±X) до переду: на чаші між ручкою й front.
      left: spot([-0.21, 0.75, 0.177], unit(-0.766, -0.2, 0.643), 0.12),
      right: spot([0.21, 0.75, 0.177], unit(0.766, -0.2, 0.643), 0.12),
      'base-left': spot([-0.186, 0.1, 0], LEFT, 0.12),
      'base-right': spot([0.186, 0.1, 0], RIGHT, 0.12),
    },
  },
  // Диск r 0.34 по центру (0, 0.42), повернутий лицем до +Z: перед z 0.05, зірка до z 0.10, зворот z -0.04.
  medal: {
    medallion: spot([0, 0.42, 0.105], FRONT, 0.3),
    back: spot([0, 0.42, -0.042], BACK, 0.52),
    gems: { center: [0, 0.42, 0.045], axis: 'z', radius: 0.28, size: 0.045 },
    stickers: {
      front: spot([0, 0.17, 0.04], FRONT, 0.12),
      back: spot([0, 0.17, -0.042], BACK, 0.12),
      left: spot([-0.342, 0.42, 0], LEFT, 0.06),
      right: spot([0.342, 0.42, 0], RIGHT, 0.06),
    },
  },
  // Обруч r 0.34 на y 0.18–0.42 (п'ять камінців r 0.35 на y 0.28), розтруб 0.1–0.18 до r 0.36, постамент half 0.22 (грань 0.156).
  crown: {
    ring: {
      y: 0.3,
      height: 0.24,
      radiusTop: 0.345,
      radiusBottom: 0.345,
      segments: 0,
      tori: [
        { y: 0.42, radius: 0.345, tube: 0.01 },
        { y: 0.18, radius: 0.345, tube: 0.01 },
      ],
    },
    band: { y: 0.14, height: 0.05, radiusTop: 0.362, radiusBottom: 0.362, segments: 120, tori: [] },
    medallion: spot([0, 0.3, 0.345], FRONT, 0.14),
    gems: { center: [0, 0.3, 0], axis: 'y', radius: 0.345, size: 0.04 },
    plaque: { position: [0, 0.04, 0.158], tiltX: 0, width: 0.18, height: 0.05 },
    stickers: {
      front: spot([0, 0.3, 0.345], FRONT, 0.12),
      back: spot([0, 0.3, -0.345], BACK, 0.12),
      left: spot([-0.342, 0.37, 0], LEFT, 0.12),
      right: spot([0.342, 0.37, 0], RIGHT, 0.12),
      'base-left': spot([-0.158, 0.04, 0], LEFT, 0.06),
      'base-right': spot([0.158, 0.04, 0], RIGHT, 0.06),
    },
  },
  // Зірка (outer 0.4, inner 0.17) на y 0.62, лицем до +Z: товщина 0.12 у центрі; постамент half 0.2 (грань 0.141) заввишки 0.18.
  star: {
    medallion: spot([0, 0.62, 0.121], FRONT, 0.2),
    back: spot([0, 0.62, -0.121], BACK, 0.2),
    gems: { center: [0, 0.62, 0.07], axis: 'z', radius: 0.12, size: 0.04 },
    plaque: { position: [0, 0.09, 0.143], tiltX: 0, width: 0.2, height: 0.09 },
    stickers: {
      front: spot([0, 0.62, 0.121], FRONT, 0.12),
      back: spot([0, 0.62, -0.121], BACK, 0.12),
      left: spot([-0.12, 0.6, 0.06], unit(-0.5, 0, 0.87), 0.1),
      right: spot([0.12, 0.6, 0.06], unit(0.5, 0, 0.87), 0.1),
      'base-left': spot([-0.143, 0.09, 0], LEFT, 0.1),
      'base-right': spot([0.143, 0.09, 0], RIGHT, 0.1),
    },
  },
  // Постамент half 0.2 (грань 0.141) заввишки 0.22; шати r 0.12 (y 0.22) → 0.07 (y 0.6): груди ~y 0.52 r 0.082.
  statuette: {
    band: { y: 0.27, height: 0.1, radiusTop: 0.112, radiusBottom: 0.122, segments: 80, tori: [] },
    medallion: spot([0, 0.52, 0.083], unit(0, -0.1, 1), 0.1),
    gems: { center: [0, 0.5, 0], axis: 'y', radius: 0.088, size: 0.03 },
    plaque: { position: [0, 0.11, 0.143], tiltX: 0, width: 0.18, height: 0.1 },
    stickers: {
      front: spot([0, 0.45, 0.09], unit(0, -0.1, 1), 0.07),
      back: spot([0, 0.45, -0.09], unit(0, -0.1, -1), 0.07),
      left: spot([-0.09, 0.45, 0], unit(-1, -0.1, 0), 0.07),
      right: spot([0.09, 0.45, 0], unit(1, -0.1, 0), 0.07),
      'base-left': spot([-0.143, 0.11, 0], LEFT, 0.1),
      'base-right': spot([0.143, 0.11, 0], RIGHT, 0.1),
    },
  },
  // Запечений сімейний кубок (generate-glb.mjs): тіло r 0.37–0.44 на y 0.7–1.48, ніжка, основа r 0.27.
  grail: {
    ring: {
      y: 1.0,
      height: 0.52,
      radiusTop: 0.49,
      radiusBottom: 0.475,
      segments: 0,
      tori: [
        { y: 1.27, radius: 0.5, tube: 0.028 },
        { y: 0.73, radius: 0.485, tube: 0.028 },
      ],
    },
    rim: {
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
    band: { y: 0.015, height: 0.03, radiusTop: 0.272, radiusBottom: 0.262, segments: 120, tori: [] },
    medallion: spot([0, 0.95, 0.41], FRONT, 0.3),
    back: spot([0, 0.95, -0.41], BACK, 0.3),
    gems: { center: [0, 0.95, 0], axis: 'y', radius: 0.405, size: 0.06 },
    plaque: { position: [0, 0.085, 0.235], tiltX: -0.32, width: 0.46, height: 0.18 },
    stickers: {
      front: spot([0, 0.85, 0.395], FRONT, 0.12),
      back: spot([0, 0.85, -0.395], BACK, 0.12),
      left: spot([-0.395, 0.85, 0], LEFT, 0.12),
      right: spot([0.395, 0.85, 0], RIGHT, 0.12),
      'base-left': spot([-0.268, 0.015, 0], LEFT, 0.05),
      'base-right': spot([0.268, 0.015, 0], RIGHT, 0.05),
    },
  },
};
