/** Пресети рівнів для 5…15 сходинок; кожен строго зростає від 100 до 10 000. */
export const LADDER_PRESETS: Readonly<Record<number, readonly number[]>> = {
  5: [100, 300, 1000, 3000, 10000],
  6: [100, 250, 600, 1500, 4000, 10000],
  7: [100, 200, 500, 1000, 2000, 5000, 10000],
  8: [100, 200, 400, 700, 1500, 2500, 5000, 10000],
  9: [100, 200, 300, 600, 1000, 2000, 3000, 6000, 10000],
  10: [100, 150, 300, 500, 800, 1500, 2000, 4000, 6000, 10000],
  11: [100, 150, 250, 400, 600, 1000, 1500, 2500, 4000, 6000, 10000],
  12: [100, 150, 250, 400, 500, 800, 1000, 2000, 3000, 4000, 7000, 10000],
  13: [100, 150, 200, 300, 500, 700, 1000, 1500, 2000, 3000, 5000, 7000, 10000],
  14: [100, 150, 200, 300, 400, 600, 800, 1000, 1500, 2500, 3000, 5000, 7000, 10000],
  15: [100, 150, 200, 250, 400, 500, 700, 1000, 1500, 2000, 2500, 4000, 5000, 7000, 10000],
};

/** Типові неспалимі для рівнів: перший ≥ 1000 і перший ≥ 5000, без верхньої сходинки й повторів. */
export function ladderPresetSafe(levels: readonly number[]): number[] {
  const top = levels.length - 1;
  const safe = new Set<number>();
  for (const floor of [1000, 5000]) {
    const at = levels.findIndex((l) => l >= floor);
    if (at >= 0 && at < top) safe.add(at);
  }
  return [...safe];
}

/** Чим скінчилася драбина: забрав, помилився, дійшов до верху, зупинено (ведучий чи вилучення). */
export type LadderOutcomeKind = 'took' | 'wrong' | 'top' | 'stopped';

/** Виграш: took/top/stopped — рівень останньої пройденої (0 без пройдених); wrong — найвищий неспалимий серед пройдених (0 без нього). */
export function ladderPrize(levels: readonly number[], safe: readonly number[], passed: number, kind: LadderOutcomeKind): number {
  if (kind !== 'wrong') return passed > 0 ? (levels[passed - 1] ?? 0) : 0;
  const reached = safe.filter((s) => s < passed);
  return reached.length > 0 ? (levels[Math.max(...reached)] ?? 0) : 0;
}

/** Бали залу за правильну відповідь: 10 % рівня, заокруглено. */
export function hallPoints(level: number): number {
  return Math.round(level / 10);
}

/** Підсумок драбини для зрізів і історії. */
export interface LadderOutcomeInfo {
  kind: LadderOutcomeKind;
  /** Скільки сходинок пройдено. */
  passed: number;
  /** Виграш учасника. */
  points: number;
}
