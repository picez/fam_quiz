import { QUIZ_SORTS, type QuizSort } from '@quiz/shared';
import { t, type TextKey } from '../i18n';

const SORT_LABELS = { new: 'quizSort_new', old: 'quizSort_old', name: 'quizSort_name', changed: 'quizSort_changed' } as const satisfies Record<QuizSort, TextKey>;

interface Props {
  sort: QuizSort;
  onChange: (sort: QuizSort) => void;
  className?: string;
}

/** 73: «Порядок» списку вікторин — у «Моїх вікторинах» і в адмінці. */
export function QuizSortField({ sort, onChange, className = 'quiz-folder-sort' }: Props) {
  return (
    <label className={`field ${className}`}>
      <span>{t('quizSort')}</span>
      <select value={sort} onChange={(event) => onChange(QUIZ_SORTS.find((one) => one === event.target.value) ?? 'changed')}>
        {QUIZ_SORTS.map((one) => (
          <option key={one} value={one}>
            {t(SORT_LABELS[one])}
          </option>
        ))}
      </select>
    </label>
  );
}
