import { useEffect, useRef, useState, type JSX } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { isAnnouncementUrl, type InboxItem, type InboxPage as InboxData } from '@quiz/shared';
import { getInbox, markInboxRead } from '../api';
import { formatDate } from '../format';
import { t } from '../i18n';
import { usePrivateData } from '../usePrivateData';
import { setInboxUnread } from './useInboxBadge';

const LOGIN = '/login?next=%2Finbox';

function ItemCard({ item }: { item: InboxItem }): JSX.Element {
  return (
    <li className={`inbox-item panel${item.read ? '' : ' is-new'}`}>
      <div className="inbox-head">
        <span className="meta">{item.kind === 'broadcast' ? t('inboxFromAdmin') : t('inboxReplyTitle')}</span>
        {!item.read && <span className="tag inbox-new">{t('inboxNew')}</span>}
        <time className="meta" dateTime={item.at}>
          {formatDate(item.at)}
        </time>
      </div>
      {item.kind === 'broadcast' ? (
        <>
          <h2 className="inbox-title" dir="auto">
            {item.title}
          </h2>
          <p className="inbox-text" dir="auto">
            {item.text}
          </p>
          {item.url !== null && isAnnouncementUrl(item.url) && (
            <p>
              {item.url.startsWith('/') ? (
                <Link to={item.url}>{t('inboxOpenLink')}</Link>
              ) : (
                <a href={item.url} target="_blank" rel="noopener noreferrer">
                  {t('inboxOpenLink')}
                </a>
              )}
            </p>
          )}
        </>
      ) : (
        <>
          <blockquote className="inbox-quote meta" dir="auto">
            {t('inboxYouWrote', { text: item.problem.text })}
          </blockquote>
          <p className="inbox-text" dir="auto">
            {item.reply}
          </p>
          <p>
            <Link to="/report">{t('inboxAllProblems')}</Link>
          </p>
        </>
      )}
    </li>
  );
}

function InboxList({ page }: { page: InboxData }): JSX.Element {
  const marked = useRef(false);
  // Відкриття сторінки позначає прочитаним усе, що не новіше за найновіше показане; позначка «Нове» на цьому показі лишається.
  useEffect(() => {
    const newest = page.items[0];
    if (marked.current || newest === undefined || page.unread === 0) return;
    marked.current = true;
    void markInboxRead(newest.at).then((result) => {
      if (result.ok) setInboxUnread(result.unread);
    });
  }, [page]);
  return (
    <main className="app wide inbox-page">
      <h1>{t('inboxTitle')}</h1>
      {page.items.length === 0 ? (
        <p className="meta">{t('inboxEmpty')}</p>
      ) : (
        <ul className="inbox-list">
          {page.items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </ul>
      )}
    </main>
  );
}

/** «Вхідні» (/inbox, 70): розсилки адміна й відповіді на «Щось не працює»; лише акаунт. */
export function InboxPage(): JSX.Element {
  const { key } = useLocation();
  const [attempt, setAttempt] = useState(0);
  // Сигнал service worker «quiz:inbox» (прийшло сповіщення): список читається знову, не чекаючи переходу.
  useEffect(() => {
    const worker = typeof navigator !== 'undefined' && typeof navigator.serviceWorker === 'object' ? navigator.serviceWorker : null;
    if (worker === null) return;
    const onMessage = (event: Event) => {
      const data = (event as MessageEvent).data as unknown;
      if (typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'quiz:inbox') setAttempt((n) => n + 1);
    };
    worker.addEventListener('message', onMessage);
    return () => worker.removeEventListener('message', onMessage);
  }, []);
  const state = usePrivateData(async () => {
    const result = await getInbox();
    if (!result.ok) return result;
    const { ok: _ok, ...data } = result;
    return { ok: true as const, data: data as InboxData };
  }, `${key}:${attempt}`);
  if (state.status === 'signed-out') return <Navigate to={LOGIN} replace />;
  if (state.status === 'loading')
    return (
      <main className="app wide">
        <p className="meta">{t('loading')}</p>
      </main>
    );
  if (state.status === 'error')
    return (
      <main className="app wide">
        <p className="error" role="alert">
          {state.message}
        </p>
        <button type="button" className="secondary" onClick={() => setAttempt((n) => n + 1)}>
          {t('prizesRetry')}
        </button>
      </main>
    );
  return <InboxList key={`${key}:${attempt}`} page={state.data} />;
}
