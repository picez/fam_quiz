import { useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getMyFriends } from '../api';
import { t } from '../i18n';
import { AddFriend } from '../profile/AddFriend';
import { FriendList } from '../profile/FriendList';
import { loginFor, ProfileSubpage } from '../profile/ProfileSubpage';
import { usePrivateData } from '../usePrivateData';

/** Підсторінка «Друзі» (/profile/friends і аліас /friends): список друзів і додавання за нікнеймом. */
export function Friends() {
  const location = useLocation();
  const [version, setVersion] = useState(0);
  const fresh = usePrivateData(getMyFriends, String(version));
  // Після додавання лишаємо попередній список, поки вантажиться новий: сторінка не блимає.
  const last = useRef<typeof fresh | null>(null);
  if (fresh.status === 'ready') last.current = fresh;
  const state = fresh.status === 'loading' && last.current !== null ? last.current : fresh;

  if (state.status === 'signed-out') return <Navigate to={loginFor(location.pathname + location.search)} replace />;
  return (
    <ProfileSubpage title={t('profileTileFriends')}>
      {state.status === 'error' && (
        <p className="error" role="alert">
          {state.message}
        </p>
      )}
      {state.status === 'loading' && <p className="meta">{t('loading')}</p>}
      {state.status === 'ready' && (
        <section className="profile-section">
          <FriendList friends={state.data} />
          <AddFriend onAdded={() => setVersion((value) => value + 1)} />
        </section>
      )}
    </ProfileSubpage>
  );
}
