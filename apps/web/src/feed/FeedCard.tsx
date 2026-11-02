import type { FeedEvent } from '@quiz/shared';
import { Link } from 'react-router-dom';
import { formatDate } from '../format';
import { t } from '../i18n';
import { Avatar } from '../profile/Avatar';
import { Nick } from '../screens/Nick';
import { feedIcon, feedText } from './feed-text';

export function FeedCard({ event, onLike, pending = false }: { event: FeedEvent; onLike: (event: FeedEvent, liked: boolean) => void; pending?: boolean }) {
  const { data, likes, who } = event;
  // Для like `mine` завжди true, а who — той, хто вподобав: це не власна подія.
  const own = event.mine && data.kind !== 'like';
  const win = data.kind === 'game' && data.place === 1;
  return (
    <li className={win ? 'feed-card is-win' : 'feed-card'}>
      {own ? (
        <Avatar profile={who} size="small" />
      ) : (
        <Link to={`/profile/${who.id}`} className="feed-who">
          <Avatar profile={who} size="small" />
        </Link>
      )}
      <div className="feed-body">
        <p className="feed-text">
          <span aria-hidden="true">{feedIcon(data)} </span>
          {own ? (
            <strong>{t('feedYou')}</strong>
          ) : (
            <Link to={`/profile/${who.id}`}>
              <strong>
                <Nick nickname={who.nickname} />
              </strong>
            </Link>
          )}{' '}
          {feedText(data)}
        </p>
        <p className="meta feed-time">{formatDate(event.at)}</p>
      </div>
      {likes !== null &&
        (own ? (
          likes.count > 0 && <span className="feed-like-count">❤️ {likes.count}</span>
        ) : (
          <button
            type="button"
            className="feed-like"
            aria-pressed={likes.liked}
            aria-label={likes.liked ? t('feedLikeOff') : t('feedLikeOn')}
            disabled={pending}
            onClick={() => onLike(event, !likes.liked)}
          >
            <span aria-hidden="true">{likes.liked ? '❤️' : '🤍'}</span>
            {likes.count > 0 && <span>{likes.count}</span>}
          </button>
        ))}
    </li>
  );
}
