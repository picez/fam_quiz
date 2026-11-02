import { useState, type JSX } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { allSpares, roundQuestions, roundTrials, type AdminQuizView, type Question, type Round } from '@quiz/shared';
import { errorText, t } from '../i18n';
import { roundLabel } from '../format';
import { adminQuiz, deleteQuestionAsAdmin, deleteQuizAsAdmin } from './admin-api';
import { questionConfirm, questionLines } from './admin-text';
import { useAdminData } from './useAdminData';

export function AdminQuiz(): JSX.Element {
  const { id = '' } = useParams();
  const state = useAdminData(() => adminQuiz(id), id);
  if (state.status === 'home') return <Navigate to="/" replace />;
  if (state.status === 'loading') return <p className="meta">{t('loading')}</p>;
  if (state.status === 'error') {
    return (
      <>
        <p className="error" role="alert">
          {state.message}
        </p>
        <button type="button" className="btn" onClick={state.reload}>
          {t('prizesRetry')}
        </button>
      </>
    );
  }
  return <QuizView key={id} loaded={state.data} />;
}

function QuizView({ loaded }: { loaded: AdminQuizView }): JSX.Element {
  // Після видалення запитання сервер віддає вікторину наново — далі беремо її.
  const [fresh, setFresh] = useState<AdminQuizView | null>(null);
  const view = fresh ?? loaded;
  const { quiz, effects } = view;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<'home' | 'list' | null>(null);

  const removeQuestion = async (question: Question, roundTitle: string) => {
    const text = questionConfirm(effects[question.id] ?? 'not_found', roundTitle);
    if (text === null || !window.confirm(text)) return;
    setBusy(true);
    setError(null);
    const result = await deleteQuestionAsAdmin(view.id, question.id);
    setBusy(false);
    if (result.ok) setFresh(result.data);
    else if (result.error === 'not_found') setTarget('home');
    else setError(errorText(result.error));
  };

  const removeQuiz = async () => {
    if (!window.confirm(t('adminDeleteQuizConfirm', { title: quiz.title, author: view.author.nickname }))) return;
    setBusy(true);
    setError(null);
    const result = await deleteQuizAsAdmin(view.id);
    setBusy(false);
    if (result.ok) setTarget('list');
    else if (result.error === 'not_found') setTarget('home');
    else setError(errorText(result.error));
  };

  const card = (question: Question, roundTitle: string): JSX.Element => {
    const effect = effects[question.id] ?? 'not_found';
    const off = questionConfirm(effect, roundTitle) === null;
    const hintId = `hint-${question.id}`;
    const hint = effect === 'locked' ? t('err_question_locked') : effect === 'last_question' ? t('adminDeleteWholeQuiz') : null;
    return (
      <li key={question.id} className="admin-card">
        {questionLines(question).map((line, index) => (
          <p key={index} className={index === 0 ? undefined : 'meta'}>
            {line}
          </p>
        ))}
        {question.imageUrl !== null && <img className="admin-thumb" src={question.imageUrl} alt={t('adminQuestionImage')} loading="lazy" />}
        <button
          type="button"
          className="btn"
          disabled={busy || off}
          aria-describedby={hint === null ? undefined : hintId}
          onClick={() => void removeQuestion(question, roundTitle)}
        >
          {t('adminDeleteQuestion')}
        </button>
        {hint !== null && (
          <p id={hintId} className="meta">
            {hint}
          </p>
        )}
      </li>
    );
  };

  const roundBody = (round: Round, title: string): JSX.Element => {
    if (round.type === 'board') {
      return (
        <>
          {round.categories.map((category) => (
            <section key={category.id}>
              <h3>{category.title}</h3>
              <ul className="admin-list">{category.cells.map((cell) => card(cell.question, title))}</ul>
            </section>
          ))}
        </>
      );
    }
    return <ul className="admin-list">{roundQuestions(round).map((question) => card(question, title))}</ul>;
  };

  const spares = allSpares(quiz);
  if (target === 'home') return <Navigate to="/" replace />;
  if (target === 'list') return <Navigate to="/admin/quizzes" replace />;
  return (
    <>
      <Link className="quiet-link" to="/admin/quizzes">
        {t('adminBack')}
      </Link>
      <h2 className="admin-title">{quiz.title}</h2>
      <p className="meta">
        {t('adminAuthor', { name: '' })}
        <Link to={`/admin/users/${encodeURIComponent(view.author.id)}`}>{view.author.nickname}</Link>
      </p>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void removeQuiz()}>
        {t('adminDeleteQuiz')}
      </button>
      {quiz.rounds.map((round, index) => {
        const title = roundLabel(round.title, index, round.type);
        const trials = roundTrials(round);
        return (
          <section key={round.id}>
            <h2>{title}</h2>
            {roundBody(round, title)}
            {trials.length > 0 && (
              <>
                <h3>{t('adminTrials')}</h3>
                <ul className="admin-list">{trials.map((question) => card(question, title))}</ul>
              </>
            )}
          </section>
        );
      })}
      {spares.length > 0 && (
        <section>
          <h2>{t('adminSpares')}</h2>
          <ul className="admin-list">{spares.map((question) => card(question, ''))}</ul>
        </section>
      )}
      {quiz.duels !== undefined && (
        <section>
          <h2>{t('duelsTitle')}</h2>
          <p className="meta">{t('adminDuelsReadOnly')}</p>
          {quiz.duels.categories.map((category) => (
            <div key={category.id} className="admin-card">
              <h3>{category.title}</h3>
              {category.questions.map((question) => (
                <p key={question.id}>{question.text}</p>
              ))}
            </div>
          ))}
        </section>
      )}
    </>
  );
}
