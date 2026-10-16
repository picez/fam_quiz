import { upgradeQuiz, type Question, type Quiz } from '@quiz/shared';
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

const looksLikeQuestion = (q: unknown) =>
  typeof q === 'object' &&
  q !== null &&
  typeof (q as Question).id === 'string' &&
  typeof (q as Question).text === 'string' &&
  (QUESTION_TYPES as readonly string[]).includes((q as Question).type);

function looksLikeQuiz(value: unknown): value is Quiz {
  if (typeof value !== 'object' || value === null) return false;
  const { title, description, settings, rounds } = value as Record<string, unknown>;
  return (
    typeof title === 'string' &&
    typeof description === 'string' &&
    typeof settings === 'object' &&
    settings !== null &&
    Array.isArray(rounds) &&
    rounds.length > 0 &&
    rounds.every((round) => {
      if (typeof round !== 'object' || round === null) return false;
      const { id, title: roundTitle, rules, questions } = round as Record<string, unknown>;
      return (
        typeof id === 'string' &&
        typeof roundTitle === 'string' &&
        typeof rules === 'object' &&
        rules !== null &&
        Array.isArray(questions) &&
        questions.length > 0 &&
        questions.every(looksLikeQuestion)
      );
    })
  );
}

/** Незбережена чернетка цієї вікторини (id не задано для нової) або null. */
export function loadDraft(id: string | undefined): Quiz | null {
  try {
    const raw = sessionStorage.getItem(key(id));
    if (raw === null) return null;
    // Чернетка старого формату (один список запитань) стає вікториною з одним раундом.
    const parsed = upgradeQuiz(JSON.parse(raw));
    if (!looksLikeQuiz(parsed)) return null;
    return {
      ...parsed,
      settings: { ...parsed.settings, leaderboard: parsed.settings.leaderboard ?? 'each' },
      rounds: parsed.rounds.map((round) => ({
        ...round,
        // Чернетка старого формату могла не мати цих полів.
        speedBonus: round.speedBonus ?? true,
        shuffleOptions: round.shuffleOptions ?? false,
        questions: round.questions.map(revive),
      })),
    };
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
