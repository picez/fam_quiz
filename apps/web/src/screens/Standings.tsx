import type { NickLevel, Standing, TeamsView } from '@quiz/shared';
import { num, signed } from '../format';
import { t } from '../i18n';
import { RowReaction } from '../live/Reactions';
import { Nick } from './Nick';

interface Props {
  standings: Standing[];
  highlightId?: string;
  limit?: number;
  /** Серії за id учасника; від двох підряд показується 🔥. */
  streaks?: Record<string, number>;
  /** Серія бліц-раунду за id учасника (число зі знаком): «Серія +2» / «Серія −3». */
  series?: Record<string, number>;
  /** Командна гра: під назвою команди — її люди, ліворуч — колір команди. */
  teams?: TeamsView | null;
  /** Приріст раунду за id учасника (11f): «+300 за раунд» перед рахунком. */
  gains?: Record<string, number>;
  /** Скільки рядків не поміщається на сцені (11i): останній рядок «…і ще N». */
  more?: number;
  /** Титули за ніком (14a); у командній таблиці не ставляться. */
  titles?: Record<string, string>;
  /** Рівні й вбрання за ніком (15a); у командній таблиці не ставляться. */
  levels?: Record<string, NickLevel>;
}

export function Standings({ standings, highlightId, limit, streaks, series, teams, gains, more, titles, levels }: Props) {
  const shown = limit === undefined ? standings : standings.slice(0, limit);
  return (
    <ol className="standings">
      {shown.map((row) => {
        const streak = streaks?.[row.participantId] ?? 0;
        const seriesNow = series?.[row.participantId] ?? 0;
        // Приріст раунду (gains) або, між запитаннями, бали за щойно закрите запитання (беклог 13).
        const roundGain = gains?.[row.participantId];
        const gain = roundGain ?? row.question;
        const team = teams?.teams.find((entry) => entry.id === row.participantId) ?? null;
        const classes = [row.participantId === highlightId ? 'is-me' : '', team === null ? '' : `has-team team-${team.color}`].filter(Boolean).join(' ');
        return (
          <li key={row.participantId} className={classes || undefined}>
            <span className="rank">{row.rank}</span>
            <span className="name" dir="auto">
              {team === null ? <Nick nickname={row.nickname} levels={levels} titles={titles} /> : row.nickname}
              <RowReaction rowId={row.participantId} />
              {team !== null && team.members.length > 0 && <span className="standing-members">{team.members.map((member) => member.nickname).join(', ')}</span>}
            </span>
            {streak >= 2 && <span className="streak">{t('streakMark', { count: streak })}</span>}
            {seriesNow !== 0 && <span className={seriesNow < 0 ? 'series is-minus' : 'series'}>{t('seriesMark', { count: signed(seriesNow) })}</span>}
            {gain !== undefined && <span className={gain < 0 ? 'round-gain is-minus' : 'round-gain'}>{t(roundGain !== undefined ? 'roundGain' : 'questionGain', { points: signed(gain) })}</span>}
            <span className="score" dir="ltr">{num(row.score)}</span>
          </li>
        );
      })}
      {more !== undefined && more > 0 && <li className="standings-more">{t('standingsMore', { count: more })}</li>}
    </ol>
  );
}
