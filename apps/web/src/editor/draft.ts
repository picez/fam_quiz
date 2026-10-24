import {
  DEFAULT_RULES,
  DEFAULT_SETTINGS,
  LIMITS,
  CHAIN_WORD,
  questionSchema,
  quizSchema,
  boardRoundIssues,
  duelShortfall,
  roundRulesSchema,
  type AnswerMode,
  type BlitzRound,
  type BoardCategory,
  type BoardCell,
  type BoardRound,
  type ClassicRound,
  type DuelCategory,
  type DuelQuestion,
  type Duels,
  type FinalRound,
  type Round,
  type Question,
  type Quiz,
  type RoundRules,
  rulesOf,
  categorySparesOf,
  boardSpareSource,
  cellAnswerMode,
  QUESTION_TYPES,
  REVEAL_TYPES,
  type QuestionType,
} from '@quiz/shared';
import { t, type TextKey } from '../i18n';
import { newId } from './new-id';

export { QUESTION_TYPES, type QuestionType };

/** Типи запитань, доступні в раунді: без ланцюжка в бліці й полі; сортування — скрізь. */
export function questionTypesFor(roundType: Round['type']): readonly QuestionType[] {
  return roundType === 'blitz' || roundType === 'board' ? QUESTION_TYPES.filter((type) => type !== 'chain') : QUESTION_TYPES;
}

type Common = Pick<Question, 'id' | 'text' | 'imageUrl' | 'video' | 'timeLimit' | 'points' | 'hint' | 'audio' | 'reveal'>;

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
    case 'slider':
      return { ...common, type, min: 0, max: 100, step: 1, correct: 50, tolerance: 0 };
    case 'order':
      return { ...common, type, items: blanks(LIMITS.minOrderItems) };
    case 'match':
      return {
        ...common,
        type,
        pairs: Array.from({ length: LIMITS.minPairs }, () => ({ left: blank(), right: blank() })),
      };
    case 'chain':
      return {
        ...common,
        video: null,
        type,
        words: Array.from({ length: LIMITS.minChainWords }, () => ''),
        hintSeconds: LIMITS.defaultHintSeconds,
      };
    case 'sort': {
      const categories = blanks(LIMITS.minSortCategories);
      return {
        ...common,
        video: null,
        timeLimit: Math.max(common.timeLimit, 60),
        points: LIMITS.defaultSortPoints,
        type,
        categories,
        words: Array.from({ length: LIMITS.minSortWords }, (_, index) => ({ ...blank(), categoryId: categories[index % 2].id })),
        lockSeconds: LIMITS.defaultLockSeconds,
      };
    }
  }
}

export function newQuestion(type: QuestionType): Question {
  return build(
    { id: newId(), text: '', imageUrl: null, video: null, timeLimit: LIMITS.defaultTime, points: LIMITS.defaultPoints },
    type,
  );
}

/** Запасне запитання: звичайне просте запитання з типовими часом і балами, без підказки (час і бали беруться з основного запитання). */
export function newSpare(type: QuestionType = 'single'): Question {
  return newQuestion(type);
}

/** Змінює тип, зберігаючи текст, підказку, час і бали; між single і multi зберігаються й варіанти. */
export function changeType(question: Question, type: QuestionType): Question {
  if (question.type === type) return question;
  const { id, text, imageUrl, video, timeLimit, points, hint, audio, reveal } = question;
  const keepsReveal = reveal !== undefined && (REVEAL_TYPES as readonly string[]).includes(type);
  const common: Common = {
    id,
    text,
    imageUrl,
    video,
    timeLimit,
    points,
    ...(hint === undefined ? {} : { hint }),
    ...(audio === undefined ? {} : { audio }),
    ...(keepsReveal ? { reveal } : {}),
  };

  if (question.type === 'single' && type === 'multi') {
    return { ...common, type, options: question.options, correctIds: [question.correctId] };
  }
  if (question.type === 'multi' && type === 'single') {
    const firstCorrect = question.options.find((option) => question.correctIds.includes(option.id));
    return { ...common, type, options: question.options, correctId: (firstCorrect ?? question.options[0]).id };
  }
  return build(common, type);
}

