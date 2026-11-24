import type { FeedEvent } from '@quiz/shared';
import { Link } from 'react-router-dom';
import { formatDate } from '../format';
import { t } from '../i18n';
import { Avatar } from '../profile/Avatar';
import { Nick } from '../screens/Nick';
import { feedIcon, feedText } from './feed-text';
import { nickText } from '../nick';

export function FeedCard({ event, onLike, pending = false }: { event: FeedEvent; onLike: (event: FeedEvent, liked: boolean) => void; pending?: boolean }) {
  const { data, likes, who } = event;
  // Для like `mine` завжди true, а who — той, хто вподобав: це не власна подія.
  const own = event.mine && data.kind !== 'like';
  const win = data.kind === 'game' && data.place === 1;
  // 76: текст картки обрізано до двох рядків — повний текст у підказці (екранні читачі й так читають увесь).
  const text = feedText(data);
  const full = `${feedIcon(data)} ${own ? t('feedYou') : nickText(who.nickname)} ${text}`;
  return (
    <li className={win ? 'feed-card is-win' : 'feed-card'} data-id={event.id}>
      {own ? (
        <Avatar profile={who} size="small" />
      ) : (
        <Link to={`/profile/${who.id}`} className="feed-who">
          <Avatar profile={who} size="small" />
        </Link>
      )}
      <div className="feed-body">
        <p className="feed-text" title={full}>
          <span aria-hidden="true">{feedIcon(data)} </span>
          {own ? (
            <strong>{t('feedYou')}</strong>
          ) : (
            <Link to={`/profile/${who.id}`}>
              <strong>
                <Nick nickname={nickText(who.nickname)} />
              </strong>
            </Link>
          )}{' '}
          {text}
        </p>
        {/* 76: дата, позначка модератора й посилання — одним рядком, щоб усі картки були однакової висоти. */}
        <p className="meta feed-meta">
          <span className="feed-time">{formatDate(event.at)}</span>
          {event.hidden && <span className="meta feed-hidden">{t('feedHiddenByModerator')}</span>}
          {data.kind === 'planned' && (
            <Link className="feed-link" to={`/feed/calendar#event-${data.eventId}`}>
              {t('feedPlannedLink')}
            </Link>
          )}
        </p>
      </div>
      {/* 63: подію, приховану модератором, бачить лише автор — без вподобайок. */}
      {likes !== null &&
        !event.hidden &&
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
