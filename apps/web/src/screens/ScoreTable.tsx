import { Fragment, useState, type MouseEvent } from 'react';
import type { ScoreBreakdown, Standing, TeamsView } from '@quiz/shared';
import { num, signed } from '../format';
import { countText, t } from '../i18n';
import { breakdownLines, roundHighlights } from '../score-table';

/** Рядок таблиці 11f: Standing і GameStanding підходять обидва. */
export interface ScoreRow {
  participantId: string;
  nickname: string;
  rank: number | null;
  score: number;
  rounds?: number[];
  /** Історія: склад команди. */
  members?: string[];
}

/** «+ / −» (11f). */
export function BreakdownView({ breakdown }: { breakdown: ScoreBreakdown }) {
  if (breakdown.parts.length === 0) return <p className="meta">{t('scoreEmpty')}</p>;
  return (
    <div className="score-breakdown">
      <p className="score-breakdown-sum">{t('scoreSum', { plus: num(breakdown.plus), minus: num(Math.abs(breakdown.minus)) })}</p>
      <ul>
        {breakdownLines(breakdown).map((line) => (
          <li key={line.key} className={`is-${line.sign}`}>
            <span className="label">{line.label}</span> <span className="value">{line.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Таблиця «#, Учасник, Р1…Рn, Σ» (11f); колонок — найдовший rounds; розбивку відкриває лише рядок, що є в breakdowns. */
export function ScoreTable({
  rows,
  size,
  breakdowns,
  highlightId,
  teams,
  streaks,
  roundTitles,
}: {
  rows: ScoreRow[];
  size: 'phone' | 'host' | 'history';
  breakdowns: Record<string, ScoreBreakdown>;
  highlightId?: string;
  teams?: TeamsView | null;
  streaks?: Record<string, number>;
  /** Назви раундів для заголовків колонок (title й aria-label «Р1, Назва»); немає — лише «Р1…». */
  roundTitles?: string[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const count = rows.reduce((max, row) => Math.max(max, row.rounds?.length ?? 0), 0);
  const columns = Array.from({ length: count }, (_, i) => i);
  return (
    <div className={`score-table-wrap is-${size}`} role="region" aria-label={t('scoreTableLabel')} tabIndex={0}>
      <table className="score-table">
        <caption className="sr-only">{t('scoreTableLabel')}</caption>
        <thead>
          <tr>
            <th scope="col" className="rank">
              {t('scoreRank')}
            </th>
            <th scope="col" className="name">
              {t('scoreName')}
            </th>
            {columns.map((i) => (
              <th
                key={i}
                scope="col"
                className="round"
                title={roundTitles?.[i]}
                aria-label={roundTitles?.[i] === undefined ? undefined : `${t('scoreRound', { n: i + 1 })}, ${roundTitles[i]}`}
              >
                {t('scoreRound', { n: i + 1 })}
              </th>
            ))}
            <th scope="col" className="total">
              {t('scoreTotal')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const streak = streaks?.[row.participantId] ?? 0;
            const team = teams?.teams.find((entry) => entry.id === row.participantId) ?? null;
            const members = team !== null ? team.members.map((member) => member.nickname) : (row.members ?? []);
            const breakdown = breakdowns[row.participantId];
            const open = breakdown !== undefined && openId === row.participantId;
            const classes = [
              'score-row',
              row.participantId === highlightId ? 'is-me' : '',
              breakdown === undefined ? '' : 'has-breakdown',
              open ? 'is-open' : '',
              team === null ? '' : `has-team team-${team.color}`,
            ]
              .filter(Boolean)
              .join(' ');
            // Увесь рядок з розбивкою — ціль дотику (кнопка в імені лишається для клавіатури й читачів екрана);
            // дотик не доходить до аркуша «Таблиця», тож той не закривається.
            const toggle =
              breakdown === undefined
                ? undefined
                : (event: MouseEvent) => {
                    event.stopPropagation();
                    setOpenId(open ? null : row.participantId);
                  };
            return (
              <Fragment key={row.participantId}>
                <tr className={classes} onClick={toggle}>
                  <td className="rank">{row.rank ?? '–'}</td>
                  <th scope="row" className="name">
                    {breakdown === undefined ? (
                      row.nickname
                    ) : (
                      <button type="button" className="score-row-toggle" aria-expanded={open} aria-label={t('scoreOpen', { name: row.nickname })}>
                        {row.nickname}
                      </button>
                    )}
                    {members.length > 0 && <span className="standing-members">{members.join(', ')}</span>}
                    {streak >= 2 && <span className="streak">{t('streakMark', { count: streak })}</span>}
                  </th>
                  {columns.map((i) => (
                    <td key={i} className="round">
                      {row.rounds !== undefined && row.rounds[i] !== undefined ? num(row.rounds[i]) : '–'}
                    </td>
                  ))}
                  <td className="total">{num(row.score)}</td>
                </tr>
                {open && (
                  <tr className="score-breakdown-row" onClick={(event) => event.stopPropagation()}>
                    <td colSpan={count + 3}>
                      <BreakdownView breakdown={breakdown} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Під таблицею підсумків раунду (11f): «Найкращий у раунді» й «Найбільший ривок»; null, якщо обох немає. */
export function RoundHighlights({ standings, roundIndex }: { standings: Standing[]; roundIndex: number }) {
  const { best, climb } = roundHighlights(standings, roundIndex);
  if (best === null && climb === null) return null;
  return (
    <div className="round-highlights">
      {best !== null && <p className="round-best">{t(best.names.length === 1 ? 'roundBest_one' : 'roundBest_other', { names: best.names.join(', '), points: signed(best.points) })}</p>}
      {climb !== null && <p className="round-climb">{countText('roundClimb', climb.places, { names: climb.names.join(', '), count: climb.places })}</p>}
    </div>
  );
}
