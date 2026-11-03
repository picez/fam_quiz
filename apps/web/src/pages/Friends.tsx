import { useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { getMyFriends } from '../api';
import { t } from '../i18n';
import { AddFriend } from '../profile/AddFriend';
import { FriendList } from '../profile/FriendList';
import { usePrivateData } from '../usePrivateData';

const LOGIN = '/login?next=%2Ffriends';

/** Сторінка «Друзі» (пункт меню): список друзів і додавання за нікнеймом; раніше це був розділ власного профілю. */
export function Friends() {
  const [version, setVersion] = useState(0);
  const fresh = usePrivateData(getMyFriends, String(version));
  // Після додавання лишаємо попередній список, поки вантажиться новий: сторінка не блимає.
  const last = useRef<typeof fresh | null>(null);
  if (fresh.status === 'ready') last.current = fresh;
  const state = fresh.status === 'loading' && last.current !== null ? last.current : fresh;

  if (state.status === 'signed-out') return <Navigate to={LOGIN} replace />;
  return (
    <main className="app wide">
      <h1 className="brand">{t('friendsTitle')}</h1>
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
    </main>
  );
}
