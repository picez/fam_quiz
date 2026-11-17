import type { OvershootRow } from '@quiz/shared';
import { num, signed } from '../format';
import { t } from '../i18n';
import { MANY_ROWS } from './ThinkView';

/**
 * «Не перебільш» (37d): рядки відповідей на розкритті в порядку рушія — спершу ті, хто не перебільшив (від найближчого знизу),
 * далі межа «88 (не більше)», під нею ті, хто перебільшив, з позначкою «перебільшили» замість балів.
 */
export function OvershootRows({ rows, correct, mine }: { rows: readonly OvershootRow[]; correct: number; mine?: string }) {
  const under = rows.filter((row) => !row.over);
  const over = rows.filter((row) => row.over);
  const line = (row: OvershootRow) => (
    <li key={row.playerId} className={`overshoot-row${row.over ? ' overshoot-over' : row.points > 0 ? ' is-best' : ''}${row.playerId === mine ? ' is-me' : ''}`}>
      <span className="name" dir="auto">
        {row.nickname}
      </span>
      <span className="overshoot-value" dir="ltr">
        {num(row.value)}
      </span>
      <span className="overshoot-points">{row.over ? t('overshootOver') : signed(row.points)}</span>
    </li>
  );
  return (
    <section className="overshoot">
      <h2 className="meta overshoot-title">{t('overshootRowsTitle')}</h2>
      {/* Понад MANY_ROWS рядків (як у «Думай інакше») сцена ставить їх у кілька колонок дрібніше: 24 рядки вміщуються на 720 px. */}
      <ol className={rows.length > MANY_ROWS ? 'overshoot-rows is-many' : 'overshoot-rows'}>
        {under.map(line)}
        {over.length > 0 && (
          <li className="overshoot-limit" aria-hidden="true">
            {t('overshootCorrect', { correct: num(correct) })}
          </li>
        )}
        {over.map(line)}
      </ol>
    </section>
  );
}
