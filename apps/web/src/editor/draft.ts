import { DEFAULT_SETTINGS, LIMITS, questionSchema, quizSchema, type Question, type Quiz } from '@quiz/shared';
import { t, type TextKey } from '../i18n';

export type QuestionType = Question['type'];
export const QUESTION_TYPES = ['single', 'multi', 'boolean', 'text', 'numeric', 'order'] as const;

type Common = Pick<Question, 'id' | 'text' | 'imageUrl' | 'timeLimit' | 'points'>;

const newId = () => crypto.randomUUID();
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

export function newQuiz(): Quiz {
  return { title: '', description: '', settings: { ...DEFAULT_SETTINGS }, questions: [newQuestion('single')] };
}

/** Вікторина в тому вигляді, у якому вона піде на сервер. */
export function cleaned(quiz: Quiz): Quiz {
  const trimAll = <T extends { text: string }>(items: T[]) => items.map((item) => ({ ...item, text: item.text.trim() }));
  return {
    ...quiz,
    title: quiz.title.trim(),
    description: quiz.description.trim(),
    questions: quiz.questions.map((question): Question => {
      const text = question.text.trim();
      switch (question.type) {
        case 'single':
        case 'multi':
          return { ...question, text, options: trimAll(question.options) };
        case 'order':
          return { ...question, text, items: trimAll(question.items) };
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
