import { useState, type JSX } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { allSpares, roundQuestions, roundTrials, type AdminQuizView, type QuizCheckIssue, type Question, type Quiz, type Round } from '@quiz/shared';
import { errorText, t } from '../i18n';
import { formatDate, roundLabel } from '../format';
import { clockText } from '../live/Timer';
import { adminQuiz, adminReportedQuiz, deleteQuestionAsAdmin, deleteQuizAsAdmin } from './admin-api';
import { questionConfirm } from './admin-text';
import { QuizCheckPanel } from './QuizCheck';
import { questionPreview } from './quiz-preview';
import { useAdminData } from './useAdminData';
import { nickText } from '../nick';

/** moderate — вікторина користувача з кнопками видалення; report — знімок з каталогу за скаргою; bot — вікторина бота лише для перегляду. */
type Mode = 'moderate' | 'report' | 'bot';

/** Більше запитань — раунди стартують згорнутими. */
const FOLD_OVER = 20;

const BACK: Record<Mode, string> = { moderate: '/admin/quizzes', report: '/admin/appeals/complaints', bot: '/admin/bot' };

export function AdminQuiz(): JSX.Element {
  const { id = '' } = useParams();
  return <Loaded id={id} load={() => adminQuiz(id)} mode="moderate" />;
}

/** Знімок вікторини з каталогу, на який скаржаться: те, що бачать гравці, лише для перегляду. */
export function AdminReportedQuiz(): JSX.Element {
  const { entryId = '' } = useParams();
  return <Loaded id={entryId} load={() => adminReportedQuiz(entryId)} mode="report" />;
}

/** Вікторина бота з вкладки «Бот»: лише перегляд, видаляють її у вкладці. */
export function AdminBotQuizView(): JSX.Element {
  const { id = '' } = useParams();
  return <Loaded id={id} load={() => adminQuiz(id)} mode="bot" />;
}

function Loaded({ id, load, mode }: { id: string; load: () => ReturnType<typeof adminQuiz>; mode: Mode }): JSX.Element {
  const state = useAdminData(load, id);
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
  return <QuizView key={id} loaded={state.data} mode={mode} />;
}

