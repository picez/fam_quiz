import type { ScoreBreakdown, ScoreSource, Standing } from '@quiz/shared';
import { num, signed } from './format';
import { t } from './i18n';

export interface BreakdownLine {
  /** Ключ React: `${source}:plus` чи `${source}:minus`. */
  key: string;
  label: string;
  /** «+1000» чи «−1000» (signed / num). */
  value: string;
  sign: 'plus' | 'minus';
}

/** Назва джерела; мінус відповідей — «Помилки». */
function sourceLabel(source: ScoreSource, sign: 'plus' | 'minus'): string {
  if (source === 'answers' && sign === 'minus') return t('scorePenalties');
  return t(`scoreSource_${source}`);
}

/** Рядки розбивки в порядку parts: у кожного джерела спершу плюс, потім мінус; мінус відповідей — «Помилки». */
export function breakdownLines(breakdown: ScoreBreakdown): BreakdownLine[] {
  const lines: BreakdownLine[] = [];
  for (const part of breakdown.parts) {
    if (part.plus !== 0) lines.push({ key: `${part.source}:plus`, label: sourceLabel(part.source, 'plus'), value: signed(part.plus), sign: 'plus' });
    if (part.minus !== 0) lines.push({ key: `${part.source}:minus`, label: sourceLabel(part.source, 'minus'), value: num(part.minus), sign: 'minus' });
  }
  return lines;
}

/** Приріст кожного учасника в раунді roundIndex з rounds; без rounds — учасника немає в мапі. */
export function roundGains(standings: Standing[], roundIndex: number): Record<string, number> {
  const gains: Record<string, number> = {};
  for (const row of standings) {
    if (row.rounds !== undefined) gains[row.participantId] = row.rounds[roundIndex] ?? 0;
  }
  return gains;
}

/** Найкращий у раунді (приріст > 0) і найбільший ривок місцями (> 0); за рівного — усі імена в порядку таблиці. */
export function roundHighlights(
  standings: Standing[],
  roundIndex: number,
): { best: { names: string[]; points: number } | null; climb: { names: string[]; places: number } | null } {
  const gains = roundGains(standings, roundIndex);
  const rows = standings.filter((row) => gains[row.participantId] !== undefined);
  let bestPoints = 0;
  for (const row of rows) bestPoints = Math.max(bestPoints, gains[row.participantId]);
  const best = bestPoints > 0 ? { names: rows.filter((row) => gains[row.participantId] === bestPoints).map((row) => row.nickname), points: bestPoints } : null;

  // Місце до раунду: за score − приріст, спільне за рівних балів (1, 1, 3), без часу.
  const before = (row: Standing) => row.score - gains[row.participantId];
  const placeBefore = (row: Standing) => 1 + rows.filter((other) => before(other) > before(row)).length;
  const climbs = rows.map((row) => ({ row, places: placeBefore(row) - row.rank }));
  const bestClimb = climbs.reduce((max, entry) => Math.max(max, entry.places), 0);
  const climb = bestClimb > 0 ? { names: climbs.filter((entry) => entry.places === bestClimb).map((entry) => entry.row.nickname), places: bestClimb } : null;
  return { best, climb };
}
