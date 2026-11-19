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

/** Текст проблеми за кодом; для autopilot_blocked деталь — код блокування з власним текстом, якщо він є. */
function issueText(issue: QuizCheckIssue): string {
  let detail = issue.detail ?? '';
  const block = `autopilotBlock_${detail}`;
  if (issue.code === 'autopilot_blocked' && Object.hasOwn(ukMessages, block)) detail = t(block as TextKey);
  return t(`adminCheck_${issue.code}`, { detail });
}

const placeText = (issue: QuizCheckIssue): string => (issue.round === null ? t('adminCheckOther') : t('adminCheckRound', { number: issue.round + 1 }));

function Group({ title, issues, onIssue }: { title: string; issues: QuizCheckIssue[]; onIssue: (issue: QuizCheckIssue) => void }): JSX.Element | null {
  if (issues.length === 0) return null;
  return (
    <section className="admin-check-group">
      <h3>{title}</h3>
      <ul className="admin-list">
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
      {run.status === 'error' && (
        <p className="error" role="alert">
          {run.message}
        </p>
      )}
      {run.status === 'done' && issues.length === 0 && (
        <p className="meta" role="status">
          {t('adminCheckOk')}
        </p>
      )}
      <Group title={t('adminCheckErrors')} issues={issues.filter((issue) => checkSeverity(issue.code) === 'error')} onIssue={onIssue} />
      <Group title={t('adminCheckWarnings')} issues={issues.filter((issue) => checkSeverity(issue.code) === 'warning')} onIssue={onIssue} />
    </section>
  );
}

/** Коротка перевірка для списків: кнопка й рядок підсумку. */
export function QuizCheckButton({ quizId, onDone }: { quizId: string; onDone?: () => void }): JSX.Element {
  const { run, start } = useCheck(quizId, onDone);
  if (run.status === 'home') return <Navigate to="/" replace />;
  return (
    <>
      <button type="button" className="btn" disabled={run.status === 'running'} onClick={start}>
        {run.status === 'running' ? t('adminChecking') : t('adminCheckShort')}
      </button>
      {run.status === 'error' && (
        <p className="error admin-check-line" role="alert">
          {run.message}
        </p>
      )}
      {run.status === 'done' && (
        <p className="meta admin-check-line" role="status">
          {run.check.errors === 0 && run.check.warnings === 0 ? t('adminCheckOk') : t('adminCheckSummary', { errors: run.check.errors, warnings: run.check.warnings })}
        </p>
      )}
    </>
  );
}
