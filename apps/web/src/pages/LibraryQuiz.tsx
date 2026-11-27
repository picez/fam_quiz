import type { LibraryDetail } from '@quiz/shared';
import { useEffect, useState, type JSX } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ROUND_NAMES } from '../guide-text';
import { useStartGame } from '../host-game';
import { errorText, t } from '../i18n';
import { LibraryFacts } from '../library/LibraryCardView';
import { ReportDialog } from '../library/ReportDialog';
import { copyLibrary, libraryQuiz, likeLibrary } from '../library/library-api';
import { useAccount } from '../useAccount';
import { BackLink } from '../nav/BackLink';
import { Loading, LoadError } from '../ui/PageState';
import { useDocumentTitle } from '../nav/useDocumentTitle';

/** /library/:id: назва, опис і раунди відкритої вікторини — без запитань і відповідей. */
export function LibraryQuiz(): JSX.Element {
  const { id = '' } = useParams();
  const location = useLocation();
  const account = useAccount();
  const startGame = useStartGame();
  const [quiz, setQuiz] = useState<LibraryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [likes, setLikes] = useState(0);
  const [liked, setLiked] = useState(false);
  const [copyId, setCopyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [missing, setMissing] = useState(false);
  useDocumentTitle(quiz?.title ?? null);

  useEffect(() => {
    let current = true;
    setQuiz(null);
    setError(null);
    setCopyId(null);
    setMissing(false);
    void libraryQuiz(id).then((result) => {
      if (!current) return;
      if (!result.ok) {
        setMissing(result.error === 'not_found');
        return setError(errorText(result.error));
      }
      setQuiz(result.data);
      setLikes(result.data.likes);
      setLiked(result.data.liked === true);
    });
    return () => {
      current = false;
    };
  }, [id, attempt]);

  if (error !== null)
    return (
      <main className="app wide">
        <BackLink parent="/library" />
        <LoadError message={error} onRetry={missing ? undefined : () => setAttempt((n) => n + 1)} />
      </main>
    );
  if (quiz === null)
    return (
      <main className="app wide">
        <BackLink parent="/library" />
        <Loading />
      </main>
    );

  const toggleLike = async () => {
    setBusy(true);
    setActionError(null);
    const result = await likeLibrary(quiz.id, !liked);
    setBusy(false);
    if (!result.ok) return setActionError(errorText(result.error));
    setLikes(result.data.likes);
    setLiked(result.data.liked);
  };
  const copy = async () => {
    setBusy(true);
    setActionError(null);
    const result = await copyLibrary(quiz.id);
    setBusy(false);
    if (!result.ok) return setActionError(errorText(result.error));
    setCopyId(result.data.id);
  };

  /**
   * 77: «Провести гру» — своя вікторина автора чи вже зроблена копія (сервер віддає hostQuizId, щойно зроблена — copyId),
   * інакше спершу копія собі; тоді одразу запуск, як «Провести» в «Мої вікторини».
   */
  const host = async () => {
    setBusy(true);
    setActionError(null);
    let target = copyId ?? quiz.hostQuizId ?? null;
    if (target === null) {
      const copied = await copyLibrary(quiz.id);
      if (!copied.ok) {
        setBusy(false);
        return setActionError(errorText(copied.error));
      }
      target = copied.data.id;
      setCopyId(target);
    }
    const failed = await startGame(target);
    if (failed !== null) {
      setBusy(false);
      setActionError(errorText(failed));
    }
  };

  const signedIn = account.status === 'signed-in';
  const canHost = signedIn && (quiz.mine !== true || quiz.hostQuizId !== undefined);
  const guest = account.status === 'anonymous';
  return (
    <main className="app wide library-quiz">
      <BackLink parent="/library" />
      <h1 dir="auto">{quiz.title}</h1>
      <LibraryFacts card={{ ...quiz, likes }} />
      {quiz.description !== '' && (
        <p className="library-description" dir="auto">
          {quiz.description}
        </p>
      )}

      <h2 id="library-rounds-heading">{t('libraryRounds')}</h2>
      <ul className="library-rounds" aria-labelledby="library-rounds-heading">
        {quiz.rounds.map((round, index) => (
          <li key={index} dir="auto">
            {round.title === '' ? t(ROUND_NAMES[round.type]) : `${round.title} — ${t(ROUND_NAMES[round.type])}`}
          </li>
        ))}
      </ul>
      <p className="meta">{t('libraryNoAnswers')}</p>

      {canHost && (
        <div className="toolbar">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void host()}>
            {t('libraryHost')}
          </button>
          {quiz.mine !== true && (
            <>
              <button type="button" className="btn" aria-pressed={liked} disabled={busy} onClick={toggleLike}>
                {t('libraryLike')} {likes}
              </button>
              <button type="button" className="btn" disabled={busy || copyId !== null} onClick={copy}>
                {t('libraryCopy')}
              </button>
              <button type="button" className="btn" onClick={() => setReporting(true)}>
                {t('reportButton')}
              </button>
            </>
          )}
        </div>
      )}
      {copyId !== null && (
        <p role="status">
          {t('libraryCopied')}{' '}
          <Link className="btn" to={`/quizzes/${encodeURIComponent(copyId)}`}>
            {t('libraryOpenCopy')}
          </Link>
        </p>
      )}
      {guest && (
        <p className="toolbar">
          <Link className="btn btn-primary" to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}>
            {t('libraryHostSignIn')}
          </Link>
        </p>
      )}
      {actionError !== null && (
        <p className="error" role="alert">
          {actionError}
        </p>
      )}
      {reporting && <ReportDialog target={{ kind: 'quiz', entryId: quiz.id }} onClose={() => setReporting(false)} />}
    </main>
  );
}
