import { undoLedger, type AdjustmentNotice, type GameDetail, type UndoNotice, type UndoRound, type UndoRow, type UndoTarget } from '@quiz/shared';
import { signed } from './format';
import { countText, t } from './i18n';

/** «Оля +200», «Петро −100 (штраф)», «Ведучий: Іра +50», «Оля −200 (вихід із гри)». */
export function undoRowText(row: UndoRow): string {
  const vars = { name: row.nickname, points: signed(row.points) };
  if (row.kind === 'host') return t('undoHostRow', vars);
  if (row.kind === 'away') return t('undoAwayRow', vars);
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

/**
 * «Ведучий скасував бали: Петро +100 (раунд 1, запитання 1)», «Ведучий скасував бали 3 гравців (раунд 1)»,
 * «Ведучий повернув бали: Петро −100 (запитання 1)»; rounds ≤ 1 — без «раунд N, ».
 */
export function undoNoticeText(notice: AdjustmentNotice & { undo: UndoNotice }, options: { teams: boolean; rounds: number }): string {
  const { redo, players, round, question } = notice.undo;
  const where =
    question === null
      ? t('undoWhereRound', { round })
      : options.rounds > 1
        ? t('undoWhereRoundQuestion', { round, question })
        : t('undoWhereQuestion', { question });
  if (players > 1) return t(redo ? 'redoNoticeMany' : 'undoNoticeMany', { who: undoWho(players, options.teams), where });
  return t(redo ? 'redoNotice' : 'undoNotice', { name: notice.nickname, points: signed(notice.points), where });
}

/** Рядки «↶» раунду історії в порядку seq: текст і чи цю дію потім повернули. */
export function historyUndoLines(game: Pick<GameDetail, 'adjustments' | 'questions'>, roundIndex: number): { seq: number; text: string; returned: boolean }[] {
  const ledger = undoLedger(game.adjustments.map((a) => ({ seq: a.seq, who: a.nickname, source: a.source, undoes: a.undoes })));
  const bySeq = new Map(game.adjustments.map((a) => [a.seq, a]));
  const where = (target: UndoTarget | undefined): string => {
    if (target === undefined) return '';
    if ('question' in target) {
      const same = game.questions.filter((q) => q.roundIndex === roundIndex);
      const at = same.findIndex((q) => q.index === target.question);
      return at < 0 ? '' : t('historyUndoQuestion', { question: at + 1 });
    }
    // Ціль { seq } — бали ведучого або штраф за вихід із гри (12e).
    return t(bySeq.get(target.seq)?.source === 'away' ? 'historyUndoAway' : 'historyUndoHost');
  };
  return game.adjustments
    .filter((a) => a.source === 'undo' && a.roundIndex === roundIndex)
    .sort((a, b) => a.seq - b.seq)
    .map((a) => {
      const aim = a.undoes !== undefined && 'seq' in a.undoes ? bySeq.get(a.undoes.seq) : undefined;
      // «Повернути» називає те, що повернуто: ціль скасування, яке воно знімає.
      const redo = aim?.source === 'undo';
      const target = redo ? aim.undoes : a.undoes;
      const vars = { name: a.nickname, points: signed(a.points), where: where(target) };
      return { seq: a.seq, text: t(redo ? 'historyRedo' : 'historyUndo', vars), returned: ledger.redone.has(a.seq) };
    });
}
