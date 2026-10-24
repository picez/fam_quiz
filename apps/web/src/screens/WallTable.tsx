import type { WallInfo } from '@quiz/shared';
import { num } from '../format';
import { t } from '../i18n';

/** Таблиця стіни: нікнейм, груп (з позначкою «склав» / «замкнено»), помилок, бали (на reveal). */
export function WallTable({ info }: { info: WallInfo }) {
  const showPoints = info.rows.some((row) => row.points !== null);
  return (
    <table className="wall-table">
      <thead>
        <tr>
          <th scope="col" />
          <th scope="col">{t('wallTableGroups')}</th>
          <th scope="col">{t('wallTableMistakes')}</th>
          {showPoints && <th scope="col">{t('wallTablePoints')}</th>}
        </tr>
      </thead>
      <tbody>
        {info.rows.map((row) => (
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
      </tbody>
    </table>
  );
}
