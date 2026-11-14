/** Затиснути value в межі: Math.min(max, Math.max(min, value)). Для min > max повертає max (як і всі давні копії цього виразу). */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** clamp(value, 0, 1). */
export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}
