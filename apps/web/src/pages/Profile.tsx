import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { t } from '../i18n';
import { InviteList } from '../profile/InviteList';
import { PopularQuizzes } from '../profile/PopularQuizzes';
import { ProfileHeader } from '../profile/ProfileHeader';
import { ProfileTiles } from '../profile/ProfileTiles';
import { useMyProfile } from '../profile/useMyProfile';
import { useAccount } from '../useAccount';
import { announceInvitesChanged, useInvites } from '../useInvites';

const LOGIN = '/login?next=%2Fprofile';

/** Головна власного профілю: шапка, запрошення, плитки розділів, вітрини й найпопулярніші вікторини; решта — на підсторінках. */
export function Profile() {
  const account = useAccount();
  const invites = useInvites(account.status === 'signed-in');
  const [gone, setGone] = useState<string[]>([]);
  // Код, якого сервер уже не віддає, забуваємо: повторно виданий код має знову з'явитися.
  useEffect(() => {
    setGone((codes) => (codes.some((code) => !invites.some((invite) => invite.code === code)) ? codes.filter((code) => invites.some((invite) => invite.code === code)) : codes));
  }, [invites]);
  const { state } = useMyProfile();

  if (state.status === 'signed-out') return <Navigate to={LOGIN} replace />;
  if (state.status === 'error') {
    return (
      <main className="app wide">
        <p className="error" role="alert">
          {state.message}
        </p>
      </main>
    );
  }
  if (state.status === 'loading') {
    return (
      <main className="app wide">
        <p className="meta">{t('loading')}</p>
      </main>
    );
  }

  const profile = state.data;
  return (
    <main className="app wide profile-main">
      <div className="profile-col">
        <ProfileHeader
          profile={profile}
          level={profile.level.progress.level}
          badge={profile.level.looks.badge}
          title={profile.showcase.title?.text ?? null}
          stats={profile.stats}
          progress={profile.level.progress}
          editTo="/profile/settings?edit=1"
        />
        <InviteList
          invites={invites.filter((invite) => !gone.includes(invite.code))}
          onDismissed={(code) => {
            setGone((codes) => [...codes, code]);
            announceInvitesChanged();
          }}
        />
        <ProfileTiles
          counts={{
            quizzes: profile.quizzes.length,
            prizes: profile.showcase.awards.length,
            achievements: profile.achievements.filter((achievement) => achievement.earned).length,
          }}
        />
      </div>
      <div className="profile-col">
        {/* Задача 8: тут стануть вітрини — полиця кубків і закріплені ачівки. */}
        <section className="profile-section profile-popular">
          <div className="profile-section-head">
            <h2>{t('profilePopularTitle')}</h2>
            <Link to="/profile/quizzes">
              {t('profileSeeAll')}{' '}
              <span className="flip-rtl" aria-hidden="true">
                ›
              </span>
            </Link>
          </div>
          <PopularQuizzes quizzes={profile.quizzes} limit={3} />
        </section>
      </div>
    </main>
  );
}
