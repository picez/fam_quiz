import type { WallInfo } from '@quiz/shared';
import { num } from '../format';
import { t } from '../i18n';

/** Скільки рядків сцена показує повністю, коли гравців багато. */
export const STAGE_WALL_ROWS = 14;
/** До скількох рядків сцена лишає звичайний шрифт. */
const COMFORTABLE_ROWS = 8;

/**
 * Таблиця стіни: нікнейм, груп (з позначкою «склав» / «замкнено»), помилок, бали (на reveal).
 * compact (сцена): шрифт за кількістю рядків, зверху STAGE_WALL_ROWS найкращих і «+K ще» замість тихого обрізання.
 */
export function WallTable({ info, compact = false }: { info: WallInfo; compact?: boolean }) {
  const showPoints = info.rows.some((row) => row.points !== null);
  const rows = compact ? info.rows.slice(0, STAGE_WALL_ROWS) : info.rows;
  const more = info.rows.length - rows.length;
  const className = ['wall-table', compact && 'is-compact', compact && info.rows.length > COMFORTABLE_ROWS && 'is-tight'].filter(Boolean).join(' ');
  return (
    <table className={className}>
      <thead>
        <tr>
          <th scope="col">
            <span className="sr-only">{t('wallTablePlayer')}</span>
          </th>
          <th scope="col">{t('wallTableGroups')}</th>
          <th scope="col">{t('wallTableMistakes')}</th>
          {showPoints && <th scope="col">{t('wallTablePoints')}</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.playerId}>
            <th scope="row" className="name">
              {row.nickname}
            </th>
            <td>
              {`${row.found} / ${info.groupCount}`}
              {row.solved && <span className="tag is-correct">{t('wallTableSolved')}</span>}
              {row.locked && <span className="tag is-wrong">{t('wallTableLocked')}</span>}
            </td>
            <td>{row.mistakes}</td>
            {showPoints && <td className="score">{row.points === null ? '' : num(row.points)}</td>}
          </tr>
        ))}
        {more > 0 && (
          <tr className="wall-table-more">
            <td colSpan={showPoints ? 4 : 3}>{t('wallTableMore', { count: more })}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