/** Ставить timeLimit усім запитанням раунду; у полі — усім клітинкам усіх категорій. Запитання з відео пропускає: вони без таймера, а їхній час повернеться, якщо прибрати відео. Меж не перевіряє: їх стереже кнопка в налаштуваннях. */
export function applyRoundTime(round: Round, seconds: number): Round {
  const timed = (question: Question): Question => (question.video === null ? { ...question, timeLimit: seconds } : question);
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
    case 'chain':
      return { ...question, id, words: [...question.words] };
    case 'sort': {
      const copies = new Map(question.categories.map((category) => [category.id, newId()]));
      return {
        ...question,
        id,
        categories: question.categories.map((category) => ({ ...category, id: copies.get(category.id) ?? newId() })),
        words: question.words.map((word) => ({ ...word, id: newId(), categoryId: copies.get(word.categoryId) ?? word.categoryId })),
      };
    }
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
    answerWindow: null,
    attempts: 1,
    check: 'auto',
    rules: { ...defaultRules(), partial: null },
    questions: [newQuestion('single')],
  };
}

/** Новий раунд «Фінал»: одне запитання, автоматична перевірка, класичні ставки; правил балів у ньому немає. */
export function newFinalRound(): FinalRound {
  return { id: newId(), type: 'final', title: '', shuffleOptions: false, check: 'auto', wagerMode: 'classic', questions: [newQuestion('single')] };
}

/** Нова клітинка поля: порожнє запитання, ціна на сотню вища за попередню (не більше максимуму). */
export function newBoardQuestion(after: Question | undefined): Question {
  const points = after === undefined ? 100 : Math.min(LIMITS.maxPoints, after.points + 100);
  return { ...newQuestion('single'), points };
}

