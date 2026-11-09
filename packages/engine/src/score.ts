export function speedFactor(timeMs: number, limitMs: number, speedBonus: boolean): number {
  if (!speedBonus) return 1;
  const used = Math.min(Math.max(timeMs / limitMs, 0), 1);
  return 1 - 0.5 * used;
}

export function scorePoints(points: number, accuracy: number, speed: number): number {
  return Math.round(points * accuracy * speed);
}

export interface AnswerPointsInput {
  points: number;
  accuracy: number;
  speed: number;
  multiplier: number;
  penalty: 'none' | 'minus';
}

/** Бали за відповідь з урахуванням множника раунду; штраф лише за дану відповідь з нульовою точністю. */
export function answerPoints({ points, accuracy, speed, multiplier, penalty }: AnswerPointsInput): number {
  if (accuracy > 0) return Math.round(points * accuracy * speed * multiplier);
  return penalty === 'minus' ? -Math.round(points * multiplier) : 0;
}

export interface BlitzSeriesPointsInput {
  price: number;
  multiplier: number;
  penalty: 'none' | 'minus';
  /** Крок плюсової серії; null — її немає. */
  plus: { step: number } | null;
  /** Крок мінусової серії; null — її немає. */
  minus: { step: number } | null;
  /** Правильних / неправильних поспіль перед цією спробою. */
  series: { plus: number; minus: number };
  correct: boolean;
}

/**
 * Бали спроби в бліц-раунді з наростальними серіями (26b). Множник множить ціну, а не бонус серії:
 * правильно — ціна × множник + правильних поспіль × крок; неправильно за мінусової серії — −(ціна × множник + неправильних поспіль × крок),
 * незалежно від penalty; без неї — штраф як був (penalty 'minus' — −ціна × множник, інакше 0).
 */
export function blitzSeriesPoints({ price, multiplier, penalty, plus, minus, series, correct }: BlitzSeriesPointsInput): number {
  const base = Math.round(price * multiplier);
  if (correct) return base + (plus === null ? 0 : series.plus * plus.step);
  if (minus !== null) return -(base + series.minus * minus.step);
  return penalty === 'minus' ? -base : 0;
}

export function streakBonus(basePoints: number, bonus: { kind: 'percent' | 'fixed'; value: number }): number {
  return bonus.kind === 'percent' ? Math.round((basePoints * bonus.value) / 100) : bonus.value;
}

/** Бали фіналу: правильно — +ставка, неправильно або без відповіді — −ставка (без −0 за нульову ставку). */
export function finalPoints(wager: number, correct: boolean): number {
  return correct ? wager : 0 - wager;
}

/** Частка ціни за ланцюжок: 1 найшвидшому, лінійно до 0.5 на межі часу. */
export function chainFactor(timeMs: number, fastestMs: number, limitMs: number): number {
  if (limitMs <= fastestMs) return 1;
  return Math.min(Math.max(1 - (0.5 * (timeMs - fastestMs)) / (limitMs - fastestMs), 0.5), 1);
}
