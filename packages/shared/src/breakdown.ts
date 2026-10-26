import type { AdjustmentSource } from './game';
import type { Round } from './quiz';

/** Джерела балів у порядку розбивки (11f). */
export const SCORE_SOURCES = ['answers', 'final', 'duel', 'debuff', 'host', 'wipeout', 'survival', 'ladder'] as const;
export type ScoreSource = (typeof SCORE_SOURCES)[number];

/** Один рядок балів (11f): відповідь, спроба бліцу, штраф чи коригування. */
export interface ScoreLine {
  roundIndex: number;
  source: ScoreSource;
  points: number;
}

/** Плюси й мінуси одного джерела: plus ≥ 0 — сума додатних рядків, minus ≤ 0 — сума від'ємних. */
export interface ScorePart {
  source: ScoreSource;
  plus: number;
  minus: number;
}

/** Розбивка рахунку (11f): лише ненульові джерела в порядку SCORE_SOURCES; plus + minus — рахунок з цих рядків. */
export interface ScoreBreakdown {
  parts: ScorePart[];
  plus: number;
  minus: number;
}

/** Джерело рядка відповіді за типом раунду: фінал — 'final', «Ва-банк» — 'wipeout', решта й невідомий — 'answers'. */
export function answerSource(type: Round['type'] | undefined): ScoreSource {
  if (type === 'final') return 'final';
  if (type === 'wipeout') return 'wipeout';
  return 'answers';
}

const ADJUSTMENT_SOURCES: Record<AdjustmentSource, ScoreSource> = {
  host: 'host',
  duel: 'duel',
  debuff: 'debuff',
  survival: 'survival',
  ladder: 'ladder',
};

/** Джерело коригування; Record<AdjustmentSource, ScoreSource> — нове джерело без запису не пройде typecheck. */
export function adjustmentSource(source: AdjustmentSource): ScoreSource {
  return ADJUSTMENT_SOURCES[source];
}

/** Суми рядків за раундами 0…count−1; рядки поза межами не враховано. */
export function roundTotals(lines: readonly ScoreLine[], count: number): number[] {
  const totals = Array.from({ length: Math.max(0, count) }, () => 0);
  for (const line of lines) {
    if (line.roundIndex >= 0 && line.roundIndex < totals.length) totals[line.roundIndex] += line.points;
  }
  return totals;
}

export function breakdownOf(lines: readonly ScoreLine[]): ScoreBreakdown {
  const parts: ScorePart[] = [];
  let plus = 0;
  let minus = 0;
  for (const source of SCORE_SOURCES) {
    let partPlus = 0;
    let partMinus = 0;
    for (const line of lines) {
      if (line.source !== source) continue;
      if (line.points > 0) partPlus += line.points;
      else if (line.points < 0) partMinus += line.points;
    }
    if (partPlus === 0 && partMinus === 0) continue;
    parts.push({ source, plus: partPlus, minus: partMinus });
    plus += partPlus;
    minus += partMinus;
  }
  return { parts, plus, minus };
}
