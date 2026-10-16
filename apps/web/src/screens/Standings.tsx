import type { Standing } from '@quiz/shared';
import { num } from '../format';
import { t } from '../i18n';

interface Props {
  standings: Standing[];
  highlightId?: string;
  limit?: number;
  /** Серії за id учасника; від двох підряд показується 🔥. */
  streaks?: Record<string, number>;
}

export function Standings({ standings, highlightId, limit, streaks }: Props) {
  const shown = limit === undefined ? standings : standings.slice(0, limit);
  return (
    <ol className="standings">
      {shown.map((row) => {
        const streak = streaks?.[row.participantId] ?? 0;
        return (
          <li key={row.participantId} className={row.participantId === highlightId ? 'is-me' : undefined}>
            <span className="rank">{row.rank}</span>
            <span className="name">{row.nickname}</span>
            {streak >= 2 && <span className="streak">{t('streakMark', { count: streak })}</span>}
            <span className="score">{num(row.score)}</span>
          </li>
        );
      })}
    </ol>
  );
}
