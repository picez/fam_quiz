import { useEffect, useState } from 'react';
import type { GroupCard } from '@quiz/shared';
import { getGroups } from '../api';
import { Link, Navigate } from 'react-router-dom';
import { leagueSpotText } from '../groups/league-spot';
import { t } from '../i18n';
import { AchievementShowcase } from '../profile/AchievementShowcase';
import { InviteList } from '../profile/InviteList';
import { PopularQuizzes } from '../profile/PopularQuizzes';
import { LeagueTitles } from '../profile/LeagueTitles';
import { ProfileHeader } from '../profile/ProfileHeader';
import { ProfileTiles } from '../profile/ProfileTiles';
import { ShowcaseShelf } from '../profile/ShowcaseShelf';
import { useMyProfile } from '../profile/useMyProfile';
import { useAccount } from '../useAccount';
import { useGroupInvites } from '../useGroupInvites';
import { announceInvitesChanged, useInvites } from '../useInvites';
import { usePrivateData } from '../usePrivateData';
import { Loading, LoadError } from '../ui/PageState';

/** Мої групи (12k): число — для плитки «Групи», ліга місяця (79) — рядками в блоці «Люди». */
async function myGroups() {
  const result = await getGroups();
  return result.ok ? { ok: true as const, data: result.groups } : result;
}

/** 79: рядки ліги під плитками «Людей» — лише групи, де цього місяця вже є бали; посилання на вкладку «Ліга». */
function LeagueLines({ shown }: { shown: GroupCard[] }) {
  return (
    <ul className="profile-league">
      {shown.map((group) => (
        <li key={group.id}>
          <Link to={`/profile/groups/${encodeURIComponent(group.id)}?tab=league`} dir="auto">
            {`🏆 ${group.emoji} ${group.name} — ${leagueSpotText(group.league!)}`}
          </Link>
        </li>
      ))}
    </ul>
  );
}

const LOGIN = '/login?next=%2Fprofile';

/** Головна власного профілю: шапка, запрошення, плитки розділів, вітрини й найпопулярніші вікторини; решта — на підсторінках. */
export function Profile() {
  const account = useAccount();
  const invites = useInvites(account.status === 'signed-in');
  const groupInvites = useGroupInvites(account.status === 'signed-in');
  const groups = usePrivateData(myGroups);
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
        <LoadError message={state.message} onRetry={state.retry} />
      </main>
    );
  }
  if (state.status === 'loading') {
    return (
      <main className="app wide">
        <Loading />
      </main>
    );
  }

  const profile = state.data;
  const leagueGroups = groups.status === 'ready' ? groups.data.filter((group) => group.league !== undefined && group.hidden === undefined) : [];
  return (
    <main className="app wide profile-main">
      <div className="profile-col">
        <ProfileHeader
          profile={profile}
          level={profile.level.progress.level}
          looks={profile.level.looks}
          title={profile.showcase.title?.text ?? null}
          stats={profile.stats}
          progress={profile.level.progress}
          form={profile.form}
          editTo="/profile/settings?edit=1"
        />
        <LeagueTitles titles={profile.leagueTitles} />
        <InviteList
          invites={invites.filter((invite) => !gone.includes(invite.code))}
          onDismissed={(code) => {
            setGone((codes) => [...codes, code]);
            announceInvitesChanged();
          }}
        />
        <ProfileTiles
          counts={{
            prizes: profile.showcase.awards.length,
            achievements: profile.achievements.filter((achievement) => achievement.earned).length,
          }}
          groups={{ count: groups.status === 'ready' ? groups.data.length : null, invites: groupInvites.length }}
          people={leagueGroups.length > 0 ? <LeagueLines shown={leagueGroups} /> : null}
        />
      </div>
      <div className="profile-col">
        <ShowcaseShelf awards={profile.showcase.awards} pinned={profile.showcase.pins.prizes} allTo="/profile/prizes" />
        <AchievementShowcase achievements={profile.achievements} pinned={profile.showcase.pins.achievements} allTo="/profile/achievements" />
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
