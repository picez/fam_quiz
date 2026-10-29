import type { Achievement } from '@quiz/shared';
import { ACHIEVEMENT_ICONS } from '../achievement-meta';
import { t, type TextKey } from '../i18n';

/** Усі ачівки з текстами; неотримані показано заблокованими. */
export function AchievementList({ achievements }: { achievements: Achievement[] }) {
  return (
    <ul className="achievements">
      {achievements.map(({ id, earned }) => {
        const name = t(`achievement_${id}` as TextKey);
        const hint = t(`achievementHint_${id}` as TextKey);
        return earned ? (
          <li key={id} title={hint}>
            <span aria-hidden="true">{ACHIEVEMENT_ICONS[id]}</span> {name}
          </li>
        ) : (
          <li key={id} className="locked" title={hint} aria-label={t('achievementLocked', { name })}>
            <span aria-hidden="true">🔒</span> {name}
          </li>
        );
      })}
    </ul>
  );
}