/** Список з даних, що можуть не пройти схему (стара вікторина): збій чи не масив — порожньо. */
function listOf<T>(read: () => T[] | undefined): T[] {
  try {
    const list = read();
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

const questionsOf = (round: Round) => listOf(() => roundQuestions(round));
const trialsOf = (round: Round) => listOf(() => roundTrials(round));
const sparesOf = (quiz: Quiz) => listOf(() => allSpares(quiz));

function questionCount(quiz: Quiz): number {
  return listOf(() => quiz.rounds).reduce((sum, round) => sum + questionsOf(round).length + trialsOf(round).length, 0) + sparesOf(quiz).length;
}

/** Відповіді, написання, підказка, медіа, бали й таймер запитання. */
function PreviewBody({ question }: { question: Question }): JSX.Element {
  const preview = questionPreview(question);
  return (
    <>
      <p dir="auto">{preview.text}</p>
      {preview.items.length > 0 && (
        <ul className="admin-preview-items">
          {preview.items.map((item, index) => (
            <li key={index} dir="auto" className={item.correct === true ? 'is-correct' : undefined}>
              {item.correct === true && (
                <span className="admin-preview-mark" role="img" aria-label={t('adminPreviewCorrect')}>
                  ✓
                </span>
              )}
              {item.text}
            </li>
          ))}
        </ul>
      )}
      {preview.answer !== null && <p className="meta" dir="auto">{t('adminPreviewAnswer', { answer: preview.answer })}</p>}
      {preview.grid !== null && (
        <pre className="admin-preview-grid" dir="ltr" aria-label={t('adminPreviewSolution')}>
          {preview.grid.join('\n')}
        </pre>
      )}
      {preview.accepted.length > 0 && <p className="meta" dir="auto">{t('adminPreviewAccepted', { list: preview.accepted.join(', ') })}</p>}
      {preview.hint !== null && <p className="meta" dir="auto">{t('adminPreviewHint', { hint: preview.hint })}</p>}
      {preview.images.length > 0 && (
        <div className="admin-thumbs">
          {preview.images.map((url, index) => (
            <img key={url} className="admin-thumb" src={url} alt={url === question.imageUrl ? t('adminQuestionImage') : t('adminPreviewImage', { number: index + 1 })} loading="lazy" />
          ))}
        </div>
      )}
      {preview.imageLinks.map((url) => (
        <a key={url} className="quiet-link admin-preview-link" href={url} target="_blank" rel="noopener noreferrer" dir="ltr">
          {url}
        </a>
      ))}
      {preview.video !== null && (
        <a className="quiet-link" href={preview.video.url} target="_blank" rel="noopener noreferrer">
          {t('adminPreviewVideo', { start: clockText(preview.video.start * 1000) })}
        </a>
      )}
      {preview.audio !== null && (
        <a className="quiet-link" href={preview.audio.url} target="_blank" rel="noopener noreferrer">
          {t('adminPreviewAudio', { start: clockText(preview.audio.start * 1000), duration: preview.audio.duration })}
        </a>
      )}
      <p className="meta">
        {preview.timeLimit === null && preview.video !== null
          ? t('adminPreviewNoTimer', { points: preview.points })
          : t('adminPreviewPoints', { points: preview.points, seconds: preview.timeLimit ?? '—' })}
      </p>
    </>
  );
}

function QuizView({ loaded, mode }: { loaded: AdminQuizView; mode: Mode }): JSX.Element {
  // Після видалення запитання сервер віддає вікторину наново — далі беремо її.
  const [fresh, setFresh] = useState<AdminQuizView | null>(null);
  const view = fresh ?? loaded;
  const { quiz } = view;
  const effects = view.effects ?? {};
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<'home' | 'list' | null>(null);
  const moderate = mode === 'moderate';

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
    if (!window.confirm(t('adminDeleteQuizConfirm', { title: quiz.title, author: nickText(view.author.nickname) }))) return;
    setBusy(true);
    setError(null);
    const result = await deleteQuizAsAdmin(view.id);
    setBusy(false);
    if (result.ok) setTarget('list');
    else if (result.error === 'not_found') setTarget('home');
    else setError(errorText(result.error));
  };

  /** Відкриває згорнутий раунд запитання з проблемою й прокручує до нього. */
  const goTo = (issue: QuizCheckIssue) => {
    const target = issue.questionId === null ? null : document.getElementById(`q-${issue.questionId}`);
    const round = target?.closest('details') ?? document.querySelector(`details[data-round="${issue.round ?? 'spares'}"]`);
    if (round instanceof HTMLDetailsElement) round.open = true;
    target?.scrollIntoView({ block: 'center' });
    // Фокус переходить до запитання: клавіатура й програма читання екрана не лишаються на кнопці в списку перевірки.
    target?.focus({ preventScroll: true });
  };

  const card = (question: Question, roundTitle: string): JSX.Element => {
    const body = <PreviewBody question={question} />;
    if (!moderate) {
      return (
        <li key={question.id} id={`q-${question.id}`} tabIndex={-1} className="admin-card">
          {body}
        </li>
      );
    }
    const effect = effects[question.id] ?? 'not_found';
    const off = questionConfirm(effect, roundTitle) === null;
    const hintId = `hint-${question.id}`;
    const hint = effect === 'locked' ? t('err_question_locked') : effect === 'last_question' ? t('adminDeleteWholeQuiz') : null;
    return (
      <li key={question.id} id={`q-${question.id}`} tabIndex={-1} className="admin-card">
        {body}
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
          {listOf(() => round.categories).map((category) => (
            <section key={category.id}>
              <h3 dir="auto">{category.title}</h3>
              <ul className="admin-list is-rows">{listOf(() => category.cells).map((cell) => card(cell.question, title))}</ul>
            </section>
          ))}
        </>
      );
    }
    return <ul className="admin-list is-rows">{questionsOf(round).map((question) => card(question, title))}</ul>;
  };

  const rounds = listOf(() => quiz.rounds);
  const spares = sparesOf(quiz);
  const duels = quiz.duels;
  const open = questionCount(quiz) <= FOLD_OVER;
  if (target === 'home') return <Navigate to="/" replace />;
  if (target === 'list') return <Navigate to="/admin/quizzes" replace />;
  return (
    <>
      <Link className="quiet-link" to={BACK[mode]}>
        {t('adminBack')}
      </Link>
      <h2 className="admin-title" dir="auto">
        {quiz.title}
      </h2>
      <p className="meta">
        {t('adminAuthor', { name: '' })}
        <Link to={`/admin/users/${encodeURIComponent(view.author.id)}`}>{nickText(view.author.nickname)}</Link>
      </p>
      {mode !== 'report' && <QuizCheckPanel quizId={view.id} onIssue={goTo} />}
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {mode === 'report' && <p className="meta">{t('adminReportSnapshot', { date: formatDate(view.updatedAt) })}</p>}
      {moderate && (
        <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void removeQuiz()}>
          {t('adminDeleteQuiz')}
        </button>
      )}
      {rounds.map((round, index) => {
        const title = roundLabel(round.title, index, round.type);
        const trials = trialsOf(round);
        return (
          <details key={round.id ?? index} className="admin-round" data-round={index} open={open}>
            <summary>
              <h2 className="admin-round-title" dir="auto">
                {title}
              </h2>
            </summary>
            {roundBody(round, title)}
            {trials.length > 0 && (
              <>
                <h3>{t('adminTrials')}</h3>
                <ul className="admin-list is-rows">{trials.map((question) => card(question, title))}</ul>
              </>
            )}
          </details>
        );
      })}
      {spares.length > 0 && (
        <details className="admin-round" data-round="spares" open={open}>
          <summary>
            <h2 className="admin-round-title">{t('adminSpares')}</h2>
          </summary>
          <ul className="admin-list is-rows">{spares.map((question) => card(question, ''))}</ul>
        </details>
      )}
      {duels !== undefined && (
        <details className="admin-round" data-round="duels" open={open}>
          <summary>
            <h2 className="admin-round-title">{t('duelsTitle')}</h2>
          </summary>
          {moderate && <p className="meta">{t('adminDuelsReadOnly')}</p>}
          {listOf(() => duels.categories).map((category) => (
            <section key={category.id}>
              <h3 dir="auto">{category.title}</h3>
              <ul className="admin-list is-rows">
                {listOf(() => category.questions).map((question) => (
                  <li key={question.id} id={`q-${question.id}`} tabIndex={-1} className="admin-card">
                    <p dir="auto">{question.text}</p>
                    {listOf(() => question.accepted).length > 0 && (
                      <p className="meta" dir="auto">
                        {t('adminPreviewAccepted', { list: question.accepted.join(', ') })}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </details>
      )}
    </>
  );
}
