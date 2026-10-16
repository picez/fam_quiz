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

export function streakBonus(basePoints: number, bonus: { kind: 'percent' | 'fixed'; value: number }): number {
  return bonus.kind === 'percent' ? Math.round((basePoints * bonus.value) / 100) : bonus.value;
}
