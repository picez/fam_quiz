import type { LibraryDetail } from '@quiz/shared';
import { useEffect, useState, type JSX } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ROUND_NAMES } from '../guide-text';
import { errorText, t } from '../i18n';
import { LibraryFacts } from '../library/LibraryCardView';
import { ReportDialog } from '../library/ReportDialog';
import { copyLibrary, libraryQuiz, likeLibrary } from '../library/library-api';
import { useAccount } from '../useAccount';

/** /library/:id: назва, опис і раунди відкритої вікторини — без запитань і відповідей. */
export function LibraryQuiz(): JSX.Element {
  const { id = '' } = useParams();
  const location = useLocation();
  const account = useAccount();
  const [quiz, setQuiz] = useState<LibraryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [likes, setLikes] = useState(0);
  const [liked, setLiked] = useState(false);
  const [copyId, setCopyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    let current = true;
    setQuiz(null);
    setError(null);
    setCopyId(null);
    void libraryQuiz(id).then((result) => {
      if (!current) return;
      if (!result.ok) return setError(errorText(result.error));
      setQuiz(result.data);
      setLikes(result.data.likes);
      setLiked(result.data.liked === true);
    });
    return () => {
      current = false;
    };
  }, [id]);

  if (error !== null)
    return (
      <main className="app wide">
        <p className="error" role="alert">
          {error}
        </p>
        <Link className="btn" to="/library">
          {t('libraryTitle')}
        </Link>
      </main>
    );
  if (quiz === null) return <main className="app wide"><p className="meta">{t('loading')}</p></main>;

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

  const signedIn = account.status === 'signed-in';
  const guest = account.status === 'anonymous';
  return (
    <main className="app wide library-quiz">
      <p>
        <Link className="quiet-link" to="/library">
          ← {t('libraryTitle')}
        </Link>
      </p>
      <h1 dir="auto">{quiz.title}</h1>
      <LibraryFacts card={{ ...quiz, likes }} />
      {quiz.description !== '' && (
        <p className="library-description" dir="auto">
          {quiz.description}
        </p>
      )}

      <h2>{t('libraryRounds')}</h2>
      <ul className="library-rounds" aria-label={t('libraryRounds')}>
        {quiz.rounds.map((round, index) => (
          <li key={index} dir="auto">
            {round.title === '' ? t(ROUND_NAMES[round.type]) : `${round.title} — ${t(ROUND_NAMES[round.type])}`}
          </li>
        ))}
      </ul>
      <p className="meta">{t('libraryNoAnswers')}</p>

      {signedIn && quiz.mine !== true && (
        <div className="toolbar">
          <button type="button" className="btn" aria-pressed={liked} disabled={busy} onClick={toggleLike}>
            {t(liked ? 'libraryLiked' : 'libraryLike')} {likes}
          </button>
          <button type="button" className="btn btn-primary" disabled={busy || copyId !== null} onClick={copy}>
            {t('libraryCopy')}
          </button>
          <button type="button" className="btn" onClick={() => setReporting(true)}>
            {t('reportButton')}
          </button>
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
        <p>
          <Link to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}>{t('librarySignIn')}</Link>
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
