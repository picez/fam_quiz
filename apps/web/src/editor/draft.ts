import { DEFAULT_SETTINGS, LIMITS, questionSchema, quizSchema, type Question, type Quiz } from '@quiz/shared';
import { t, type TextKey } from '../i18n';
import { newId } from './new-id';

export type QuestionType = Question['type'];
export const QUESTION_TYPES = ['single', 'multi', 'boolean', 'text', 'numeric', 'order'] as const;

type Common = Pick<Question, 'id' | 'text' | 'imageUrl' | 'timeLimit' | 'points'>;

const blanks = (count: number) => Array.from({ length: count }, () => ({ id: newId(), text: '' }));

function build(common: Common, type: QuestionType): Question {
  switch (type) {
    case 'single': {
      const options = blanks(LIMITS.minOptions);
      return { ...common, type, options, correctId: options[0].id };
    }
    case 'multi': {
      const options = blanks(LIMITS.minOptions);
      return { ...common, type, options, correctIds: [options[0].id] };
    }
    case 'boolean':
      return { ...common, type, correct: true };
    case 'text':
      return { ...common, type, accepted: [''] };
    case 'numeric':
      return { ...common, type, correct: 0, tolerance: 0 };
    case 'order':
      return { ...common, type, items: blanks(LIMITS.minOrderItems) };
  }
}

export function newQuestion(type: QuestionType): Question {
  return build(
    { id: newId(), text: '', imageUrl: null, timeLimit: LIMITS.defaultTime, points: LIMITS.defaultPoints },
    type,
  );
}

/** Змінює тип, зберігаючи текст, час і бали; між single і multi зберігаються й варіанти. */
export function changeType(question: Question, type: QuestionType): Question {
  if (question.type === type) return question;
  const { id, text, imageUrl, timeLimit, points } = question;
  const common: Common = { id, text, imageUrl, timeLimit, points };

  if (question.type === 'single' && type === 'multi') {
    return { ...common, type, options: question.options, correctIds: [question.correctId] };
  }
  if (question.type === 'multi' && type === 'single') {
    const firstCorrect = question.options.find((option) => question.correctIds.includes(option.id));
    return { ...common, type, options: question.options, correctId: (firstCorrect ?? question.options[0]).id };
  }
  return build(common, type);
}

/** Копія запитання з власними ідентифікаторами; правильні відповіді вказують на варіанти копії. */
export function duplicateQuestion(question: Question): Question {
  const id = newId();
  switch (question.type) {
    case 'single':
    case 'multi': {
      const copies = new Map(question.options.map((option) => [option.id, newId()]));
      const copyOf = (optionId: string) => copies.get(optionId);
      const options = question.options.map((option) => ({ ...option, id: copyOf(option.id) ?? newId() }));
      if (question.type === 'single') {
        return { ...question, id, options, correctId: copyOf(question.correctId) ?? options[0].id };
      }
      const correctIds = question.correctIds.map(copyOf).filter((value): value is string => value !== undefined);
      return { ...question, id, options, correctIds };
    }
    case 'order':
      return { ...question, id, items: question.items.map((item) => ({ ...item, id: newId() })) };
    case 'text':
      return { ...question, id, accepted: [...question.accepted] };
    default:
      return { ...question, id };
  }
}

/** Список, у якому елемент перенесено з одного місця на інше; той самий список, якщо перенести не можна. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const inRange = (index: number) => Number.isInteger(index) && index >= 0 && index < items.length;
  if (from === to || !inRange(from) || !inRange(to)) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function newQuiz(): Quiz {
  return { title: '', description: '', settings: { ...DEFAULT_SETTINGS }, questions: [newQuestion('single')] };
}

/** Вікторина в тому вигляді, у якому вона піде на сервер. */
export function cleaned(quiz: Quiz): Quiz {
  const trimAll = <T extends { text: string }>(items: T[]) => items.map((item) => ({ ...item, text: item.text.trim() }));
  // Порожні рядки (наприклад, доданий останнім Enter) просто не зберігаються, якщо без них рядків
  // досить і жоден із них не позначено єдиною правильною відповіддю. Інакше їх лишаємо: про них скаже перевірка.
  const withoutSpare = <T extends { id: string; text: string }>(items: T[], min: number, mustKeep: string[] = []) => {
    const kept = items.filter((item) => item.text !== '');
    const dropsNeeded = items.some((item) => item.text === '' && mustKeep.includes(item.id));
    return kept.length >= min && !dropsNeeded ? kept : items;
  };
  return {
    ...quiz,
    title: quiz.title.trim(),
    description: quiz.description.trim(),
    questions: quiz.questions.map((question): Question => {
      const text = question.text.trim();
      switch (question.type) {
        case 'single':
          return { ...question, text, options: withoutSpare(trimAll(question.options), LIMITS.minOptions, [question.correctId]) };
        case 'multi': {
          const options = withoutSpare(trimAll(question.options), LIMITS.minOptions);
          const correctIds = question.correctIds.filter((id) => options.some((option) => option.id === id));
          return { ...question, text, options, correctIds };
        }
        case 'order':
          return { ...question, text, items: withoutSpare(trimAll(question.items), LIMITS.minOrderItems) };
        case 'text':
          return { ...question, text, accepted: question.accepted.map((s) => s.trim()).filter((s) => s !== '') };
        default:
          return { ...question, text };
      }
    }),
  };
}

function problemKey(question: Question): TextKey | null {
  if (question.text === '') return 'problemNoText';
  const { timeLimit, points } = question;
  const inLimits =
    Number.isInteger(timeLimit) &&
    timeLimit >= LIMITS.minTime &&
    timeLimit <= LIMITS.maxTime &&
    Number.isInteger(points) &&
    points >= 0 &&
    points <= LIMITS.maxPoints;
  if (!inLimits) return 'problemLimits';

  switch (question.type) {
    case 'single':
    case 'multi':
      if (question.options.some((option) => option.text === '')) return 'problemEmptyOption';
      if (question.type === 'multi' && question.correctIds.length === 0) return 'problemNoCorrect';
      break;
    case 'order':
      if (question.items.some((item) => item.text === '')) return 'problemEmptyOption';
      break;
    case 'text':
      if (question.accepted.length === 0) return 'problemNoAccepted';
      break;
    case 'numeric':
      if (!Number.isFinite(question.correct) || !Number.isFinite(question.tolerance) || question.tolerance < 0) {
        return 'problemNumber';
      }
      break;
    case 'boolean':
      break;
  }
  return questionSchema.safeParse(question).success ? null : 'problemGeneric';
}

/** Номер (з нуля) першого запитання, яке не готове, або null. */
export function firstProblemIndex(quiz: Quiz): number | null {
  const index = cleaned(quiz).questions.findIndex((question) => problemKey(question) !== null);
  return index === -1 ? null : index;
}

/** Що заважає зберегти вікторину; порожній список означає, що все гаразд. */
export function problemsOf(quiz: Quiz): string[] {
  const draft = cleaned(quiz);
  const problems: string[] = [];
  if (draft.title === '') problems.push(t('problemTitle'));
  draft.questions.forEach((question, index) => {
    const key = problemKey(question);
    if (key !== null) problems.push(t(key, { index: index + 1 }));
  });
  // Остання перевірка тією самою схемою, що й на сервері.
  if (problems.length === 0 && !quizSchema.safeParse(draft).success) problems.push(t('problemGeneric', { index: 1 }));
  return problems;
}
