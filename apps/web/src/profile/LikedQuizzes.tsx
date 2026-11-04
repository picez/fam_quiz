import { useEffect, useRef, useState, type JSX, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import type { ApiData } from '../api';
import { getLikesGiven, getLikesReceived } from '../api';
import { formatDate, num } from '../format';
import { countText, t } from '../i18n';
import { nickText } from '../nick';
import type { GivenLike, LikesPage, ReceivedLike } from '@quiz/shared';
import { Avatar } from './Avatar';

type Tab = 'mine' | 'others';
const TABS: Tab[] = ['mine', 'others'];

interface ListState<T> {
  items: T[];
  next: number | null;
  loading: boolean;
  error: boolean;
  /** Перший запит уже пішов: повернення на вкладку не вантажить знову. */
  started: boolean;
}

const empty = <T,>(): ListState<T> => ({ items: [], next: null, loading: false, error: false, started: false });

/** Список з «Показати ще»: збій лишає вже показані рядки. */
function useList<T>(fetchPage: (offset: number) => Promise<ApiData<LikesPage<T>>>): [ListState<T>, (offset: number) => void] {
  const [state, setState] = useState<ListState<T>>(empty);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const load = (offset: number) => {
    setState((old) => ({ ...old, loading: true, error: false, started: true }));
    void fetchPage(offset).then((result) => {
      if (!alive.current) return;
      setState((old) =>
        result.ok
          ? { items: offset === 0 ? result.data.items : [...old.items, ...result.data.items], next: result.data.next, loading: false, error: false, started: true }
          : { ...old, loading: false, error: true },
      );
    });
  };
  return [state, load];
}

function MoreAndError<T>({ state, onMore }: { state: ListState<T>; onMore: () => void }): JSX.Element {
  return (
    <>
      {state.error && (
        <p className="error" role="alert">
          {t('likedError')}
        </p>
      )}
      {state.next !== null && (
        <button type="button" className="btn btn-small liked-more" disabled={state.loading} onClick={onMore}>
          {t('feedMore')}
        </button>
      )}
    </>
  );
}

function GivenRow({ row }: { row: GivenLike }): JSX.Element {
  const [open, setOpen] = useState(false);
  const date = t('likedLastAt', { date: formatDate(row.lastAt) });
  if (row.quiz === null) {
    return (
      <li className="liked-row">
        <p className="liked-title">{t('calendarQuizGone')}</p>
        <p className="liked-meta">{date}</p>
      </li>
    );
  }
  const expandable = row.questions.length > 0 || row.quizLiked || row.gone > 0;
  const panelId = `liked-questions-${row.quizId}`;
  return (
    <li className="liked-row">
      <p className="liked-title">{row.quiz.title}</p>
      <Link className="liked-author" to={`/profile/${row.quiz.author.id}`}>
        <Avatar profile={row.quiz.author} size="small" />
        <span>{nickText(row.quiz.author.nickname)}</span>
      </Link>
      <p className="liked-meta">
        <span className="liked-count">
          <span aria-hidden="true">❤️ {num(row.count)}</span>
          <span className="sr-only">{countText('likedMineCount', row.count, { count: row.count })}</span>
        </span>
        <span>{date}</span>
      </p>
      {expandable && (
        <>
          <button type="button" className="btn btn-small liked-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
            {t('likedShowQuestions')}
          </button>
          {open && (
            <ul className="liked-questions" id={panelId}>
              {row.quizLiked && <li>{t('likedQuizWhole')}</li>}
              {row.questions.map((text, index) => (
                <li key={index}>{text}</li>
              ))}
              {row.gone > 0 && <li className="liked-gone">{countText('likedGone', row.gone, { count: row.gone })}</li>}
            </ul>
          )}
        </>
      )}
    </li>
  );
}

function ReceivedRow({ row }: { row: ReceivedLike }): JSX.Element {
  return (
    <li className="liked-row">
      <p className="liked-title">
        <Link to={`/quizzes/${row.quizId}`}>{row.title}</Link>
      </p>
      <p className="liked-meta">
        <span>
          <span aria-hidden="true">❤️ {num(row.total)}</span>
          <span className="sr-only">{countText('likedMineCount', row.total, { count: row.total })}</span>
        </span>
        <span>{countText('likedPeople', row.people, { count: row.people })}</span>
      </p>
      {row.top.length > 0 && (
        <ol className="liked-top">
          {row.top.map((question, index) => (
            <li key={index}>
              <span>{question.text}</span> <span className="liked-top-count">
                <span aria-hidden="true">❤️ {num(question.count)}</span>
                <span className="sr-only">{countText('likedMineCount', question.count, { count: question.count })}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

/** «Мені сподобались» і «Сподобались іншим» (24b): вікторини, яким я ставив ❤️, і мої, що зібрали ❤️. Дані вкладки вантажаться при першому відкритті. */
export function LikedQuizzes(): JSX.Element {
  const [tab, setTab] = useState<Tab>('mine');
  const [mine, loadMine] = useList<GivenLike>(getLikesGiven);
  const [others, loadOthers] = useList<ReceivedLike>(getLikesReceived);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ mine: null, others: null });

  useEffect(() => {
    if (tab === 'mine' && !mine.started) loadMine(0);
    if (tab === 'others' && !others.started) loadOthers(0);
  }, [tab, mine.started, others.started]);

  const move = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = TABS.indexOf(tab);
    let target: Tab | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') target = TABS[(index + 1) % TABS.length]!;
    else if (event.key === 'Home') target = TABS[0]!;
    else if (event.key === 'End') target = TABS[TABS.length - 1]!;
    if (target === null) return;
    event.preventDefault();
    setTab(target);
    tabRefs.current[target]?.focus();
  };

  const tabButton = (id: Tab, label: string) => (
    <button
      type="button"
      role="tab"
      id={`liked-tab-${id}`}
      className="liked-tab"
      aria-selected={tab === id}
      aria-controls={`liked-panel-${id}`}
      tabIndex={tab === id ? 0 : -1}
      ref={(element) => {
        tabRefs.current[id] = element;
      }}
      onClick={() => setTab(id)}
      onKeyDown={move}
    >
      {label}
    </button>
  );

  return (
    <section className="profile-section liked-quizzes">
      <div role="tablist" className="liked-tabs" aria-label={t('likedTabsLabel')}>
        {tabButton('mine', t('likedMineTab'))}
        {tabButton('others', t('likedOthersTab'))}
      </div>
      <div role="tabpanel" id="liked-panel-mine" aria-labelledby="liked-tab-mine" hidden={tab !== 'mine'}>
        {mine.started && !mine.loading && !mine.error && mine.items.length === 0 ? (
          <p className="meta liked-empty">{t('likedMineEmpty')}</p>
        ) : (
          <ul className="liked-list">
            {mine.items.map((row) => (
              <GivenRow key={row.quizId} row={row} />
            ))}
          </ul>
        )}
        <MoreAndError state={mine} onMore={() => loadMine(mine.next ?? 0)} />
      </div>
      <div role="tabpanel" id="liked-panel-others" aria-labelledby="liked-tab-others" hidden={tab !== 'others'}>
        {others.started && !others.loading && !others.error && others.items.length === 0 ? (
          <p className="meta liked-empty">{t('likedOthersEmpty')}</p>
        ) : (
          <ul className="liked-list">
            {others.items.map((row) => (
              <ReceivedRow key={row.quizId} row={row} />
            ))}
          </ul>
        )}
        <MoreAndError state={others} onMore={() => loadOthers(others.next ?? 0)} />
      </div>
    </section>
  );
}
