import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import type { ChallengeMine } from '@quiz/shared';
import { deleteQuiz, listMyChallenges, listQuizzes, type QuizSummary } from '../api';
import { ChallengeLaunch } from '../challenge/ChallengeLaunch';
import { daysLeftText, playedText } from '../challenge/challenge-text';
import { RunningGameBanner, addDemoQuiz, useStartGame } from '../host-game';
import { quizSizeText } from '../format';
import { errorText, t } from '../i18n';
import { useAccount } from '../useAccount';
import { ExportMenu } from '../quiz-io/ExportMenu';
import { ImportDialog } from '../quiz-io/ImportDialog';
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
  const [challengeFor, setChallengeFor] = useState<QuizSummary | null>(null);
  const [challenges, setChallenges] = useState<ChallengeMine[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const navigate = useNavigate();
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
    // Рядок про виклик — додатковий: якщо список викликів не прийшов, вікторини все одно видно.
    const active = await listMyChallenges();
    if (active.ok) setChallenges(active.data);
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
        <button type="button" className="btn" disabled={busy} onClick={() => setImportOpen(true)}>
          {t('ioImport')}
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
                <p className="meta">{quizSizeText(t('questionCount', { count: quiz.questionCount }), quiz.questionCount, quiz.truth)}</p>
                {challenges.filter((one) => one.quizId === quiz.id).map((one) => (
                  <p className="meta challenge-line" key={one.code}>
                    {t('challengeActive', { days: daysLeftText(one.expiresAt), played: playedText(one.played) })}{' '}
                    <Link to={`/challenge/${one.code}`}>{t('challengeResultsLink')}</Link>
                  </p>
                ))}
              </div>
              <div className="toolbar">
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => play(quiz)}>
                  {t('play')}
                </button>
                <button type="button" className="btn" disabled={busy} onClick={() => setLaunch(quiz)}>
                  {t('autopilotLaunch')}
                </button>
                <button type="button" className="btn" disabled={busy} onClick={() => setChallengeFor(quiz)}>
                  {t('challengeButton')}
                </button>
                <Link className="btn" to={`/quizzes/${quiz.id}`}>
                  {t('edit')}
                </Link>
                <ExportMenu quizId={quiz.id} disabled={busy} />
                <button type="button" className="btn btn-danger" disabled={busy} onClick={() => remove(quiz)}>
                  {t('remove')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} onImported={(id) => navigate(`/quizzes/${id}`)} />}
      {challengeFor !== null && (
        <ChallengeLaunch
          quiz={challengeFor}
          onClose={() => setChallengeFor(null)}
          onCreated={(mine) => setChallenges((all) => [...all.filter((one) => one.quizId !== mine.quizId), mine])}
        />
      )}
      {launch !== null && <AutopilotLaunch quiz={launch} onClose={() => setLaunch(null)} />}
    </main>
  );
}
