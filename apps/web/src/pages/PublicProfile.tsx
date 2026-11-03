import { shelfAwards, type PublicProfile as PublicProfileData } from '@quiz/shared';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { follow, getProfile, unfollow } from '../api';
import { errorText, t } from '../i18n';
import { AchievementShowcase } from '../profile/AchievementShowcase';
import { LikesCard } from '../profile/LikesCard';
import { ProfileHeader } from '../profile/ProfileHeader';
import { Showcase } from '../profile/Showcase';
import { ShowcaseShelf } from '../profile/ShowcaseShelf';
import { StatsView } from '../profile/StatsView';
import { VersusBlock } from '../profile/VersusBlock';
import { useAccount } from '../useAccount';
import { nickText } from '../nick';

type State = { status: 'loading' } | { status: 'ready'; profile: PublicProfileData } | { status: 'error'; message: string };

export function PublicProfile() {
  const { id = '' } = useParams();
  const account = useAccount();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [following, setFollowing] = useState<boolean | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [allAwards, setAllAwards] = useState(false);
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

  const shelfCount = shelfAwards(profile.showcase.awards, profile.showcase.pins.prizes).length;
  const hasMore = profile.showcase.awards.length > shelfCount;

  return (
    <main className="app wide">
      <ProfileHeader profile={profile} level={profile.level.level} badge={profile.level.looks.badge} title={profile.showcase.title?.text ?? null} stats={profile.stats}>
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
      </ProfileHeader>
      <ShowcaseShelf
        awards={profile.showcase.awards}
        pinned={profile.showcase.pins.prizes}
        onAll={hasMore ? () => setAllAwards((open) => !open) : undefined}
        allLabel={allAwards ? t('publicAwardsHide') : t('publicAwardsAll', { n: profile.showcase.awards.length })}
      />
      {allAwards && <Showcase showcase={profile.showcase} own={isOwner} />}
      <AchievementShowcase achievements={profile.achievements} pinned={profile.showcase.pins.achievements} allTo={`/profile/${encodeURIComponent(profile.id)}/achievements`} />
      <LikesCard likes={profile.likes} />
      <section className="profile-section">
        <h2>{t('statsTitle')}</h2>
        <StatsView stats={profile.stats} />
      </section>
      {account.status === 'signed-in' && !isOwner && <VersusBlock id={profile.id} nickname={nickText(profile.nickname)} />}
    </main>
  );
}
