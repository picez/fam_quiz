import type { JSX } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { t } from '../i18n';
import { LikedQuizzes } from '../profile/LikedQuizzes';
import { LikesCard } from '../profile/LikesCard';
import { loginFor } from '../profile/ProfileSubpage';
import { useMyProfile } from '../profile/useMyProfile';
import { Loading, LoadError } from '../ui/PageState';
import { QuizzesTabs } from './QuizzesTabs';

/** /quizzes/liked (77): вкладка «Вподобані» сторінки «Вікторини» — колишня «Вподобання» з профілю. */
export function QuizzesLiked(): JSX.Element {
  const { state } = useMyProfile();
  const location = useLocation();
  if (state.status === 'signed-out') return <Navigate to={loginFor(location.pathname + location.search)} replace />;
  return (
    <main className="app wide quizzes-liked">
      <QuizzesTabs />
      <h1 className="brand">{t('quizzesLikedTitle')}</h1>
      {state.status === 'loading' && <Loading />}
      {state.status === 'error' && <LoadError message={state.message} onRetry={state.retry} />}
      {state.status === 'ready' && (
        <>
          <LikesCard likes={state.data.likes} heading={false} />
          <LikedQuizzes />
        </>
      )}
    </main>
  );
}
