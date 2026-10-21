import {
  DEFAULT_ANSWER_WINDOW,
  DEFAULT_RULES,
  DEFAULT_SETTINGS,
  LIMITS,
  questionSchema,
  quizSchema,
  boardRoundIssues,
  roundRulesSchema,
  type BlitzRound,
  type BoardCategory,
  type BoardRound,
  type ClassicRound,
  type Round,
  type Question,
  type Quiz,
  type RoundRules,
} from '@quiz/shared';
import { t, type TextKey } from '../i18n';
import { newId } from './new-id';

export type QuestionType = Question['type'];
export const QUESTION_TYPES = ['single', 'multi', 'boolean', 'text', 'numeric', 'order', 'match'] as const;

type Common = Pick<Question, 'id' | 'text' | 'imageUrl' | 'timeLimit' | 'points'>;

const blank = () => ({ id: newId(), text: '' });
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
    case 'match':
      return {
        ...common,
        type,
        pairs: Array.from({ length: LIMITS.minPairs }, () => ({ left: blank(), right: blank() })),
      };
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

/** Ставить timeLimit усім запитанням раунду; у полі — усім клітинкам усіх категорій. Меж не перевіряє: їх стереже кнопка в налаштуваннях. */
export function applyRoundTime(round: Round, seconds: number): Round {
  const timed = (question: Question): Question => ({ ...question, timeLimit: seconds });
  if (round.type === 'board') {
    return {
      ...round,
      categories: round.categories.map((category) => ({
        ...category,
        cells: category.cells.map((cell) => ({ ...cell, question: timed(cell.question) })),
      })),
    };
  }
  return { ...round, questions: round.questions.map(timed) } as Round;
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
    case 'match':
      return {
        ...question,
        id,
        pairs: question.pairs.map((pair) => ({ left: { ...pair.left, id: newId() }, right: { ...pair.right, id: newId() } })),
      };
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

/** Правила за замовчуванням, скоповані: редактор змінює їх на місці, а DEFAULT_RULES спільний для всіх. */
export function defaultRules(): RoundRules {
  return { ...DEFAULT_RULES, streak: DEFAULT_RULES.streak === null ? null : { ...DEFAULT_RULES.streak } };
}

/** Новий класичний раунд з одним порожнім запитанням і нинішньою поведінкою гри. */
export function newClassicRound(): ClassicRound {
  return {
    id: newId(),
    type: 'classic',
    title: '',
    speedBonus: true,
    shuffleOptions: false,
    rules: defaultRules(),
    questions: [newQuestion('single')],
  };
}

/** Новий раунд бліцу: вікно відповіді за замовчуванням, одна спроба, автоматична перевірка. */
export function newBlitzRound(): BlitzRound {
  return {
    id: newId(),
    type: 'blitz',
    title: '',
    shuffleOptions: false,
    answerWindow: DEFAULT_ANSWER_WINDOW,
    attempts: 1,
    check: 'auto',
    rules: { ...defaultRules(), partial: null },
    questions: [newQuestion('single')],
  };
}

/** Нова клітинка поля: порожнє запитання, ціна на сотню вища за попередню (не більше максимуму). */
export function newBoardQuestion(after: Question | undefined): Question {
  const points = after === undefined ? 100 : Math.min(LIMITS.maxPoints, after.points + 100);
  return { ...newQuestion('single'), points };
}

/** Нова категорія поля: порожня назва й три порожні запитання за 100, 200, 300. */
export function newBoardCategory(): BoardCategory {
  return {
    id: newId(),
    title: '',
    cells: [100, 200, 300].map((points) => ({
      mark: 'none',
      kind: 'normal',
      penalty: 'none',
      question: { ...newQuestion('single'), points },
    })),
  };
}

/** Нове поле: три порожні категорії, відповідь на телефоні з автоматичною перевіркою. */
export function newBoardRound(): BoardRound {
  return {
    id: newId(),
    type: 'board',
    title: '',
    shuffleOptions: false,
    categories: [newBoardCategory(), newBoardCategory(), newBoardCategory()],
    answerMode: 'phone',
    check: 'auto',
    rules: defaultRules(),
  };
}

export function newQuiz(): Quiz {
  return { title: '', description: '', settings: { ...DEFAULT_SETTINGS }, rounds: [newClassicRound()] };
}

/** Вікторина в тому вигляді, у якому вона піде на сервер. */
export function cleaned(quiz: Quiz): Quiz {
  const trimAll = <T extends { text: string }>(items: T[]) => items.map((item) => ({ ...item, text: item.text.trim() }));
  // Порожні рядки (наприклад, доданий останнім Enter) просто не зберігаються, якщо без них рядків
  // досить і жоден із них не позначено правильною відповіддю. Інакше їх лишаємо: про них скаже перевірка.
  const withoutSpare = <T extends { id: string; text: string }>(items: T[], min: number, mustKeep: string[] = []) => {
    const kept = items.filter((item) => item.text !== '');
    const dropsNeeded = items.some((item) => item.text === '' && mustKeep.includes(item.id));
    return kept.length >= min && !dropsNeeded ? kept : items;
  };
  // У впорядкуванні місце рядка має значення, тому прибираються лише порожні рядки в кінці.
  const withoutTrailing = <T extends { text: string }>(items: T[], min: number) => {
    let end = items.length;
    while (end > min && items[end - 1].text === '') end -= 1;
    return items.slice(0, end);
  };
  const cleanQuestion = (question: Question): Question => {
    const text = question.text.trim();
    switch (question.type) {
      case 'single':
        return { ...question, text, options: withoutSpare(trimAll(question.options), LIMITS.minOptions, [question.correctId]) };
      case 'multi': {
        const options = withoutSpare(trimAll(question.options), LIMITS.minOptions, question.correctIds);
        const correctIds = question.correctIds.filter((id) => options.some((option) => option.id === id));
        return { ...question, text, options, correctIds };
      }
      case 'order':
        return { ...question, text, items: withoutTrailing(trimAll(question.items), LIMITS.minOrderItems) };
      case 'match': {
        // Як і в впорядкуванні, прибираються лише порожні пари в кінці.
        const trimmed = question.pairs.map((pair) => ({ left: trimAll([pair.left])[0], right: trimAll([pair.right])[0] }));
        let end = trimmed.length;
        while (end > LIMITS.minPairs && trimmed[end - 1].left.text === '' && trimmed[end - 1].right.text === '') end -= 1;
        return { ...question, text, pairs: trimmed.slice(0, end) };
      }
      case 'text':
        return { ...question, text, accepted: question.accepted.map((s) => s.trim()).filter((s) => s !== '') };
      default:
        return { ...question, text };
    }
  };
  return {
    ...quiz,
    title: quiz.title.trim(),
    description: quiz.description.trim(),
    rounds: quiz.rounds.map((round) => {
      const title = round.title.trim();
      if (round.type !== 'board') return { ...round, title, questions: round.questions.map(cleanQuestion) };
      return {
        ...round,
        title,
        categories: round.categories.map((category) => ({
          ...category,
          title: category.title.trim(),
          cells: category.cells.map((cell) => ({ ...cell, question: cleanQuestion(cell.question) })),
        })),
      };
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
    case 'match':
      if (question.pairs.some((pair) => pair.left.text === '' || pair.right.text === '')) return 'problemEmptyPair';
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

export interface ProblemPlace {
  round: number;
  /** Номер запитання в раунді (для поля — у порядку клітинок). */
  question: number;
  /** Клітинка поля; null у класичному раунді та бліці. */
  cell: { category: number; index: number } | null;
}

/** Де (раунд і запитання, з нуля) перша проблема, або null. */
export function firstProblem(quiz: Quiz): ProblemPlace | null {
  const rounds = cleaned(quiz).rounds;
  for (let round = 0; round < rounds.length; round += 1) {
    const current = rounds[round];
    if (current.type === 'board') {
      let question = 0;
      for (let category = 0; category < current.categories.length; category += 1) {
        const { title, cells } = current.categories[category];
        if (title === '') return { round, question, cell: { category, index: 0 } };
        for (let index = 0; index < cells.length; index += 1) {
          if (problemKey(cells[index].question) !== null) return { round, question: question + index, cell: { category, index } };
        }
        question += cells.length;
      }
      continue;
    }
    const question = current.questions.findIndex((q) => problemKey(q) !== null);
    if (question !== -1) return { round, question, cell: null };
  }
  return null;
}

/** Повідомлення про проблему клітинки: те саме, що для запитання, але з категорією. */
function cellProblem(category: number, index: number, key: TextKey): string {
  const text = t(key, { index });
  return t('problemCell', { category, problem: text.charAt(0).toLowerCase() + text.slice(1) });
}

/** Що заважає зберегти вікторину; порожній список означає, що все гаразд. */
export function problemsOf(quiz: Quiz): string[] {
  const draft = cleaned(quiz);
  const problems: string[] = [];
  if (draft.title === '') problems.push(t('problemTitle'));
  const several = draft.rounds.length > 1;
  draft.rounds.forEach((round, roundIndex) => {
    // З кількома раундами кожне повідомлення каже, у якому раунді шукати.
    const where = (text: string) => (several ? `${t('problemRound', { round: roundIndex + 1 })} ${text}` : text);
    if (!roundRulesSchema.safeParse(round.rules).success) problems.push(where(t('problemRules')));
    if (round.type === 'board') {
      round.categories.forEach((category, categoryIndex) => {
        if (category.title === '') problems.push(where(t('problemCategoryNoTitle', { category: categoryIndex + 1 })));
        category.cells.forEach((cell, index) => {
          const key = problemKey(cell.question);
          if (key !== null) problems.push(where(cellProblem(categoryIndex + 1, index + 1, key)));
        });
      });
      for (const issue of boardRoundIssues(round)) {
        problems.push(where(t(issue === 'too_many_questions' ? 'problemBoardTooMany' : 'problemGeneric', { index: 1 })));
      }
      return;
    }
    round.questions.forEach((question, index) => {
      const key = problemKey(question);
      if (key !== null) problems.push(where(t(key, { index: index + 1 })));
    });
  });
  // Остання перевірка тією самою схемою, що й на сервері.
  if (problems.length === 0 && !quizSchema.safeParse(draft).success) problems.push(t('problemGeneric', { index: 1 }));
  return problems;
}
