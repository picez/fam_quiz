import { adjustmentSource, answerSource, roundTotals, type ScoreLine, type Standing } from '@quiz/shared';
import { recordOf, type GameState } from './game';

/** Рядок балів рушія (11f): запис чи спроба запитання (questionIndex — індекс у plays) або коригування (questionIndex null). */
export interface PlayerScoreLine extends ScoreLine {
  playerId: string;
  questionIndex: number | null;
}

/** Рядки гравців за станом і вони ж, згруповані за гравцем (щоб зрізи не фільтрували всі рядки на кожен рядок таблиці). */
const cache = new WeakMap<GameState, { lines: PlayerScoreLine[]; byPlayer: Map<string, PlayerScoreLine[]> }>();

/** Рядки балів закритих запитань (як recorder.answerRows) і коригувань (за seq); Σ рядків гравця = його score. Кеш — WeakMap за станом. */
export function scoreLines(state: GameState): PlayerScoreLine[] {
  return cached(state).lines;
}

/** Рядки scoreLines, згруповані за гравцем (кеш той самий). */
export function scoreLinesByPlayer(state: GameState): ReadonlyMap<string, readonly PlayerScoreLine[]> {
  return cached(state).byPlayer;
}

/** Групування рядків за гравцем зі збереженням порядку. */
export function groupByPlayer(lines: readonly PlayerScoreLine[]): Map<string, PlayerScoreLine[]> {
  const byPlayer = new Map<string, PlayerScoreLine[]>();
  for (const line of lines) {
    const own = byPlayer.get(line.playerId);
    if (own === undefined) byPlayer.set(line.playerId, [line]);
    else own.push(line);
  }
  return byPlayer;
}

function cached(state: GameState): { lines: PlayerScoreLine[]; byPlayer: Map<string, PlayerScoreLine[]> } {
  const found = cache.get(state);
  if (found !== undefined) return found;
  const lines: PlayerScoreLine[] = [];
  // Відкрите запитання завжди останнє в журналі й ще не рахується (як у withTotals).
  const closedCount = state.phase === 'question' ? state.plays.length - 1 : state.plays.length;
  for (let index = 0; index < closedCount; index++) {
    const play = state.plays[index];
    const { roundIndex } = play;
    const source = answerSource(state.quiz.rounds[roundIndex]?.type);
    const push = (playerId: string, points: number) => {
      if (points !== 0) lines.push({ playerId, roundIndex, source, points, questionIndex: index });
    };
    for (const player of state.players) {
      const record = recordOf(state, index, player.id);
      if (record === undefined) continue;
      const attempts = play.blitz?.attempts.filter((a) => a.playerId === player.id);
      if (attempts === undefined) {
        push(player.id, record.points);
        continue;
      }
      // Бліц — по рядку на спробу; бонус серії належить виграшній спробі.
      for (const attempt of attempts) push(player.id, attempt.points + (attempt.grade === 'correct' ? record.streakBonus : 0));
      // Штраф бліц-клітинки не належить жодній спробі: окремий рядок, як у recorder.
      push(player.id, record.basePoints - attempts.reduce((sum, attempt) => sum + attempt.points, 0));
    }
  }
  const adjustments = [...state.adjustments].sort((a, b) => a.seq - b.seq);
  for (const adjustment of adjustments) {
    if (adjustment.points === 0) continue;
    lines.push({ playerId: adjustment.playerId, roundIndex: adjustment.roundIndex, source: adjustmentSource(adjustment.source), points: adjustment.points, questionIndex: null });
  }
  const entry = { lines, byPlayer: groupByPlayer(lines) };
  cache.set(state, entry);
  return entry;
}

/** Колонки раундів: у лобі й до першого раунду 0, інакше min(rounds.length, roundIndex + 1). */
export function roundCount(state: GameState): number {
  if (state.phase === 'lobby' || state.phase === 'guide' || state.roundIndex < 0) return 0;
  return Math.min(state.quiz.rounds.length, state.roundIndex + 1);
}

/** Колонки раундів (11f) до рядків таблиці з рядків балів, згрупованих за гравцем. */
export function withRounds(rows: Standing[], byPlayer: ReadonlyMap<string, readonly PlayerScoreLine[]>, count: number): Standing[] {
  return rows.map((row) => ({ ...row, rounds: roundTotals(byPlayer.get(row.participantId) ?? [], count) }));
}

/**
 * Рядки, які бачить глядач: для гравця з hidden(id) ≠ 0 рядки поточного запитання відкидаються, якщо їхня сума = hidden;
 * інакше (частково розкритий фінал) замість них іде один рядок на суму − hidden: бали єдиного рядка зменшуються на hidden,
 * а без рядка (повернення банку, бали 0, а до розподілу видно −ставку) з'являється рядок −hidden; нуль відкидається.
 * Коли нічого не приховано, повертає той самий масив lines.
 */
export function visibleLines(lines: readonly PlayerScoreLine[], state: GameState, hidden: (playerId: string) => number): readonly PlayerScoreLine[] {
  const hiddenOf = new Map<string, number>();
  for (const player of state.players) {
    const h = hidden(player.id);
    if (h !== 0) hiddenOf.set(player.id, h);
  }
  if (hiddenOf.size === 0) return lines;
  const current = (line: PlayerScoreLine) => hiddenOf.has(line.playerId) && line.questionIndex !== null && line.questionIndex === state.questionIndex;
  const sums = new Map<string, number>();
  for (const line of lines) if (current(line)) sums.set(line.playerId, (sums.get(line.playerId) ?? 0) + line.points);
  const shown = (playerId: string) => (sums.get(playerId) ?? 0) - (hiddenOf.get(playerId) ?? 0);
  const placed = new Set<string>();
  const result = lines.flatMap((line) => {
    if (!current(line)) return [line];
    if (placed.has(line.playerId)) return [];
    placed.add(line.playerId);
    const points = shown(line.playerId);
    return points === 0 ? [] : [{ ...line, points }];
  });
  const play = state.plays[state.questionIndex];
  for (const playerId of hiddenOf.keys()) {
    const points = shown(playerId);
    if (placed.has(playerId) || points === 0 || play === undefined) continue;
    const { roundIndex } = play;
    result.push({ playerId, roundIndex, source: answerSource(state.quiz.rounds[roundIndex]?.type), points, questionIndex: state.questionIndex });
  }
  return result;
}
