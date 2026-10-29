import { Link } from 'react-router-dom';
import { PROFILE_BADGES, type Achievement } from '@quiz/shared';
import { ACHIEVEMENT_ICONS } from '../achievement-meta';
import { recentBadges } from '../achievements';
import { t, type TextKey } from '../i18n';

/** Останні PROFILE_BADGES отриманих значків і посилання на сторінку ачівок (to). */
export function AchievementStrip({ achievements, to }: { achievements: Achievement[]; to: string }) {
  const earned = recentBadges(achievements);
  const shown = earned.slice(0, PROFILE_BADGES);
  const rest = earned.length - shown.length;
  return (
    <>
      {shown.length === 0 ? (
        <p className="meta">{t('achievementsNone')}</p>
      ) : (
        <ul className="achievements achievement-strip">
          {shown.map(({ id }) => {
            const name = t(`achievement_${id}` as TextKey);
            return (
              <li key={id} title={name}>
                <span aria-hidden="true">{ACHIEVEMENT_ICONS[id]}</span>
                <span className="sr-only">{name}</span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="achievement-strip-more">
        <Link to={to}>{rest > 0 ? t('achievementsMore', { count: rest }) : t('achievementsAll')}</Link>
      </p>
    </>
  );
}
