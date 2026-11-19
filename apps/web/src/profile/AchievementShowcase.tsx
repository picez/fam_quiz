import { useState, type JSX } from 'react';
import { Link } from 'react-router-dom';
import { ACHIEVEMENTS, shelfAchievements, type Achievement, type AchievementId, type AchievementShares } from '@quiz/shared';
import { ACHIEVEMENT_ICONS } from '../achievement-meta';
import { t, type TextKey } from '../i18n';
import { shareOf, useAchievementShares } from '../achievement-shares';
import { AkatsukiCloud } from '../motifs/Motifs';

const nameOf = (id: AchievementId) => t(`achievement_${id}` as TextKey);

/** «Назва · є в 4 % гравців · рідкісне»: без часток — лише назва. */
function captionOf(id: AchievementId, shares: AchievementShares | null): string {
  if (shares === null) return nameOf(id);
  const { percent, tier } = shareOf(shares, id);
  const share = percent === 0 ? t('achievementShareNone') : t('achievementShare', { percent });
  const parts = [nameOf(id), share.charAt(0).toLocaleLowerCase() + share.slice(1)];
  if (tier !== null) parts.push(t(tier === 'very_rare' ? 'achievementVeryRare' : 'achievementRare'));
  return parts.join(' · ');
}

/**
 * Ачівки профілю: до 5 квадратиків (закріплені або найновіші отримані). Наведення — title; дотик чи фокус пише назву
 * в підпис під рядом (aria-live). allTo — «усі ›» на сторінку ачівок.
 */
export function AchievementShowcase({ achievements, pinned, allTo }: { achievements: Achievement[]; pinned: AchievementId[]; allTo: string }): JSX.Element {
  const [selected, setSelected] = useState<AchievementId | null>(null);
  // Частки — окремим запитом: підпис і обвідка рідкісних з'являються, коли вони прийдуть.
  const shares = useAchievementShares();
  const shown = shelfAchievements(achievements, pinned);
  const earned = achievements.filter((achievement) => achievement.earned).length;
  const caption = selected !== null && shown.some((achievement) => achievement.id === selected) ? captionOf(selected, shares) : '';
  return (
    <section className="profile-section achievement-showcase">
      <div className="profile-section-head">
        <h2>
          <span aria-hidden="true">🏅</span> {t('achievementShelfTitle', { earned, total: ACHIEVEMENTS.length })}
        </h2>
        <Link to={allTo}>
          {t('profileSeeAll')}{' '}
          <span className="flip-rtl" aria-hidden="true">
            ›
          </span>
        </Link>
      </div>
      {shown.length === 0 ? (
        <div className="showcase-empty">
          <AkatsukiCloud />
          <p className="meta">{t('achievementsNone')}</p>
        </div>
      ) : (
        <>
          <ul className="achievement-squares">
            {shown.map(({ id }) => {
              const name = nameOf(id);
              const tier = shares === null ? null : shareOf(shares, id).tier;
              const rarity = tier === null ? '' : tier === 'very_rare' ? ' is-very-rare' : ' is-rare';
              return (
                <li key={id}>
                  <button
                    type="button"
                    className={`achievement-square${selected === id ? ' is-selected' : ''}${rarity}`}
                    title={name}
                    aria-label={name}
                    onClick={() => setSelected(id)}
                    onFocus={() => setSelected(id)}
                  >
                    <span aria-hidden="true">{ACHIEVEMENT_ICONS[id]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="achievement-caption" aria-live="polite">
            {caption}
          </p>
        </>
      )}
    </section>
  );
}
