import type { UndoRound, UndoRow } from '@quiz/shared';
import { signed } from './format';
import { countText, t } from './i18n';

/** «Оля +200», «Петро −100 (штраф)», «Ведучий: Іра +50». */
export function undoRowText(row: UndoRow): string {
  const vars = { name: row.nickname, points: signed(row.points) };
  if (row.kind === 'host') return t('undoHostRow', vars);
  return t(row.points < 0 ? 'undoPenaltyRow' : 'undoRow', vars);
}

/** Скільки різних учасників мають нескасовані рядки серед rows. */
export function activePlayers(rows: readonly UndoRow[]): number {
  return new Set(rows.filter((row) => row.undoneBy === null).map((row) => row.playerId)).size;
}

/** Усі рядки раунду: запитання (у порядку панелі) і бали поза запитаннями. */
export function roundRows(round: UndoRound): UndoRow[] {
  return [...round.questions.flatMap((question) => question.rows), ...round.loose];
}

/** «3 гравців» / «1 гравця» / «2 команд». */
export function undoWho(count: number, teams: boolean): string {
  return countText(teams ? 'undoTeams' : 'undoPlayers', count, { count });
}
