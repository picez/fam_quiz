import type { Achievement, AchievementId } from '@quiz/shared';
import { hasText, t } from '../i18n';

const ICONS: Partial<Record<AchievementId, string>> = {
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

/** Усі ачівки з текстами; неотримані показано заблокованими. */
export function AchievementList({ achievements }: { achievements: Achievement[] }) {
  return (
    <ul className="achievements">
      {achievements.map(({ id, earned }) => {
        // Тимчасово (12i, задача 1): ачівки без назви й умови в i18n ще не показуються.
        const nameKey = `achievement_${id}`;
        const hintKey = `achievementHint_${id}`;
        if (!hasText(nameKey) || !hasText(hintKey)) return null;
        const name = t(nameKey);
        return earned ? (
          <li key={id} title={t(hintKey)}>
            <span aria-hidden="true">{ICONS[id] ?? '🏅'}</span> {name}
          </li>
        ) : (
          <li key={id} className="locked" title={t(hintKey)} aria-label={t('achievementLocked', { name })}>
            <span aria-hidden="true">🔒</span> {name}
          </li>
        );
      })}
    </ul>
  );
}