/** Нова категорія поля: порожня назва й три порожні запитання за 100, 200, 300 з явним способом відповіді. */
export function newBoardCategory(answerMode: AnswerMode): BoardCategory {
  return {
    id: newId(),
    title: '',
    cells: [100, 200, 300].map((points) => ({
      mark: 'none',
      kind: 'normal',
      answerMode,
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
    categories: [newBoardCategory('phone'), newBoardCategory('phone'), newBoardCategory('phone')],
    answerMode: 'phone',
    check: 'auto',
    rules: defaultRules(),
  };
}

/** Змінює типовий спосіб раунду; клітинки без власного способу спершу отримують попередній спосіб раунду явно. */
export function withDefaultMode(round: BoardRound, mode: AnswerMode): BoardRound {
  return {
    ...round,
    answerMode: mode,
    categories: round.categories.map((category) => ({
      ...category,
      cells: category.cells.map((cell) => ({ ...cell, answerMode: cell.answerMode ?? round.answerMode })),
    })),
  };
}

export function newQuiz(): Quiz {
  return { title: '', description: '', settings: { ...DEFAULT_SETTINGS }, rounds: [newClassicRound()] };
}

export function newDuelQuestion(): DuelQuestion {
  return { id: newId(), text: '', accepted: [''] };
}

export function newDuelCategory(count: number): DuelCategory {
  return { id: newId(), title: '', questions: Array.from({ length: count }, newDuelQuestion) };
}

/** Увімкнені дуелі: одна категорія з трьома порожніми запитаннями й типові налаштування. */
export function newDuels(): Duels {
  return {
    categories: [newDuelCategory(LIMITS.defaultDuelQuestions)],
    questionsPerDuel: LIMITS.defaultDuelQuestions,
    timeLimit: LIMITS.defaultDuelTime,
    stake: LIMITS.defaultDuelStake,
  };
}

/** Порожній варіант: без тексту й без картинки. */
const isBlankOption = (option: { text: string; imageUrl?: string }) => option.text === '' && option.imageUrl === undefined;

/** Вікторина в тому вигляді, у якому вона піде на сервер. */
export function cleaned(quiz: Quiz): Quiz {
  const trimAll = <T extends { text: string }>(items: T[]) => items.map((item) => ({ ...item, text: item.text.trim() }));
  // Порожні рядки (наприклад, доданий останнім Enter) просто не зберігаються, якщо без них рядків
  // досить і жоден із них не позначено правильною відповіддю. Інакше їх лишаємо: про них скаже перевірка.
  // Варіант лише з картинкою не порожній.
  const withoutSpare = <T extends { id: string; text: string; imageUrl?: string }>(items: T[], min: number, mustKeep: string[] = []) => {
    const kept = items.filter((item) => !isBlankOption(item));
    const dropsNeeded = items.some((item) => isBlankOption(item) && mustKeep.includes(item.id));
    return kept.length >= min && !dropsNeeded ? kept : items;
  };
  // У впорядкуванні місце рядка має значення, тому прибираються лише порожні рядки в кінці.
  const withoutTrailing = <T extends { text: string }>(items: T[], min: number) => {
    let end = items.length;
    while (end > min && items[end - 1].text === '') end -= 1;
    return items.slice(0, end);
  };
  const cleanBody = (question: Question): Question => {
    const text = question.text.trim();
    switch (question.type) {
      case 'single':
        return { ...question, text, options: withoutSpare(trimAll(question.options), LIMITS.minOptions, [question.correctId]) };
      case 'multi': {
        const options = withoutSpare(trimAll(question.options), LIMITS.minOptions, question.correctIds);
        const correctIds = question.correctIds.filter((id) => options.some((option) => option.id === id));
        return { ...question, text, options, correctIds };
      }
      case 'order': {
        // Порожній підпис зникає з запитання, а не лишається порожнім рядком.
        const { topLabel, bottomLabel, ...rest } = question;
        const top = topLabel?.trim() ?? '';
        const bottom = bottomLabel?.trim() ?? '';
        return {
          ...rest,
          text,
          items: withoutTrailing(trimAll(question.items), LIMITS.minOrderItems),
          ...(top === '' ? {} : { topLabel: top }),
          ...(bottom === '' ? {} : { bottomLabel: bottom }),
        };
      }
      case 'match': {
        // Як і в впорядкуванні, прибираються лише порожні пари в кінці.
        const trimmed = question.pairs.map((pair) => ({ left: trimAll([pair.left])[0], right: trimAll([pair.right])[0] }));
        let end = trimmed.length;
        while (end > LIMITS.minPairs && trimmed[end - 1].left.text === '' && trimmed[end - 1].right.text === '') end -= 1;
        return { ...question, text, pairs: trimmed.slice(0, end) };
      }
      case 'chain': {
        const words = question.words.map((word) => word.normalize('NFC').trim().replace(/\s+/g, ' '));
        let end = words.length;
        while (end > LIMITS.minChainWords && words[end - 1] === '') end -= 1;
        return { ...question, text, words: words.slice(0, end) };
      }
      case 'sort': {
        const words = question.words.map((word) => ({ ...word, text: word.text.trim() }));
        let end = words.length;
        while (end > LIMITS.minSortWords && words[end - 1].text === '') end -= 1;
        return { ...question, text, categories: trimAll(question.categories), words: words.slice(0, end) };
      }
      case 'text':
        return { ...question, text, accepted: question.accepted.map((s) => s.trim()).filter((s) => s !== '') };
      case 'slider': {
        // Порожня одиниця й порожня межа нуля не зберігаються: ключів немає, як у старих запитань.
        const { unit, zeroBeyond, ...rest } = question;
        const trimmedUnit = unit?.trim() ?? '';
        return {
          ...rest,
          text,
          ...(trimmedUnit === '' ? {} : { unit: trimmedUnit }),
          ...(zeroBeyond === undefined ? {} : { zeroBeyond }),
        };
      }
      default:
        return { ...question, text };
    }
  };
  // Порожня підказка не зберігається: ключа немає, як у старих запитань.
  const cleanQuestion = (question: Question): Question => {
    const { hint, reveal, ...rest } = cleanBody(question);
    const trimmed = hint?.trim() ?? '';
    // Режим проявлення без картинки (її прибрали) зникає тихо.
    const kept = reveal !== undefined && rest.imageUrl !== null && rest.video === null ? { ...rest, reveal } : rest;
    return (trimmed === '' ? kept : { ...kept, hint: trimmed }) as Question;
  };
  // У фіналі бали — ставки, поля балів за слово немає: прихована ціна не має блокувати збереження.
  const inFinal = (question: Question): Question =>
    question.type === 'sort' && question.words.length > 0 && question.points * question.words.length > LIMITS.maxPoints
      ? { ...question, points: Math.floor(LIMITS.maxPoints / question.words.length) }
      : question;
  const cleanDuels = (duels: Duels): Duels => ({
    ...duels,
    categories: duels.categories.map((category) => {
      const questions = category.questions.map((question) => ({
        ...question,
        text: question.text.trim(),
        accepted: question.accepted.map((s) => s.trim()).filter((s) => s !== ''),
      }));
      // Порожні запитання в кінці прибираються, поки їх не менше, ніж потрібно для дуелі.
      let end = questions.length;
      const need = Number.isInteger(duels.questionsPerDuel) ? duels.questionsPerDuel : 1;
      while (end > Math.max(1, need) && questions[end - 1].text === '' && questions[end - 1].accepted.length === 0) end -= 1;
      return { ...category, title: category.title.trim(), questions: questions.slice(0, end) };
    }),
  });
  const { spares, ...whole } = quiz;
  return {
    ...whole,
    title: quiz.title.trim(),
    description: quiz.description.trim(),
    rounds: quiz.rounds.map((round) => {
      const title = round.title.trim();
      if (round.type === 'final') return { ...round, title, questions: round.questions.map((question) => inFinal(cleanQuestion(question))) };
      if (round.type !== 'board') return { ...round, title, questions: round.questions.map(cleanQuestion) };
      return {
        ...round,
        title,
        categories: round.categories.map(({ spares: categorySpares, ...category }) => ({
          ...category,
          title: category.title.trim(),
          cells: category.cells.map((cell) => ({ ...cell, question: cleanQuestion(cell.question) })),
          ...(categorySpares === undefined || categorySpares.length === 0 ? {} : { spares: categorySpares.map(cleanQuestion) }),
        })),
      };
    }),
    ...(quiz.duels === undefined ? {} : { duels: cleanDuels(quiz.duels) }),
    ...(spares === undefined || spares.length === 0 ? {} : { spares: spares.map(cleanQuestion) }),
  };
}

/** `revealOk` — чи діє в цьому місці картинка, що проявляється (класика й звичайна клітинка поля з телефона). */
function problemKey(question: Question, revealOk = true): TextKey | null {
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
      if (question.options.some(isBlankOption)) return 'problemEmptyOption';
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
    case 'slider': {
      const { min, max, step, correct, tolerance, zeroBeyond } = question;
      const steps = (max - min) / step;
      if (![min, max, step].every(Number.isFinite) || min >= max || step <= 0 || steps > LIMITS.maxSliderSteps || Math.abs(steps - Math.round(steps)) > 1e-9) {
        return 'problemSliderRange';
      }
      if (!Number.isFinite(correct) || !Number.isFinite(tolerance) || correct < min || correct > max || tolerance < 0) return 'problemSliderCorrect';
      if (zeroBeyond !== undefined && !(zeroBeyond > tolerance)) return 'problemSliderZero';
      break;
    }
    case 'chain':
      if (question.words.some((word) => word === '')) return 'problemEmptyWord';
      if (question.words.map((word) => word.normalize('NFC')).some((word) => word.length < 2 || word.length > LIMITS.chainWord || !CHAIN_WORD.test(word))) {
        return 'problemChainWord';
      }
      if (
        !Number.isInteger(question.hintSeconds) ||
        question.hintSeconds < LIMITS.minHintSeconds ||
        question.hintSeconds > LIMITS.maxHintSeconds
      ) {
        return 'problemHintSeconds';
      }
      break;
    case 'sort': {
      if (question.categories.some((category) => category.text === '') || question.words.some((word) => word.text === '')) {
        return 'problemSortText';
      }
      if (question.categories.some((category) => !question.words.some((word) => word.categoryId === category.id))) {
        return 'problemSortCategory';
      }
      const keys = question.words.map((word) => word.text.normalize('NFC').trim().toLowerCase());
      if (new Set(keys).size !== keys.length) return 'problemSortDuplicate';
      if (question.points * question.words.length > LIMITS.maxPoints) return 'problemSortPoints';
      if (
        !Number.isInteger(question.lockSeconds) ||
        question.lockSeconds < LIMITS.minLockSeconds ||
        question.lockSeconds > LIMITS.maxLockSeconds
      ) {
        return 'problemLockSeconds';
      }
      break;
    }
    case 'boolean':
      break;
  }
  const { audio } = question;
  if (
    audio !== undefined &&
    (!Number.isInteger(audio.start) ||
      audio.start < 0 ||
      audio.start > LIMITS.maxVideoStart ||
      !Number.isInteger(audio.duration) ||
      audio.duration < LIMITS.minAudioSeconds ||
      audio.duration > LIMITS.maxAudioSeconds)
  ) {
    return 'problemAudio';
  }
  if (question.reveal !== undefined && !revealOk) return 'problemRevealPlace';
  return questionSchema.safeParse(question).success ? null : 'problemGeneric';
}

/** Чи діє картинка, що проявляється, у клітинці поля: лише звичайна, з відповіддю з телефона. */
const cellRevealOk = (round: BoardRound, cell: BoardCell) => cell.kind === 'normal' && cellAnswerMode(round, cell) === 'phone';

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
          if (problemKey(cells[index].question, cellRevealOk(current, cells[index])) !== null) return { round, question: question + index, cell: { category, index } };
        }
        question += cells.length;
      }
      continue;
    }
    const question = current.questions.findIndex((q) => problemKey(q, current.type === 'classic') !== null);
    if (question !== -1) return { round, question, cell: null };
  }
  return null;
}

