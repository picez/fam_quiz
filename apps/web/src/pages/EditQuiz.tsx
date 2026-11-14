import { withUniqueQuestionIds, type Quiz, type QuizLikes } from '@quiz/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { createQuiz, fetchQuizLikes, getQuiz, markGroupUses, updateQuiz } from '../api';
import { newQuiz } from '../editor/draft';
import { clearDraft, clearGroupDrafts, loadDraft, loadGroupDrafts, saveDraft, saveGroupDrafts } from '../editor/draft-storage';
import { GroupDraftsProvider, usesToMark, type GroupDrafts } from '../editor/group-drafts';
import { newId } from '../editor/new-id';
import { QuizEditor } from '../editor/QuizEditor';
import { errorText, t } from '../i18n';
import { useAccount } from '../useAccount';

export function EditQuiz() {
  const { id } = useParams();
  const navigate = useNavigate();
  const account = useAccount();
  const fresh = useMemo(() => newQuiz(), []);
  // Чернетка з минулого разу: сторінку перезавантажили, пішли назад або закінчилась сесія.
  const draft = useMemo(() => {
    const stored = loadDraft(id);
    return stored === null ? null : withUniqueQuestionIds(stored, newId);
  }, [id]);
  // Звідки запитання з групи (12l): лише в редакторі й поруч із чернеткою.
  const initialDrafts = useMemo(() => loadGroupDrafts(id), [id]);
  const groupDrafts = useRef<GroupDrafts | null>(initialDrafts);
  const [loaded, setLoaded] = useState<Quiz | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [likes, setLikes] = useState<QuizLikes | undefined>(undefined);
  const [expired, setExpired] = useState(false);
  const signedIn = account.status === 'signed-in';

  useEffect(() => {
    if (!signedIn || id === undefined) return;
    let current = true;
    void getQuiz(id).then((result) => {
      if (!current) return;
      if (result.ok) setLoaded(withUniqueQuestionIds(result.data, newId));
      else if (result.error === 'unauthorized') setExpired(true);
      else setLoadError(errorText(result.error));
    });
    return () => {
      current = false;
    };
  }, [signedIn, id]);

  // Лайки не блокують редактор: з'являться, коли прийдуть; збій — просто без сердець.
  useEffect(() => {
    if (!signedIn || id === undefined) return;
    let current = true;
    void fetchQuizLikes(id).then((result) => {
      if (current && result !== null) setLikes(result);
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
    // «Використано у «…»» — після збереження; збій позначки не заважає: вікторина вже збережена.
    const savedId = id ?? result.id;
    if (groupDrafts.current !== null) {
      for (const [groupId, itemIds] of usesToMark(groupDrafts.current, quiz)) {
        try {
          await markGroupUses(groupId, { quizId: savedId, itemIds });
        } catch {
          // Позначка не важливіша за збережену вікторину.
        }
      }
    }
    clearGroupDrafts(id);
    clearDraft(id);
    navigate('/quizzes');
    return null;
  };

  return (
    <GroupDraftsProvider
      initial={initialDrafts}
      onChange={(next) => {
        groupDrafts.current = next;
        saveGroupDrafts(id, next);
      }}
    >
      <QuizEditor
        initial={initial}
        heading={t(id === undefined ? 'editorNew' : 'editorEdit')}
        likes={likes}
        notice={initialDrafts?.fresh === true && draft !== null ? t('groupQuizNotice') : draft === null ? null : t('draftRestored')}
        onDraft={(quiz) => saveDraft(id, quiz)}
        onSave={save}
        onCancel={() => {
          clearGroupDrafts(id);
          clearDraft(id);
          navigate('/quizzes');
        }}
      />
    </GroupDraftsProvider>
  );
}
