import type { PodiumStats as PodiumNumbers, ProfileStats } from '@quiz/shared';
import { num } from '../format';
import { countText, t } from '../i18n';

/** Шість чисел п'єдесталу (11f): 1-е, 2-е, 3-є місце, «у трійці», найкращий рахунок, середнє місце; null — «–». */
export function PodiumStats({ stats }: { stats: PodiumNumbers }) {
  const { podium, top3, bestScore, avgPlace } = stats;
  const rows: [value: string, label: string][] = [
    [String(podium.first), t('statFirst')],
    [String(podium.second), t('statSecond')],
    [String(podium.third), t('statThird')],
    [top3 === null ? '–' : `${top3}%`, t('statTop3')],
    [bestScore === null ? '–' : num(bestScore), t('statBestScore')],
    [avgPlace === null ? '–' : String(avgPlace).replace('.', ','), t('statAvgPlace')],
  ];
  return (
    <dl className="stats podium-stats" aria-label={t('statPodiumLabel')}>
      {rows.map(([value, label]) => (
        <div className="stat" key={label}>
          <dd>{value}</dd>
          <dt>{label}</dt>
        </div>
      ))}
    </dl>
  );
}

/** П'ять чисел профілю й під ними п'єдестал. */
export function StatsView({ stats }: { stats: ProfileStats }) {
  const rows: [value: string, label: string][] = [
    [String(stats.games), countText('statGames', stats.games)],
    [String(stats.wins), countText('statWins', stats.wins)],
    [stats.accuracy === null ? '–' : `${stats.accuracy}%`, t('statAccuracy')],
    [String(stats.quizzes), countText('statQuizzes', stats.quizzes)],
    [String(stats.hosted), countText('statHosted', stats.hosted)],
  ];
  return (
    <>
      <dl className="stats">
        {rows.map(([value, label]) => (
          <div className="stat" key={label}>
            <dd>{value}</dd>
            <dt>{label}</dt>
          </div>
        ))}
      </dl>
      <PodiumStats stats={stats} />
    </>
  );
}
