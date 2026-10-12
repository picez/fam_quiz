export function speedFactor(timeMs: number, limitMs: number, speedBonus: boolean): number {
  if (!speedBonus) return 1;
  const used = Math.min(Math.max(timeMs / limitMs, 0), 1);
  return 1 - 0.5 * used;
}

export function scorePoints(points: number, accuracy: number, speed: number): number {
  return Math.round(points * accuracy * speed);
}
