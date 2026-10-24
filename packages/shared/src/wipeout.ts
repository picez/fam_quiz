/** Стан гравця в раунді «Ва-банк». */
export type WipeoutStatus = 'in' | 'took' | 'burned' | 'survived';

/** Один крок драбини: ціна запитання, хто відповів правильно, хто після нього забрав банк. */
export interface WipeoutStep {
  price: number;
  correct: readonly string[];
  took: readonly string[];
}

export interface WipeoutStanding {
  status: WipeoutStatus;
  /** in — банк зараз; took / survived — перенесено в бали; burned — 0. */
  bank: number;
  /** Індекс кроку, на якому гравець забрав, згорів чи доніс банк до кінця; null — у грі. */
  step: number | null;
}

/**
 * Драбина «Ва-банк» після кроків steps: хто в грі (вхід — усі playerIds з банком 0), хто згорів, хто забрав.
 * На кроці: у грі й правильно → bank += price; у грі й ні → bank 0, burned; потім, якщо гравець у took цього кроку (і ще в грі) → took.
 * over — раунд скінчився: хто в грі після останнього кроку, стає survived на останньому кроці. Без кроків — усі in з банком 0.
 */
export function wipeoutStandings(playerIds: readonly string[], steps: readonly WipeoutStep[], over: boolean): Record<string, WipeoutStanding> {
  const result: Record<string, WipeoutStanding> = {};
  for (const id of playerIds) {
    let standing: WipeoutStanding = { status: 'in', bank: 0, step: null };
    steps.forEach((step, i) => {
      if (standing.status !== 'in') return;
      standing = step.correct.includes(id)
        ? { status: 'in', bank: standing.bank + step.price, step: null }
        : { status: 'burned', bank: 0, step: i };
      if (standing.status === 'in' && step.took.includes(id)) standing = { status: 'took', bank: standing.bank, step: i };
    });
    if (over && standing.status === 'in' && steps.length > 0) standing = { status: 'survived', bank: standing.bank, step: steps.length - 1 };
    result[id] = standing;
  }
  return result;
}
