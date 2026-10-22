import type { Achievement, AchievementId } from '@quiz/shared';
import { t } from '../i18n';

const ICONS: Record<AchievementId, string> = {
  first_game: '🎮',
  first_win: '🏆',
  games_10: '🎯',
  streak_5: '🔥',
  perfect_game: '💎',
  host: '🎤',
  games_50: '🏅',
  wins_10: '👑',
  games_100: '💯',
  host_10: '🎙️',
  streak_10: '⚡',
  win_streak_3: '🥇',
  blitz_win: '⏱️',
  final_hit: '🎲',
  comeback: '🚀',
  friends_5: '🤝',
};

/** Усі ачівки; неотримані показано заблокованими. */
export function AchievementList({ achievements }: { achievements: Achievement[] }) {
  return (
    <ul className="achievements">
      {achievements.map(({ id, earned }) => {
        const name = t(`achievement_${id}`);
        return earned ? (
          <li key={id} title={t(`achievementHint_${id}`)}>
            <span aria-hidden="true">{ICONS[id]}</span> {name}
          </li>
        ) : (
          <li key={id} className="locked" title={t(`achievementHint_${id}`)} aria-label={t('achievementLocked', { name })}>
            <span aria-hidden="true">🔒</span> {name}
          </li>
        );
      })}
    </ul>
  );
}