/** Текст проблеми запитання; числа меж аудіо підставляються з LIMITS. */
const problemText = (key: TextKey, index: number) => t(key, { index, min: LIMITS.minAudioSeconds, max: LIMITS.maxAudioSeconds });

/** Повідомлення про проблему клітинки: те саме, що для запитання, але з категорією. */
function cellProblem(category: number, index: number, key: TextKey): string {
  const text = problemText(key, index);
  return t('problemCell', { category, problem: text.charAt(0).toLowerCase() + text.slice(1) });
}

/** Проблеми розділу «Дуелі»: налаштування, назви, запитання, їх кількість. */
function duelProblems(duels: Duels): string[] {
  const problems: string[] = [];
  const inRange = (value: number, min: number, max: number) => Number.isInteger(value) && value >= min && value <= max;
  if (
    !inRange(duels.questionsPerDuel, 1, LIMITS.maxDuelQuestions) ||
    !inRange(duels.timeLimit, LIMITS.minTime, LIMITS.maxTime) ||
    !inRange(duels.stake, 0, LIMITS.maxDuelStake)
  ) {
    problems.push(t('problemDuelSettings'));
  }
  duels.categories.forEach((category, categoryIndex) => {
    if (category.title === '') problems.push(t('problemDuelTitle', { index: categoryIndex + 1 }));
    const name = category.title === '' ? t('duelCategoryN', { index: categoryIndex + 1 }) : category.title;
    category.questions.forEach((question, index) => {
      if (question.text === '' || question.accepted.length === 0) {
        problems.push(t('problemDuelQuestion', { category: name, index: index + 1 }));
      }
    });
    if (category.questions.length < duels.questionsPerDuel) {
      problems.push(t('problemDuelShort', { category: name, needed: duels.questionsPerDuel }));
    }
  });
  return problems;
}

