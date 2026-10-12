import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { checkCode, createGame, createQuiz, deleteQuiz, listQuizzes, signOut, type QuizSummary } from '../api';
import { demoQuiz } from '../demo-quiz';
import { errorText, t } from '../i18n';
import { clearLastGame, loadHost, loadLastGame, saveHost, saveLastGame } from '../storage';
import { useAccount } from '../useAccount';

const LOGIN = '/login?next=%2Fquizzes';

export function Quizzes() {
  const navigate = useNavigate();
  const account = useAccount();
  const [quizzes, setQuizzes] = useState<QuizSummary[] | null>(null);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const signedIn = account.status === 'signed-in';

  // Ведучий міг закрити вкладку посеред гри: показати шлях назад до пульта, якщо гра ще триває.
  useEffect(() => {
    if (!signedIn) return;
    const code = loadLastGame();
    if (code === null || loadHost(code) === null) return;
    let current = true;
    void checkCode(code).then((result) => {
      if (!current) return;
      if (result.ok && result.phase !== 'finished') setRunning(code);
      else if (!result.ok && result.error === 'offline') return;
      else clearLastGame();
    });
    return () => {
      current = false;
    };
  }, [signedIn]);

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
      const result = await createGame(quiz.id);
      if (!result.ok) return fail(result.error);
      saveHost(result.code, { hostToken: result.hostToken, stageToken: result.stageToken });
      saveLastGame(result.code);
      navigate(`/host/${result.code}`);
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
      const result = await createQuiz(demoQuiz);
      if (!result.ok) return fail(result.error);
      await reload();
    });

  const leave = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <main className="app wide">
      <header className="bar">
        <span>{account.account.name}</span>
        <button type="button" className="btn btn-small" onClick={leave}>
          {t('signOut')}
        </button>
      </header>
      <h1 className="brand">{t('quizzesTitle')}</h1>

      {running !== null && (
        <Link className="banner" to={`/host/${running}`}>
          {t('backToGame', { code: `${running.slice(0, 3)} ${running.slice(3)}` })}
        </Link>
      )}

      <div className="toolbar">
        <Link className="btn btn-primary" to="/quizzes/new">
          {t('newQuiz')}
        </Link>
        <button type="button" className="btn" disabled={busy} onClick={addDemo}>
          {t('addDemo')}
        </button>
        <Link className="btn btn-quiet" to="/history">
          {t('historyTitle')}
        </Link>
        <Link className="btn btn-quiet" to="/me">
          {t('myGamesTitle')}
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
                <h2>{quiz.title}</h2>
                {quiz.description !== '' && <p className="meta">{quiz.description}</p>}
                <p className="meta">{t('questionCount', { count: quiz.questionCount })}</p>
              </div>
              <div className="toolbar">
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => play(quiz)}>
                  {t('play')}
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
    </main>
  );
}
