import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { listQuizzes, type QuizSummary } from '../api';
import { addDemoQuiz, useStartGame } from '../host-game';
import { errorText, t } from '../i18n';
import { ProfileSubpage } from '../profile/ProfileSubpage';
import { useAccount } from '../useAccount';

const LOGIN = '/login?next=%2Fcreate';

/** «Створити гру» зі стартового меню: вікторини гравця, у кожної «Почати гру» — одразу кімната ведучого. */
export function CreateGame() {
  const account = useAccount();
  const startGame = useStartGame();
  const [quizzes, setQuizzes] = useState<QuizSummary[] | null>(null);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signedIn = account.status === 'signed-in';

  const fail = useCallback((code: string) => {
    if (code === 'unauthorized') setExpired(true);
    else setError(errorText(code));
  }, []);

  const reload = useCallback(async () => {
    const result = await listQuizzes();
    if (result.ok) setQuizzes(result.data);
    else fail(result.error);
  }, [fail]);

  useEffect(() => {
    if (signedIn) void reload();
  }, [signedIn, reload]);

  // Гість — на вхід, як і на «Мої вікторини»; після входу повертаємось сюди.
  if (account.status === 'anonymous' || expired) return <Navigate to={LOGIN} replace />;
  if (account.status === 'unknown') {
    return (
      <main className="app narrow">
        <p className="error" role="alert">
          {errorText(account.error)}
        </p>
      </main>
    );
  }
  if (account.status === 'loading') {
    return (
      <main className="app narrow">
        <p className="lead">{t('loading')}</p>
      </main>
    );
  }

  const run = async (action: () => Promise<string | null>, after?: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    const failure = await action();
    if (failure !== null) fail(failure);
    else if (after !== undefined) await after();
    setBusy(false);
  };

  const newQuiz = (
    <Link className="btn btn-primary" to="/quizzes/new">
      <span aria-hidden="true">+{' '}</span>
      {t('newQuiz')}
    </Link>
  );

  return (
    <ProfileSubpage title={t('startCreate')} back="/" className="create-game">
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {quizzes === null && <p className="meta">{t('loading')}</p>}
      {quizzes !== null && quizzes.length === 0 && (
        <>
          <p className="lead">{t('noQuizzes')}</p>
          <div className="toolbar">
            {newQuiz}
            <button type="button" className="btn" disabled={busy} onClick={() => void run(addDemoQuiz, reload)}>
              {t('addDemo')}
            </button>
          </div>
        </>
      )}
      {quizzes !== null && quizzes.length > 0 && (
        <>
          <ul className="quiz-list">
            {quizzes.map((quiz) => (
              <li className="panel" key={quiz.id}>
                <div>
                  <h2 dir="auto">{quiz.title}</h2>
                  <p className="meta">{t('questionCount', { count: quiz.questionCount })}</p>
                </div>
                <div className="toolbar">
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run(() => startGame(quiz.id))}>
                    {t('start')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="toolbar">{newQuiz}</div>
        </>
      )}
      {quizzes !== null && (
        <Link className="quiet-link" to="/quizzes">
          {t('createMoreHint')}
        </Link>
      )}
    </ProfileSubpage>
  );
}
