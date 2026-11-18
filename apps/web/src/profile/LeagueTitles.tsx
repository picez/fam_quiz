import type { LeagueTitle } from '@quiz/shared';
import { monthText } from '../format';
import { t } from '../i18n';

const MARK = '\u0001';

/** Титули ліги під шапкою профілю: лише назва групи й місяць; порожній список — нічого. Назва групи — окремим span з dir="auto". */
export function LeagueTitles({ titles }: { titles: LeagueTitle[] }) {
  if (titles.length === 0) return null;
  return (
    <section className="profile-section league-titles-card">
      <h2>{t('leagueTitlesHeading')}</h2>
      <ul className="league-titles">
        {titles.map((title) => {
          const [before, after = ''] = t('leagueChampionTitle', { group: MARK, month: monthText(title.month) }).split(MARK);
          return (
            <li key={`${title.month}:${title.group}`}>
              {before}
              <span dir="auto">{title.group}</span>
              {after}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
