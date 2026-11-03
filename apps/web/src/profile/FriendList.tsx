import type { FriendCard } from '@quiz/shared';
import { Link } from 'react-router-dom';
import { seenText } from '../format';
import { t } from '../i18n';
import { nickText } from '../nick';
import { Avatar } from './Avatar';

/** Друзі з аватарками й «онлайн» / «був(-ла) …» (беклог 9); порожній список — «Друзів поки немає». */
export function FriendList({ friends }: { friends: FriendCard[] }) {
  if (friends.length === 0) return <p className="meta">{t('noFriendsYet')}</p>;
  return (
    <ul className="friend-list">
      {friends.map((friend) => {
        const seen = seenText(friend.lastSeenAt);
        return (
          <li key={friend.id}>
            <Link to={`/profile/${friend.id}`}>
              <Avatar profile={friend} size="small" /> {nickText(friend.nickname)}
            </Link>
            {seen !== null && <span className={seen === t('friendOnline') ? 'friend-seen is-online' : 'friend-seen'}>{seen}</span>}
          </li>
        );
      })}
    </ul>
  );
}
