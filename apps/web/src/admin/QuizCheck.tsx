import { useState, type JSX } from 'react';
import { Navigate } from 'react-router-dom';
import { checkSeverity, type AdminQuizCheck, type QuizCheckIssue } from '@quiz/shared';
import { errorText, t, ukMessages, type TextKey } from '../i18n';
import { checkQuiz } from './admin-api';

type Run = { status: 'idle' } | { status: 'running' } | { status: 'home' } | { status: 'error'; message: string } | { status: 'done'; check: AdminQuizCheck };

/** Запуск перевірки: один запит за раз; 404 — адмінки для акаунта немає. */
function useCheck(quizId: string, onDone?: () => void): { run: Run; start: () => void } {
  const [run, setRun] = useState<Run>({ status: 'idle' });
  const start = () => {
    if (run.status === 'running') return;
    setRun({ status: 'running' });
    void checkQuiz(quizId).then((result) => {
      if (result.ok) setRun({ status: 'done', check: result.data });
      else if (result.error === 'not_found') setRun({ status: 'home' });
      else setRun({ status: 'error', message: errorText(result.error) });
      if (result.ok) onDone?.();
    });
  };
  return { run, start };
}

/** Ізоляція напрямку (FSI … PDI): шлях чи адреса в арабському реченні не переставляє «/» і «.»; чисте число не потребує. */
const isolate = (detail: string): string => (detail === '' || /^\d+$/.test(detail) ? detail : `⁨${detail}⁩`);

/** Текст проблеми за кодом; для autopilot_blocked деталь — код блокування з власним текстом, якщо він є. */
function issueText(issue: QuizCheckIssue): string {
  const raw = issue.detail ?? '';
  const block = `autopilotBlock_${raw}`;
  const detail = issue.code === 'autopilot_blocked' && Object.hasOwn(ukMessages, block) ? t(block as TextKey) : isolate(raw);
  return t(`adminCheck_${issue.code}`, { detail });
}

/** Без раунду й запитання: таймер дуелей і вади схеми в запасних чи дуелях — «Запасні й дуелі», решта — уся вікторина. */
function placeText(issue: QuizCheckIssue): string {
  if (issue.round !== null) return t('adminCheckRound', { number: issue.round + 1 });
  if (issue.questionId !== null || issue.code === 'short_timer' || /^(duels|spares)\b/.test(issue.detail ?? '')) return t('adminCheckOther');
  return t('adminCheckWholeQuiz');
}

/** Підсумок перевірки одним рядком. */
const summaryText = (check: AdminQuizCheck): string =>
  check.errors === 0 && check.warnings === 0 ? t('adminCheckOk') : t('adminCheckSummary', { errors: check.errors, warnings: check.warnings });

/**
 * Рядок стану: один і той самий вузол із першого показу (порожній), змінюється лише текст —
 * так програми читання екрана оголошують і підсумок, і збій.
 */
function StatusLine({ run, className }: { run: Run; className: string }): JSX.Element {
  const text = run.status === 'done' ? summaryText(run.check) : run.status === 'error' ? run.message : '';
  return (
    <p className={`${className} admin-check-status${run.status === 'error' ? ' error' : ' meta'}`} role="status">
      {text}
    </p>
  );
}

function Group({ title, issues, onIssue }: { title: string; issues: QuizCheckIssue[]; onIssue: (issue: QuizCheckIssue) => void }): JSX.Element | null {
  if (issues.length === 0) return null;
  return (
    <section className="admin-check-group">
      <h3>{title}</h3>
      <ul className="admin-list is-rows">
        {issues.map((issue, index) => (
          <li key={index} className="admin-card">
            <p dir="auto">{issueText(issue)}</p>
            <p className="meta" dir="auto">
              {placeText(issue)}
              {issue.question !== null && ` · ${issue.question}`}
            </p>
            {issue.questionId !== null && (
              <button type="button" className="btn" onClick={() => onIssue(issue)}>
                {t('adminCheckGoTo')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Панель на сторінці перегляду: кнопка, а далі помилки й попередження з переходом до запитання. */
export function QuizCheckPanel({ quizId, onIssue }: { quizId: string; onIssue: (issue: QuizCheckIssue) => void }): JSX.Element {
  const { run, start } = useCheck(quizId);
  if (run.status === 'home') return <Navigate to="/" replace />;
  const issues = run.status === 'done' ? run.check.issues : [];
  return (
    <section className="admin-check" aria-label={t('adminCheckRun')}>
      <div className="admin-actions">
        <button type="button" className="btn" disabled={run.status === 'running'} onClick={start}>
          {run.status === 'running' ? t('adminChecking') : t('adminCheckRun')}
        </button>
      </div>
      <StatusLine run={run} className="admin-check-summary" />
      <Group title={t('adminCheckErrors')} issues={issues.filter((issue) => checkSeverity(issue.code) === 'error')} onIssue={onIssue} />
      <Group title={t('adminCheckWarnings')} issues={issues.filter((issue) => checkSeverity(issue.code) === 'warning')} onIssue={onIssue} />
    </section>
  );
}

/** Коротка перевірка для списків: кнопка (у назві — вікторина, бо кнопок у списку багато) і рядок підсумку. */
export function QuizCheckButton({ quizId, title, onDone }: { quizId: string; title: string; onDone?: () => void }): JSX.Element {
  const { run, start } = useCheck(quizId, onDone);
  if (run.status === 'home') return <Navigate to="/" replace />;
  return (
    <>
      <button type="button" className="btn" disabled={run.status === 'running'} aria-label={`${run.status === 'running' ? t('adminChecking') : t('adminCheckShort')}: ${title}`} onClick={start}>
        {run.status === 'running' ? t('adminChecking') : t('adminCheckShort')}
      </button>
      <StatusLine run={run} className="admin-check-line" />
    </>
  );
}