/** Проблеми розділу «Запасні запитання»: кожне запасне перевіряється так само, як запитання. */
function spareProblems(spares: Question[]): string[] {
  const problems: string[] = [];
  spares.forEach((spare, index) => {
    const key = problemKey(spare);
    if (key === null) return;
    // «Запитання N: текст» → «Запасне N: текст».
    const problem = problemText(key, index + 1).replace(/^[^:]*:\s*/, '');
    problems.push(t('problemSpare', { index: index + 1, problem }));
  });
  return problems;
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
    if (round.type !== 'final' && !roundRulesSchema.safeParse(rulesOf(round)).success) problems.push(where(t('problemRules')));
    if (round.type === 'board') {
      round.categories.forEach((category, categoryIndex) => {
        if (category.title === '') problems.push(where(t('problemCategoryNoTitle', { category: categoryIndex + 1 })));
        const name = category.title === '' ? t('boardCategoryPlaceholder', { index: categoryIndex + 1 }) : category.title;
        (category.spares ?? []).forEach((spare, index) => {
          const key = problemKey(spare);
          if (key === null) return;
          const problem = problemText(key, index + 1).replace(/^[^:]*:\s*/, '');
          problems.push(where(t('problemCategorySpare', { category: name, index: index + 1, problem })));
        });
        category.cells.forEach((cell, index) => {
          const key = problemKey(cell.question, cellRevealOk(round, cell));
          if (key !== null) problems.push(where(cellProblem(categoryIndex + 1, index + 1, key)));
        });
      });
      for (const issue of boardRoundIssues(round)) {
        problems.push(where(t(issue === 'too_many_questions' ? 'problemBoardTooMany' : 'problemGeneric', { index: 1 })));
      }
      return;
    }
    round.questions.forEach((question, index) => {
      const key = problemKey(question, round.type === 'classic');
      if (key !== null) problems.push(where(problemText(key, index + 1)));
    });
  });
  if (draft.duels !== undefined) problems.push(...duelProblems(draft.duels));
  if (draft.spares !== undefined) problems.push(...spareProblems(draft.spares));
  if (draft.settings.buffs?.includes('swap') && draft.spares === undefined && categorySparesOf(draft).length === 0) problems.push(t('problemSparesEmpty'));
  const prices = Object.values(draft.settings.debuffPrices ?? {});
  if (prices.some((price) => !Number.isInteger(price) || price < LIMITS.minDebuffPrice || price > LIMITS.maxDebuffPrice)) {
    problems.push(t('problemDebuffPrice', { min: LIMITS.minDebuffPrice, max: LIMITS.maxDebuffPrice }));
  }
  // Та сама умова, що в грі: без досить запитань до межі кнопка дуелі не з’явиться ніколи.
  const shortfall = duelShortfall(draft);
  if (shortfall !== null) problems.push(t('problemDuelUnreachable', { needed: shortfall }));
  // Остання перевірка тією самою схемою, що й на сервері; коди помилок дуелей читаються як речення.
  if (problems.length === 0) {
    const parsed = quizSchema.safeParse(draft);
    if (!parsed.success) {
      const messages = parsed.error.issues.map((issue) => issue.message);
      if (messages.includes('duel_category_short')) problems.push(t('problemDuelShortAny'));
      if (messages.includes('duplicate_duel_ids')) problems.push(t('problemDuelDuplicate'));
      if (messages.includes('spare_type')) problems.push(t('problemSpareType'));
      if (messages.includes('spare_video')) problems.push(t('problemSpareVideo'));
      if (messages.includes('duplicate_spare_ids')) problems.push(t('problemSpareDuplicate'));
      if (messages.includes('spares_empty')) problems.push(t('problemSparesEmpty'));
      if (messages.includes('buff_unavailable') || messages.includes('duplicate_powers')) problems.push(t('problemPowers'));
      if (problems.length === 0) problems.push(t('problemGeneric', { index: 1 }));
    }
  }
  return problems;
}

