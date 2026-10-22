import type { PublicProfile as PublicProfileData } from '@quiz/shared';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { follow, getProfile, unfollow } from '../api';
import { errorText, t } from '../i18n';
import { AchievementList } from '../profile/AchievementList';
import { Avatar } from '../profile/Avatar';
import { StatsView } from '../profile/StatsView';
import { VersusBlock } from '../profile/VersusBlock';
import { useAccount } from '../useAccount';

type State = { status: 'loading' } | { status: 'ready'; profile: PublicProfileData } | { status: 'error'; message: string };

export function PublicProfile() {
  const { id = '' } = useParams();
  const account = useAccount();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [following, setFollowing] = useState<boolean | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    let current = true;
    setState({ status: 'loading' });
    void getProfile(id).then((result) => {
      if (!current) return;
      if (result.ok) {
        setState({ status: 'ready', profile: result.data });
        setFollowing(result.data.following);
      } else {
        setState({ status: 'error', message: result.error === 'not_found' ? t('profileNotFound') : errorText(result.error) });
      }
    });
    return () => {
      current = false;
    };
  }, [id]);

  async function toggle() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const next = following === false;
    setProblem(null);
    const result = await (next ? follow(id) : unfollow(id));
    if (result.ok) setFollowing(next);
    else setProblem(errorText(result.error));
    inFlight.current = false;
    setBusy(false);
  }

  if (state.status === 'loading') {
    return (
      <main className="app wide">
        <p className="meta">{t('loading')}</p>
      </main>
    );
  }
  if (state.status === 'error') {
    return (
      <main className="app wide">
        <p className="error" role="alert">
          {state.message}
        </p>
      </main>
    );
  }

  const { profile } = state;
  const isOwner = account.status === 'signed-in' && account.account.id === profile.id;

  return (
    <main className="app wide">
      <header className="profile-head">
        <Avatar profile={profile} size="large" />
        <div>
          <h1 className="brand">{profile.nickname}</h1>
          <p className="meta">{t('emailHidden')}</p>
          {following === false && (
            <button type="button" className="btn btn-small" disabled={busy} onClick={() => void toggle()}>
              {t('addFriend')}
            </button>
          )}
          {following === true && (
            <p>
              <span>{t('inFriends')}</span>{' '}
              <button type="button" className="btn btn-small" disabled={busy} onClick={() => void toggle()}>
                {t('removeFriend')}
              </button>
            </p>
          )}
          {following === null && isOwner && <Link to="/profile">{t('thisIsYou')}</Link>}
          {following === null && account.status === 'anonymous' && (
            <Link to={`/login?next=${encodeURIComponent(`/profile/${profile.id}`)}`}>{t('signInToFollow')}</Link>
          )}
          {problem !== null && (
            <p className="error" role="alert">
              {problem}
            </p>
          )}
        </div>
      </header>
      <section className="profile-section">
        <h2>{t('statsTitle')}</h2>
        <StatsView stats={profile.stats} />
      </section>
      {account.status === 'signed-in' && !isOwner && (
        <section className="profile-section versus">
          <VersusBlock id={profile.id} nickname={profile.nickname} />
        </section>
      )}
      <section className="profile-section">
        <h2>{t('achievementsTitle')}</h2>
        <AchievementList achievements={profile.achievements} />
      </section>
    </main>
  );
}
