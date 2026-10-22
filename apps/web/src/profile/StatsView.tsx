import type { ProfileStats } from '@quiz/shared';
import { countText, t } from '../i18n';

/** П'ять чисел профілю. */
export function StatsView({ stats }: { stats: ProfileStats }) {
  const rows: [value: string, label: string][] = [
    [String(stats.games), countText('statGames', stats.games)],
    [String(stats.wins), countText('statWins', stats.wins)],
    [stats.accuracy === null ? '–' : `${stats.accuracy}%`, t('statAccuracy')],
    [String(stats.quizzes), countText('statQuizzes', stats.quizzes)],
    [String(stats.hosted), countText('statHosted', stats.hosted)],
  ];
  return (
    <dl className="stats">
      {rows.map(([value, label]) => (
        <div className="stat" key={label}>
          <dd>{value}</dd>
          <dt>{label}</dt>
        </div>
      ))}
    </dl>
  );
}
