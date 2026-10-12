import type { Question, Quiz } from '@quiz/shared';
import { QUESTION_TYPES } from './draft';

const key = (id: string | undefined) => `quiz:draft:${id ?? 'new'}`;

/** JSON не вміє зберігати NaN (порожнє числове поле) і перетворює його на null. */
const numberOr = (value: unknown) => (typeof value === 'number' ? value : Number.NaN);

function revive(question: Question): Question {
  const base = { ...question, timeLimit: numberOr(question.timeLimit), points: numberOr(question.points) };
  return base.type === 'numeric'
    ? { ...base, correct: numberOr(base.correct), tolerance: numberOr(base.tolerance) }
    : base;
}

function looksLikeQuiz(value: unknown): value is Quiz {
  if (typeof value !== 'object' || value === null) return false;
  const { title, description, settings, questions } = value as Record<string, unknown>;
  return (
    typeof title === 'string' &&
    typeof description === 'string' &&
    typeof settings === 'object' &&
    settings !== null &&
    Array.isArray(questions) &&
    questions.length > 0 &&
    questions.every(
      (q) =>
        typeof q === 'object' &&
        q !== null &&
        typeof (q as Question).id === 'string' &&
        typeof (q as Question).text === 'string' &&
        (QUESTION_TYPES as readonly string[]).includes((q as Question).type),
    )
  );
}

/** Незбережена чернетка цієї вікторини (id не задано для нової) або null. */
export function loadDraft(id: string | undefined): Quiz | null {
  try {
    const raw = sessionStorage.getItem(key(id));
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return looksLikeQuiz(parsed) ? { ...parsed, questions: parsed.questions.map(revive) } : null;
  } catch {
    return null;
  }
}

export function saveDraft(id: string | undefined, quiz: Quiz): void {
  try {
    sessionStorage.setItem(key(id), JSON.stringify(quiz));
  } catch {
    // Сховище недоступне: редактор працює, але чернетка не переживе перезавантаження.
  }
}

export function clearDraft(id: string | undefined): void {
  try {
    sessionStorage.removeItem(key(id));
  } catch {
    // Нічого прибирати.
  }
}
