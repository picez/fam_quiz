import type { FeedEvent, FeedPage } from '@quiz/shared';
import { useEffect, useRef, useState, type JSX } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { getFeed, likeFeedEvent, markFeedSeen } from '../api';
import { FeedCard } from '../feed/FeedCard';
import { FeedTabs } from '../feed/FeedTabs';
import { errorText, t } from '../i18n';
import { announceFeedSeen, useFeedBadge } from '../useFeedBadge';
import { usePrivateData } from '../usePrivateData';

const LOGIN = '/login?next=%2Ffeed';

/** Стрічка (/feed): події друзів. */
export function Feed(): JSX.Element {
  const { key } = useLocation();
  const [attempt, setAttempt] = useState(0);
  const state = usePrivateData(async () => {
    const result = await getFeed();
    if (!result.ok) return result;
    const { ok: _ok, ...data } = result;
    return { ok: true as const, data: data as FeedPage };
  }, `${key}:${attempt}`);
  if (state.status === 'signed-out') return <Navigate to={LOGIN} replace />;
  if (state.status === 'loading') return <main className="app wide"><p className="meta">{t('loading')}</p></main>;
  if (state.status === 'error')
    return (
      <main className="app wide">
        <p className="error" role="alert">
          {t('feedError')}
        </p>
        <button type="button" className="secondary" onClick={() => setAttempt((n) => n + 1)}>
          {t('prizesRetry')}
        </button>
      </main>
    );
  return <FeedList key={state.data.asOf ?? ''} first={state.data} />;
}

function FeedList({ first }: { first: FeedPage }): JSX.Element {
  const [events, setEvents] = useState<FeedEvent[]>(first.events);
  const [next, setNext] = useState<string | null>(first.next);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const badge = useFeedBadge(true);
  const marked = useRef(false);

  useEffect(() => {
    if (marked.current || first.asOf === undefined) return;
    marked.current = true;
    void markFeedSeen(first.asOf).then((result) => {
      if (result.ok) announceFeedSeen({ events: 0 });
    });
  }, [first.asOf]);

  const more = async () => {
    if (next === null) return;
    setBusy(true);
    setError(null);
    const result = await getFeed(next);
    setBusy(false);
    if (!result.ok) return setError(errorText(result.error));
    setEvents((list) => [...list, ...result.events.filter((e) => !list.some((x) => x.id === e.id))]);
    setNext(result.next);
  };

  const patch = (id: string, likes: FeedEvent['likes']) => setEvents((list) => list.map((e) => (e.id === id ? { ...e, likes } : e)));

  const like = async (event: FeedEvent, liked: boolean) => {
    if (event.likes === null || pending.has(event.id)) return;
    const before = event.likes;
    setError(null);
    setPending((set) => new Set(set).add(event.id));
    patch(event.id, { liked, count: Math.max(0, before.count + (liked ? 1 : -1)) });
    const result = await likeFeedEvent(event.id, liked);
    setPending((set) => {
      const copy = new Set(set);
      copy.delete(event.id);
      return copy;
    });
    if (result.ok) patch(event.id, { liked: result.liked, count: result.likes });
    else {
      patch(event.id, before);
      setError(errorText(result.error));
    }
  };

  return (
    <main className="app wide feed-page">
      <FeedTabs badge={badge} />
      {events.length === 0 ? (
        <p className="meta feed-empty">
          {t('feedEmpty')} <Link to="/friends">{t('feedEmptyLink')}</Link>
        </p>
      ) : (
        <ol className="feed-list">
          {events.map((event) => (
            <FeedCard key={event.id} event={event} onLike={like} pending={pending.has(event.id)} />
          ))}
        </ol>
      )}
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {next !== null && (
        <button type="button" className="secondary" disabled={busy} onClick={more}>
          {t('feedMore')}
        </button>
      )}
    </main>
  );
}
