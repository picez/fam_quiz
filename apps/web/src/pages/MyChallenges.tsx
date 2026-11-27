import type { JSX } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { FriendChallenge, SentChallenge } from '@quiz/shared';
import { listFriendChallenges, listSentChallenges } from '../api';
import { daysLeftText, playedText } from '../challenge/challenge-text';
import { num } from '../format';
import { t } from '../i18n';
import { nickText } from '../nick';
import { usePrivateData, type PrivateData } from '../usePrivateData';
import { EmptyState, Loading, LoadError } from '../ui/PageState';
import { HistoryTabs } from './HistoryTabs';

function Sent({ rows }: { rows: SentChallenge[] }): JSX.Element {
  if (rows.length === 0) {
    return (
      <EmptyState text={t('challengesSentEmpty')}>
        <Link className="btn btn-primary" to="/quizzes">
          {t('menuQuizzes')}
        </Link>
      </EmptyState>
    );
  }
  return (
    <ul className="quiz-list">
      {rows.map((row) => (
        <li className="panel challenge-row" key={row.code}>
          <h3 dir="auto">{row.title}</h3>
          <p className="meta">{`${row.active ? daysLeftText(row.expiresAt) : t('challengeEnded')} · ${playedText(row.played)}`}</p>
          {row.best !== null && (
            <p className="meta" dir="auto">
              {t('challengeBestLine', { nickname: row.best.nickname, score: num(row.best.score) })}
            </p>
          )}
          <Link className="btn btn-small" to={`/challenge/${row.code}`}>
            {t('challengeResultsLink')}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Received({ rows }: { rows: FriendChallenge[] }): JSX.Element {
  if (rows.length === 0) return <p className="meta">{t('challengesReceivedEmpty')}</p>;
  return (
    <ul className="quiz-list">
      {rows.map((row) => (
        <li className="panel challenge-row" key={row.code}>
          <h3 dir="auto">{row.title}</h3>
          <p className="meta">
            {[row.author === null ? null : t('challengeFrom', { nick: nickText(row.author.nickname) }), daysLeftText(row.expiresAt)].filter((part) => part !== null).join(' · ')}
          </p>
          <Link className="btn btn-primary btn-small" to={`/challenge/${row.code}`}>
            {t('homeChallengePlay')}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Стан одного списку: скелет, помилка з повтором або вміст. */
function Part<T>({ state, children }: { state: PrivateData<T>; children: (data: T) => JSX.Element }): JSX.Element | null {
  if (state.status === 'loading') return <Loading list />;
  if (state.status === 'error') return <LoadError message={state.message} onRetry={state.retry} />;
  if (state.status === 'ready') return children(state.data);
  return null;
}

/**
 * /history/challenges (79): «Мої виклики» — третя вкладка історії. Надіслані мною (спроби, найкращий результат, таблиця)
 * і активні виклики від друзів, яких я ще не пробував (та сама точка, що й «Що далі» на головній).
 */
export function MyChallenges(): JSX.Element {
  const sent = usePrivateData(listSentChallenges);
  const received = usePrivateData(listFriendChallenges);

  if (sent.status === 'signed-out' || received.status === 'signed-out') return <Navigate to="/login?next=%2Fhistory%2Fchallenges" replace />;

  return (
    <main className="app wide my-challenges">
      <HistoryTabs />
      <h1 className="brand">{t('challengesTitle')}</h1>
      <section className="challenges-part" aria-labelledby="challenges-sent">
        <h2 id="challenges-sent">{t('challengesSent')}</h2>
        <Part state={sent}>{(rows) => <Sent rows={rows} />}</Part>
      </section>
      <section className="challenges-part" aria-labelledby="challenges-received">
        <h2 id="challenges-received">{t('challengesReceived')}</h2>
        <Part state={received}>{(rows) => <Received rows={rows} />}</Part>
      </section>
    </main>
  );
}
