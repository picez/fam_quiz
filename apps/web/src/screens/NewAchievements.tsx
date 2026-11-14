import type { CSSProperties, JSX } from 'react';
import { isAnti, type NewAchievementsMine } from '@quiz/shared';
import { ACHIEVEMENT_ICONS } from '../achievement-meta';
import { t, type TextKey } from '../i18n';
import { loginFor } from '../profile/ProfileSubpage';

const ALL = '/profile/achievements';

/** «Нове досягнення!» (12j): гість — «Увійди, щоб збирати досягнення» з посиланням; акаунт без нового — нічого. */
export function NewAchievements({ mine }: { mine: NewAchievementsMine | undefined }): JSX.Element | null {
  if (mine === undefined) return null;
  if (!mine.account) {
    return (
      <p className="new-achievements-guest">
        {t('newAchievementsSignIn')} <a href={loginFor(ALL)}>{t('newAchievementsSignInLink')}</a>
      </p>
    );
  }
  if (mine.ids.length === 0) return null;
  return (
    <section className="new-achievements" aria-labelledby="new-achievements-title">
      <h2 id="new-achievements-title">{t(mine.ids.length === 1 ? 'newAchievementsOne' : 'newAchievementsMany')}</h2>
      <ul>
        {mine.ids.map((id, index) => (
          <li key={id} className={isAnti(id) ? 'new-achievement is-anti' : 'new-achievement'} style={{ '--i': index } as CSSProperties}>
            <span className="new-achievement-icon" aria-hidden="true">
              {ACHIEVEMENT_ICONS[id]}
            </span>
            <div className="new-achievement-text">
              <h3>{t(`achievement_${id}` as TextKey)}</h3>
              <p>{t(`achievementJoke_${id}` as TextKey)}</p>
              {isAnti(id) && <p className="new-achievement-anti">{t('newAchievementAnti')}</p>}
            </div>
          </li>
        ))}
      </ul>
      {/* Як MenuLinks: звичайне посилання, повне перезавантаження закриває сокет гри. */}
      <a className="new-achievements-all" href={ALL}>
        {t('newAchievementsAll')}
      </a>
    </section>
  );
}
