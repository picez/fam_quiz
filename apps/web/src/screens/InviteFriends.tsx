import { useState } from 'react';
import type { ProfileCard } from '@quiz/shared';
import { getMyFriends, getRoomInvites, inviteFriends } from '../api';
import { errorText, t } from '../i18n';
import { Avatar } from '../profile/Avatar';

/** Панель «Запросити друзів» у лобі: список друзів ведучого й кнопка «Запросити» біля кожного. */
export function InviteFriends({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<ProfileCard[] | null>(null);
  const [invited, setInvited] = useState<string[]>([]);
  const [busy, setBusy] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const show = async () => {
    setOpen(true);
    setError(null);
    const [list, sent] = await Promise.all([getMyFriends(), getRoomInvites(code)]);
    if (list.ok) setFriends(list.data);
    else setError(errorText(list.error));
    if (sent.ok) setInvited(sent.data.invited);
  };

  const invite = async (id: string) => {
    setBusy((ids) => [...ids, id]);
    const result = await inviteFriends(code, [id]);
    setBusy((ids) => ids.filter((other) => other !== id));
    if (result.ok) {
      setInvited(result.data.invited);
      setError(null);
    } else setError(errorText(result.error));
  };

  if (!open) {
    return (
      <div className="invite-toggle">
        <button type="button" className="btn btn-small" onClick={() => void show()}>
          {t('inviteFriends')}
        </button>
      </div>
    );
  }

  return (
    <section className="panel invite-panel">
      <div className="invite-head">
        <h2>{t('inviteFriends')}</h2>
        <button type="button" className="btn btn-small" onClick={() => setOpen(false)}>
          {t('inviteClose')}
        </button>
      </div>
      <p className="meta">{t('inviteHint')}</p>
      {friends !== null && friends.length === 0 && (
        <p className="meta">
          {t('noFriendsToInvite')}{' '}
          <a href="/profile" target="_blank" rel="noreferrer">
            {t('openProfile')}
          </a>
        </p>
      )}
      {friends !== null && friends.length > 0 && (
        <ul className="invite-friends">
          {friends.map((friend) => {
            const done = invited.includes(friend.id);
            return (
              <li key={friend.id}>
                <Avatar profile={friend} size="small" />
                <span className="name">{friend.nickname}</span>
                <button type="button" className="btn btn-small" disabled={done || busy.includes(friend.id)} onClick={() => void invite(friend.id)}>
                  {t(done ? 'invitedOne' : 'inviteOne')}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
