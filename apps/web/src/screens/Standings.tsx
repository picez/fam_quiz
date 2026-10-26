import type { Standing, TeamsView } from '@quiz/shared';
import { num, signed } from '../format';
import { t } from '../i18n';

interface Props {
  standings: Standing[];
  highlightId?: string;
  limit?: number;
  /** Серії за id учасника; від двох підряд показується 🔥. */
  streaks?: Record<string, number>;
  /** Командна гра: під назвою команди — її люди, ліворуч — колір команди. */
  teams?: TeamsView | null;
  /** Приріст раунду за id учасника (11f): «+300 за раунд» перед рахунком. */
  gains?: Record<string, number>;
  /** Скільки рядків не поміщається на сцені (11i): останній рядок «…і ще N». */
  more?: number;
}

export function Standings({ standings, highlightId, limit, streaks, teams, gains, more }: Props) {
  const shown = limit === undefined ? standings : standings.slice(0, limit);
  return (
    <ol className="standings">
      {shown.map((row) => {
        const streak = streaks?.[row.participantId] ?? 0;
        const gain = gains?.[row.participantId];
        const team = teams?.teams.find((entry) => entry.id === row.participantId) ?? null;
        const classes = [row.participantId === highlightId ? 'is-me' : '', team === null ? '' : `has-team team-${team.color}`].filter(Boolean).join(' ');
        return (
          <li key={row.participantId} className={classes || undefined}>
            <span className="rank">{row.rank}</span>
            <span className="name">
              {row.nickname}
              {team !== null && team.members.length > 0 && <span className="standing-members">{team.members.map((member) => member.nickname).join(', ')}</span>}
            </span>
            {streak >= 2 && <span className="streak">{t('streakMark', { count: streak })}</span>}
            {gain !== undefined && <span className={gain < 0 ? 'round-gain is-minus' : 'round-gain'}>{t('roundGain', { points: signed(gain) })}</span>}
            <span className="score">{num(row.score)}</span>
          </li>
        );
      })}
      {more !== undefined && more > 0 && <li className="standings-more">{t('standingsMore', { count: more })}</li>}
    </ol>
  );
}
