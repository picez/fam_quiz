import type { JSX } from 'react';
import { formatDate } from '../../format';
import { t } from '../../i18n';
import { SubpageData } from '../../profile/ProfileSubpage';
import { StatsView } from '../../profile/StatsView';
import { useMyProfile } from '../../profile/useMyProfile';

/** /profile/stats: числа, п'єдестал і список перемог. */
export function ProfileStats(): JSX.Element {
  const { state } = useMyProfile();
  return (
    <SubpageData state={state} title={t('profileTileStats')}>
      {(profile) => (
        <>
          <section className="profile-section">
            <StatsView stats={profile.stats} />
          </section>
          <section className="profile-section">
            <h2>{t('winsTitle')}</h2>
            {profile.wins.length === 0 ? (
              <p className="meta">{t('noWinsYet')}</p>
            ) : (
              <ul className="profile-list">
                {profile.wins.map((win) => (
                  <li key={win.gameId}>{`${formatDate(win.startedAt)} — «${win.title}», ${t('place', { rank: win.rank })}`}</li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </SubpageData>
  );
}
