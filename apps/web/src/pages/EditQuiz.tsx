import type { Quiz } from '@quiz/shared';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { createQuiz, getQuiz, updateQuiz } from '../api';
import { newQuiz } from '../editor/draft';
import { clearDraft, loadDraft, saveDraft } from '../editor/draft-storage';
import { QuizEditor } from '../editor/QuizEditor';
import { errorText, t } from '../i18n';
import { useAccount } from '../useAccount';

export function EditQuiz() {
  const { id } = useParams();
  const navigate = useNavigate();
  const account = useAccount();
  const fresh = useMemo(() => newQuiz(), []);
  // Чернетка з минулого разу: сторінку перезавантажили, пішли назад або закінчилась сесія.
  const draft = useMemo(() => loadDraft(id), [id]);
  const [loaded, setLoaded] = useState<Quiz | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const signedIn = account.status === 'signed-in';

  useEffect(() => {
    if (!signedIn || id === undefined) return;
    let current = true;
    void getQuiz(id).then((result) => {
      if (!current) return;
      if (result.ok) setLoaded(result.data);
      else if (result.error === 'unauthorized') setExpired(true);
      else setLoadError(errorText(result.error));
    });
    return () => {
      current = false;
    };
  }, [signedIn, id]);

  if (account.status === 'anonymous' || expired) {
    const here = id === undefined ? '/quizzes/new' : `/quizzes/${id}`;
    return <Navigate to={`/login?next=${encodeURIComponent(here)}`} replace />;
  }

  if (account.status === 'unknown') {
    return (
      <main className="app narrow">
        <p className="error" role="alert">
          {errorText(account.error)}
        </p>
      </main>
    );
  }

  if (loadError !== null) {
    return (
      <main className="app narrow">
        <p className="error" role="alert">
          {loadError}
        </p>
        <Link className="quiet-link" to="/quizzes">
          {t('quizzesTitle')}
        </Link>
      </main>
    );
  }

  const initial = draft ?? (id === undefined ? fresh : loaded);
  if (account.status === 'loading' || initial === null) {
    return (
      <main className="app narrow">
        <p className="lead">{t('loading')}</p>
      </main>
    );
  }

  const save = async (quiz: Quiz): Promise<string | null> => {
    const result = id === undefined ? await createQuiz(quiz) : await updateQuiz(id, quiz);
    if (!result.ok) {
      // Чернетка лишається у сховищі й повернеться після повторного входу.
      if (result.error === 'unauthorized') setExpired(true);
      return errorText(result.error);
    }
    clearDraft(id);
    navigate('/quizzes');
    return null;
  };

  return (
    <QuizEditor
      initial={initial}
      heading={t(id === undefined ? 'editorNew' : 'editorEdit')}
      notice={draft === null ? null : t('draftRestored')}
      onDraft={(quiz) => saveDraft(id, quiz)}
      onSave={save}
      onCancel={() => {
        clearDraft(id);
        navigate('/quizzes');
      }}
    />
  );
}
