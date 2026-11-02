import { CALENDAR_TITLE_MAX, type CalendarEvent, type CalendarInput } from '@quiz/shared';
import { useState, type FormEvent, type JSX } from 'react';
import { Link } from 'react-router-dom';
import type { QuizSummary } from '../api';
import { errorText, t } from '../i18n';
import { isoToLocalInput, localInputToIso } from './calendar-time';

/** Планування й зміна події. onSubmit: null — збережено, рядок — текст відмови (форма лишається). */
export function CalendarForm({
  initial,
  quizzes,
  zone,
  now,
  onSubmit,
  onCancel,
}: {
  initial?: CalendarEvent;
  quizzes: QuizSummary[];
  zone: string;
  now: Date;
  onSubmit: (input: CalendarInput) => Promise<string | null>;
  onCancel: () => void;
}): JSX.Element {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [when, setWhen] = useState(initial ? isoToLocalInput(initial.startsAt, zone) : '');
  const [quizId, setQuizId] = useState(initial?.quiz.id ?? quizzes[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (quizzes.length === 0)
    return (
      <div className="calendar-form">
        <p className="meta">{t('calendarNoQuizzes')}</p>
        <p>
          <Link to="/quizzes/new">{t('calendarNoQuizzesLink')}</Link>
        </p>
        <button type="button" className="secondary" onClick={onCancel}>
          {t('calendarFormCancel')}
        </button>
      </div>
    );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const startsAt = localInputToIso(when, zone);
    if (startsAt === null) return setError(errorText('calendar_time'));
    setSaving(true);
    setError(null);
    const refusal = await onSubmit({ title: title.trim(), startsAt, quizId });
    setSaving(false);
    if (refusal !== null) setError(refusal);
  };

  return (
    <form className="calendar-form" onSubmit={submit}>
      <label className="field">
        {t('calendarFieldTitle')}
        <input value={title} maxLength={CALENDAR_TITLE_MAX} required onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        {t('calendarFieldWhen')}
        <input type="datetime-local" value={when} min={isoToLocalInput(now.toISOString(), zone)} required onChange={(e) => setWhen(e.target.value)} />
      </label>
      <label className="field">
        {t('calendarFieldQuiz')}
        <select value={quizId} onChange={(e) => setQuizId(e.target.value)}>
          {quizzes.map((quiz) => (
            <option key={quiz.id} value={quiz.id}>
              {quiz.title}
            </option>
          ))}
        </select>
      </label>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="calendar-actions">
        <button type="submit" disabled={saving}>
          {t('calendarSave')}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          {t('calendarFormCancel')}
        </button>
      </div>
    </form>
  );
}
