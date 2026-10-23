/** Гравець у розподілі банку фіналу. */
export interface BankEntry {
  playerId: string;
  wager: number;
  correct: boolean;
}

export interface BankOutcome {
  /** Сума ставок програвших. */
  bank: number;
  /** bank > 0, а переможців зі ставкою > 0 немає: ставки повертаються, усі отримують 0. */
  refund: boolean;
  /** Бали фіналу кожного гравця з entries. */
  points: Record<string, number>;
}

/**
 * Ділить банк між переможцями пропорційно ставкам; entries — у порядку приєднання (для рівних найбільших ставок).
 * Програвший віддає ставку в банк; частка переможця — вниз до цілого, залишок — найбільшій ставці.
 */
export function splitBank(entries: BankEntry[]): BankOutcome {
  const bank = entries.filter((e) => !e.correct).reduce((sum, e) => sum + e.wager, 0);
  const holders = entries.filter((e) => e.correct && e.wager > 0);
  const zeros = (): Record<string, number> => Object.fromEntries(entries.map((e) => [e.playerId, 0]));
  if (bank === 0) return { bank, refund: false, points: zeros() };
  if (holders.length === 0) return { bank, refund: true, points: zeros() };

  const stakes = holders.reduce((sum, e) => sum + e.wager, 0);
  const points = zeros();
  for (const e of entries) if (!e.correct) points[e.playerId] = 0 - e.wager;
  let given = 0;
  for (const e of holders) {
    const share = Math.floor((bank * e.wager) / stakes);
    points[e.playerId] = share;
    given += share;
  }
  // Перший з рівних найбільших лишається: порівняння строго «більше».
  const biggest = holders.reduce((best, e) => (e.wager > best.wager ? e : best));
  points[biggest.playerId] += bank - given;
  return { bank, refund: false, points };
}
