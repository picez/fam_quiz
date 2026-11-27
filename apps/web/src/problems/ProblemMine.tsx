import type { JSX } from 'react';
import { Navigate } from 'react-router-dom';
import type { MyProblemReport } from '@quiz/shared';
import { myProblemReports } from '../api';
import { formatDate } from '../format';
import { t } from '../i18n';
import { BackLink } from '../nav/BackLink';
import { EmptyState, Loading, LoadError } from '../ui/PageState';
import { usePrivateData } from '../usePrivateData';
import { ProblemLink } from './ProblemLink';

const LOGIN = '/login?next=%2Freport%2Fmine';

function Item({ item }: { item: MyProblemReport }): JSX.Element {
  return (
    <li className="problem-mine-item">
      <p className="meta problem-mine-head">
        <span>{formatDate(item.at)}</span>
        <span className={item.status === 'resolved' ? 'problem-status is-resolved' : 'problem-status'}>{t(item.status === 'resolved' ? 'problemResolved' : 'problemOpen')}</span>
      </p>
      <p className="problem-mine-text" dir="auto">
        {item.text}
      </p>
      {item.reply !== null && (
        <p className="problem-reply" dir="auto">
          {t('problemReplyFrom', { text: item.reply })}
        </p>
      )}
    </li>
  );
}

/**
 * «Мої звернення» (80, /report/mine): мої «Повідомити про проблему» зі статусом і відповіддю адміністратора — лише акаунт.
 * Та сама відповідь приходить і у «Вхідні» (картка problem_reply веде сюди).
 */
export function ProblemMine(): JSX.Element {
  const state = usePrivateData(myProblemReports);
  if (state.status === 'signed-out') return <Navigate to={LOGIN} replace />;
  return (
    <main className="app problem-page">
      <BackLink parent="/profile/settings" />
      <h1>{t('problemMineTitle')}</h1>
      <p className="lead">{t('problemMineLead')}</p>
      {state.status === 'loading' && <Loading list />}
      {state.status === 'error' && <LoadError message={state.message} onRetry={state.retry} />}
      {state.status === 'ready' && state.data.length === 0 && (
        <EmptyState text={t('problemMineEmpty')}>
          <ProblemLink className="btn" />
        </EmptyState>
      )}
      {state.status === 'ready' && state.data.length > 0 && (
        <>
          <section className="panel problem-mine" aria-labelledby="problem-mine-title">
            <h2 id="problem-mine-title" className="sr-only">
              {t('problemMineTitle')}
            </h2>
            <ul className="problem-mine-list">
              {state.data.map((item) => (
                <Item key={item.id} item={item} />
              ))}
            </ul>
          </section>
          <p>
            <ProblemLink />
          </p>
        </>
      )}
    </main>
  );
}
