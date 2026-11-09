import type { TrophyAppearance } from '@quiz/shared';

export interface AppearancePose {
  /** Зсув групи по y, у r. */
  lift: number;
  /** Додатковий поворот навколо Y, рад. */
  turn: number;
  /** Рівномірний масштаб. */
  scale: number;
  /** Множник scale.y (удар об підлогу). */
  squash: number;
  /** Група трофея видима. */
  visible: boolean;
  /** Прозорість спалаху, 0..1. */
  flash: number;
  /** Прозорість диска-постаменту, 0..1. */
  pedestal: number;
  /** Відсікати все нижче y = 0. */
  clip: boolean;
}

export const NEUTRAL_POSE: AppearancePose = { lift: 0, turn: 0, scale: 1, squash: 1, visible: true, flash: 0, pedestal: 0, clip: false };

/** Тривалість кожної анімації, с. Усі коротші за CEREMONY_MS.step. */
export const APPEAR_SECONDS: Record<TrophyAppearance, number> = { spin: 1.4, rise: 1.6, drop: 1.3, flash: 1.5 };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** Ease-out cubic. */
const ease = (x: number) => 1 - (1 - x) ** 3;
const tent = (t: number, center: number, half: number) => Math.max(0, 1 - Math.abs(t - center) / half);

function dropLift(t: number): number {
  if (t < 0.5) return 3 * (1 - (t / 0.5) ** 2);
  if (t < 0.75) return 0.35 * Math.sin((Math.PI * (t - 0.5)) / 0.25);
  if (t < 0.9) return 0.1 * Math.sin((Math.PI * (t - 0.75)) / 0.15);
  return 0;
}

/** Поза трофея в момент t ∈ [0, 1] анімації появи; t поза межами обрізається. */
export function appearancePose(kind: TrophyAppearance, time: number): AppearancePose {
  const t = clamp01(time);
  switch (kind) {
    case 'spin': {
      const e = ease(t);
      return { ...NEUTRAL_POSE, turn: 4 * Math.PI * e, scale: 0.6 + 0.4 * e };
    }
    case 'rise':
      return { ...NEUTRAL_POSE, lift: 2 * (ease(t) - 1), clip: t < 1, pedestal: t <= 0.8 ? 1 : (1 - t) / 0.2 };
    case 'drop':
      return { ...NEUTRAL_POSE, lift: dropLift(t), squash: 1 - 0.15 * tent(t, 0.5, 0.04) - 0.08 * tent(t, 0.75, 0.04) };
    case 'flash': {
      const u = clamp01((t - 0.15) / 0.85);
      const e = ease(u);
      return {
        ...NEUTRAL_POSE,
        flash: t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 0.15) / 0.35),
        visible: t >= 0.15,
        scale: 0.3 + 0.7 * e,
        turn: 2 * Math.PI * e,
      };
    }
  }
}
