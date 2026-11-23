import { useRef } from 'react';
import { t } from '../i18n';
import { useDismiss } from '../ui/use-dismiss';
import type { IssuePlace, PlacedProblem } from './draft';
import type { Reminder } from './reminders';

interface IssuesPanelProps {
  id: string;
  errors: readonly PlacedProblem[];
  reminders: readonly Reminder[];
  /** Перехід до місця рядка; панель після нього закривається. */
  onGo: (place: IssuePlace) => void;
  onClose: () => void;
}

/** Панель «⚠ N» (74): помилки, що не дадуть зберегти, і нагадування; клік по рядку веде на місце. */
export function IssuesPanel({ id, errors, reminders, onGo, onClose }: IssuesPanelProps) {
  const rootRef = useRef<HTMLElement>(null);
  useDismiss(rootRef, true, onClose);
  return (
    <section className="issues-panel" id={id} aria-label={t('issuesTitle')} ref={rootRef}>
      <div className="issues-head">
        <h2 className="issues-title">{t('issuesTitle')}</h2>
        <button type="button" className="btn btn-small btn-quiet" onClick={onClose}>
          {t('issuesClose')}
        </button>
      </div>
      {errors.length > 0 && (
        <>
          <h3 className="issues-section">{t('issuesErrors')}</h3>
          <ul className="error problems">
            {errors.map((problem, index) => (
              <li key={`${index}-${problem.text}`}>
                <button type="button" className="issues-row" onClick={() => onGo(problem.place)}>
                  {problem.text}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {reminders.length > 0 && (
        <>
          <h3 className="issues-section">{t('issuesReminders')}</h3>
          <ul className="reminders">
            {reminders.map((reminder, index) => (
              <li key={`${index}-${reminder.text}`}>
                <span className="issues-icon" aria-hidden="true">
                  ⓘ{' '}
                </span>
                <button type="button" className="issues-row" onClick={() => onGo(reminder.place)}>
                  {reminder.text}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
