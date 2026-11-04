import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { deleteQuiz, listQuizzes, type QuizSummary } from '../api';
import { RunningGameBanner, addDemoQuiz, useStartGame } from '../host-game';
import { errorText, t } from '../i18n';
import { useAccount } from '../useAccount';
import { AutopilotLaunch } from './AutopilotLaunch';

const LOGIN = '/login?next=%2Fquizzes';

export function Quizzes() {
  const startGame = useStartGame();
  const account = useAccount();
  const [quizzes, setQuizzes] = useState<QuizSummary[] | null>(null);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [launch, setLaunch] = useState<QuizSummary | null>(null);
  const signedIn = account.status === 'signed-in';

  /** Показує помилку; закінчену сесію перетворює на перехід до входу. */
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

  /** Виконує дію зі списком, не даючи запустити другу одночасно. */
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    await action();
    setBusy(false);
  };

  const play = (quiz: QuizSummary) =>
    run(async () => {
      const error = await startGame(quiz.id);
      if (error !== null) fail(error);
    });

  const remove = (quiz: QuizSummary) => {
    if (!window.confirm(t('removeConfirm', { title: quiz.title }))) return;
    void run(async () => {
      const result = await deleteQuiz(quiz.id);
      if (!result.ok) return fail(result.error);
      await reload();
    });
  };

  const addDemo = () =>
    run(async () => {
      const error = await addDemoQuiz();
      if (error !== null) return fail(error);
      await reload();
    });

  return (
    <main className="app wide">
      <h1 className="brand">{t('quizzesTitle')}</h1>

      <RunningGameBanner enabled={signedIn} />

      <div className="toolbar">
        <Link className="btn btn-primary" to="/quizzes/new">
          {t('newQuiz')}
        </Link>
        <button type="button" className="btn" disabled={busy} onClick={addDemo}>
          {t('addDemo')}
        </button>
        <Link className="btn" to="/help">
          {t('helpLink')}
        </Link>
      </div>

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {quizzes === null && <p className="meta">{t('loading')}</p>}
      {quizzes !== null && quizzes.length === 0 && <p className="lead">{t('noQuizzes')}</p>}
      {quizzes !== null && quizzes.length > 0 && (
        <ul className="quiz-list">
          {quizzes.map((quiz) => (
            <li className="panel" key={quiz.id}>
              <div>
                <h2 dir="auto">{quiz.title}</h2>
                {quiz.description !== '' && <p className="meta">{quiz.description}</p>}
                <p className="meta">{t('questionCount', { count: quiz.questionCount })}</p>
              </div>
              <div className="toolbar">
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => play(quiz)}>
                  {t('play')}
                </button>
                <button type="button" className="btn" disabled={busy} onClick={() => setLaunch(quiz)}>
                  {t('autopilotLaunch')}
                </button>
                <Link className="btn" to={`/quizzes/${quiz.id}`}>
                  {t('edit')}
                </Link>
                <button type="button" className="btn btn-danger" disabled={busy} onClick={() => remove(quiz)}>
                  {t('remove')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {launch !== null && <AutopilotLaunch quiz={launch} onClose={() => setLaunch(null)} />}
    </main>
  );
}