export interface SwapGaps {
  /** Хоч одна категорія має власні запасні. */
  anyCategory: boolean;
  /** Категорії без власних запасних, коли поле в режимі категорій: «Поле · Річки» (назва раунду порожня — «Раунд N», категорії — «Категорія N»). */
  emptyCategories: string[];
  /** Є класичний раунд, а загального пулу немає. */
  classicWithoutPool: boolean;
  /** Є поле, жодна категорія не має запасних, а загальні є: поле бере загальні. */
  legacyBoard: boolean;
}

/** Де «Заміна запитання» не матиме запасного; не блокує збереження. */
export function swapGaps(quiz: Quiz): SwapGaps {
  const anyCategory = boardSpareSource(quiz) === 'category';
  const hasPool = (quiz.spares?.length ?? 0) > 0;
  const emptyCategories: string[] = [];
  let hasBoard = false;
  if (anyCategory) {
    quiz.rounds.forEach((round, roundIndex) => {
      if (round.type !== 'board') return;
      const roundName = round.title.trim() === '' ? t('roundN', { index: roundIndex + 1 }) : round.title.trim();
      round.categories.forEach((category, categoryIndex) => {
        if ((category.spares?.length ?? 0) > 0) return;
        const name = category.title.trim() === '' ? t('boardCategoryPlaceholder', { index: categoryIndex + 1 }) : category.title.trim();
        emptyCategories.push(`${roundName} · ${name}`);
      });
    });
  }
  quiz.rounds.forEach((round) => {
    if (round.type === 'board') hasBoard = true;
  });
  return {
    anyCategory,
    emptyCategories,
    classicWithoutPool: !hasPool && quiz.rounds.some((round) => round.type === 'classic'),
    legacyBoard: hasBoard && !anyCategory && hasPool,
  };
}
