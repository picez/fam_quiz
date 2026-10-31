import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { getMyProfile, signOut } from '../api';
import { formatDate, seenText } from '../format';
import { t } from '../i18n';
import { AchievementStrip } from '../profile/AchievementStrip';
import { AddFriend } from '../profile/AddFriend';
import { Avatar } from '../profile/Avatar';
import { ProfileEditor } from '../profile/ProfileEditor';
import { InviteList } from '../profile/InviteList';
import { StatsView } from '../profile/StatsView';
import { useAccount } from '../useAccount';
import { announceInvitesChanged, useInvites } from '../useInvites';
import { usePrivateData } from '../usePrivateData';

const LOGIN = '/login?next=%2Fprofile';

export function Profile() {
  const navigate = useNavigate();
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const account = useAccount();
  const invites = useInvites(account.status === 'signed-in', version);
  const [gone, setGone] = useState<string[]>([]);
  // Код, якого сервер уже не віддає, забуваємо: повторно виданий код має знову з'явитися.
  useEffect(() => {
    setGone((codes) => (codes.some((code) => !invites.some((invite) => invite.code === code)) ? codes.filter((code) => invites.some((invite) => invite.code === code)) : codes));
  }, [invites]);
  const fresh = usePrivateData(getMyProfile, String(version));
  // Під час оновлення лишаємо попередні дані: сторінка не блимає й не губить прокрутку.
  const last = useRef<typeof fresh | null>(null);
  if (fresh.status === 'ready') last.current = fresh;
  const state = fresh.status === 'loading' && last.current !== null ? last.current : fresh;

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
  const reload = () => setVersion((value) => value + 1);
  const leave = async () => {
    if (leaving) return;
    setLeaving(true);
    await signOut();
    navigate('/');
  };

  return (
    <main className="app wide">
      {editing ? (
        <ProfileEditor
          profile={profile}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            reload();
          }}
        />
      ) : (
        <header className="profile-head">
          <Avatar profile={profile} size="large" />
          <div>
            <h1 className="brand">{profile.nickname}</h1>
            <p className="meta">{profile.email}</p>
            <div className="toolbar">
              <button type="button" className="btn btn-small" onClick={() => setEditing(true)}>
                {t('editProfile')}
              </button>
              <Link to={`/profile/${profile.id}`}>{t('publicProfileLink')}</Link>
            </div>
          </div>
        </header>
      )}
      <InviteList
        invites={invites.filter((invite) => !gone.includes(invite.code))}
        onDismissed={(code) => {
          setGone((codes) => [...codes, code]);
          announceInvitesChanged();
        }}
      />
      <section className="profile-section">
        <h2>{t('statsTitle')}</h2>
        <StatsView stats={profile.stats} />
      </section>
      <section className="profile-section">
        <h2>{t('achievementsTitle')}</h2>
        <AchievementStrip achievements={profile.achievements} to="/achievements" />
      </section>
      <section className="profile-section">
        <h2>{t('myQuizzesTitle')}</h2>
        {profile.quizzes.length === 0 ? (
          <p className="meta">{t('noQuizzesYet')}</p>
        ) : (
          <ul className="profile-list">
            {profile.quizzes.map((quiz) => (
              <li key={quiz.id}>
                <Link to={`/quizzes/${quiz.id}`}>{`${quiz.title} →`}</Link>
              </li>
            ))}
          </ul>
        )}
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
      <section className="profile-section">
        <h2>{t('friendsTitle')}</h2>
        {profile.friends.length === 0 ? (
          <p className="meta">{t('noFriendsYet')}</p>
        ) : (
          <ul className="friend-list">
            {profile.friends.map((friend) => (
              <li key={friend.id}>
                <Link to={`/profile/${friend.id}`}>
                  <Avatar profile={friend} size="small" /> {friend.nickname}
                </Link>
                {/* Онлайн чи коли бачили (беклог 9). */}
                {seenText(friend.lastSeenAt) !== null && (
                  <span className={seenText(friend.lastSeenAt) === t('friendOnline') ? 'friend-seen is-online' : 'friend-seen'}>{seenText(friend.lastSeenAt)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <AddFriend onAdded={reload} />
      </section>
      <div className="toolbar">
        <button type="button" className="btn" disabled={leaving} onClick={() => void leave()}>
          {t('signOut')}
        </button>
      </div>
    </main>
  );
}
