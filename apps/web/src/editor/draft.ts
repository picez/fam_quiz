import {
  DEFAULT_RULES,
  DEFAULT_SETTINGS,
  LIMITS,
  CHAIN_WORD,
  PIN_MAP_ASPECT,
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
  answerKey,
  cloudKey,
  roundQuestions,
  REVEAL_TYPES,
  type QuestionType,
} from '@quiz/shared';
import { t, type TextKey } from '../i18n';
import { newId } from './new-id';

export { QUESTION_TYPES, type QuestionType };

/**
 * Типи запитань, доступні в раунді: бліц — без ланцюжка, «Хто я?», точки, стіни, опитування й хмари;
 * поле — без ланцюжка, опитування й хмари; фінал — без «Хто я?», точки, стіни, «100 до 1», опитування й хмари;
 * сортування — скрізь; класика — усі.
 * Блеф — лише класика (поле, бліц і фінал його не мають).
 * «100 до 1» — класика й поле (звичайна клітинка з телефона; решту клітинок перевіряє схема), не бліц і не фінал.
 */
export function questionTypesFor(roundType: Round['type']): readonly QuestionType[] {
  const unscored = (type: QuestionType) => type === 'poll' || type === 'wordcloud';
  if (roundType === 'blitz') {
    return QUESTION_TYPES.filter((type) => type !== 'chain' && type !== 'clues' && type !== 'pin' && type !== 'wall' && type !== 'survey' && type !== 'bluff' && !unscored(type));
  }
  if (roundType === 'board') return QUESTION_TYPES.filter((type) => type !== 'chain' && type !== 'bluff' && !unscored(type));
  if (roundType === 'final') {
    return QUESTION_TYPES.filter((type) => type !== 'clues' && type !== 'pin' && type !== 'wall' && type !== 'survey' && type !== 'bluff' && !unscored(type));
  }
  return QUESTION_TYPES;
}

/**
 * «Хмари слів», що стоять раніше за запитання (roundIndex, questionIndex) у класиці: у попередніх раундах і в цьому ж раунді вище.
 * Номер — місце хмари серед усіх хмар вікторини (від 1). Поза класикою джерел немає.
 */
export function cloudSources(quiz: Pick<Quiz, 'rounds'>, roundIndex: number, questionIndex: number): { n: number; id: string; text: string }[] {
  const round = quiz.rounds[roundIndex];
  if (round === undefined || round.type !== 'classic') return [];
  const all = quiz.rounds.flatMap((r, ri) =>
    roundQuestions(r).flatMap((question, qi) =>
      question.type === 'wordcloud' ? [{ id: question.id, text: question.text, before: ri < roundIndex || (ri === roundIndex && qi < questionIndex) }] : [],
    ),
  );
  return all.flatMap(({ id, text, before }, index) => (before ? [{ n: index + 1, id, text }] : []));
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
    case 'clues':
      return { ...common, video: null, type, clues: ['', '', ''], accepted: [''], interval: LIMITS.defaultClueSeconds };
    case 'pin':
      return {
        ...common,
        video: null,
        imageUrl: null,
        type,
        map: 'world',
        aspect: PIN_MAP_ASPECT.world,
        target: { x: 0.5, y: 0.5 },
        fullRadius: LIMITS.defaultPinFull,
        zeroRadius: LIMITS.defaultPinZero,
      };
    case 'wall':
      return {
        ...common,
        video: null,
        type,
        timeLimit: LIMITS.defaultWallTime,
        mistakes: LIMITS.defaultWallMistakes,
        groups: Array.from({ length: 4 }, () => ({ id: newId(), name: '', tiles: blanks(4) })),
      };
    case 'survey':
      return {
        ...common,
        type,
        timeLimit: LIMITS.defaultSurveyTime,
        answers: LIMITS.defaultSurveyAnswers,
        // popularity 0 — чернетка: редактор вимагає заповнення, схему проходить лише заповнена.
        rows: Array.from({ length: 5 }, () => ({ id: newId(), text: '', popularity: 0, accepted: [] as string[] })),
      };
    case 'bluff':
      return { ...common, video: null, type, timeLimit: LIMITS.defaultBluffTime, choiceTime: LIMITS.defaultChoiceTime, accepted: [''], lies: ['', ''] };
    case 'poll':
      return { ...common, type, points: 0, options: blanks(LIMITS.minOptions) };
    case 'wordcloud':
      return { ...common, type, points: 0, words: LIMITS.maxCloudWords };
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
  const unscored = (value: QuestionType) => value === 'poll' || value === 'wordcloud';
  // Опитування й хмара без балів; з них в інший тип повертається типова ціна.
  const common: Common = {
    id,
    text,
    imageUrl,
    video,
    timeLimit,
    points: unscored(type) ? 0 : unscored(question.type) ? LIMITS.defaultPoints : points,
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
  if (question.type === 'single' && type === 'poll') return { ...common, type, options: question.options };
  if (question.type === 'multi' && type === 'poll') return { ...common, type, options: question.options };
  if (question.type === 'poll' && type === 'single') return { ...common, type, options: question.options, correctId: question.options[0].id };
  if (question.type === 'poll' && type === 'multi') return { ...common, type, options: question.options, correctIds: [question.options[0].id] };
  if (question.type === 'text' && type === 'survey') {
    // Перше написання тексту стає першим рядком дошки.
    const made = build(common, type);
    const first = question.accepted[0] ?? '';
    return made.type === 'survey' ? { ...made, rows: made.rows.map((row, index) => (index === 0 ? { ...row, text: first } : row)) } : made;
  }
  if ((question.type === 'text' || question.type === 'clues') && type === 'bluff') {
    // Правда — наявні написання; запасні вигадки й час вибору — типові.
    const made = build(common, type);
    return made.type === 'bluff' ? { ...made, accepted: [...question.accepted] } : made;
  }
  if (question.type === 'bluff' && type === 'text') return { ...build(common, type), accepted: [...question.accepted] } as Question;
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
    case 'clues':
      return { ...question, id, clues: [...question.clues], accepted: [...question.accepted] };
    case 'pin':
      return { ...question, id, target: { ...question.target } };
    case 'wall':
      return {
        ...question,
        id,
        groups: question.groups.map((group) => ({ ...group, id: newId(), tiles: group.tiles.map((tile) => ({ ...tile, id: newId() })) })),
      };
    case 'bluff':
      return { ...question, id, accepted: [...question.accepted], lies: [...question.lies] };
    case 'survey':
      return { ...question, id, rows: question.rows.map((row) => ({ ...row, id: newId(), accepted: [...row.accepted] })) };
    case 'poll':
      return { ...question, id, options: question.options.map((option) => ({ ...option, id: newId() })) };
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

/**
 * Клітинка, узгоджена зі своїм видом і способом: «Хто я?» на звичайній усній клітинці отримує найменший (схований) інтервал,
 * щоб не вимагати зайвого часу; картинка, що проявляється, поза звичайною клітинкою з телефона втрачає режим. Без змін — той самий об'єкт.
 */
export function fitCell(round: BoardRound, cell: BoardCell): BoardCell {
  let next = cell;
  const voice = next.kind === 'normal' && cellAnswerMode(round, next) === 'voice';
  if (next.question.type === 'clues' && voice && next.question.interval !== LIMITS.minClueSeconds) {
    next = { ...next, question: { ...next.question, interval: LIMITS.minClueSeconds } };
  }
  if (next.question.reveal === undefined || (next.kind === 'normal' && cellAnswerMode(round, next) === 'phone')) return next;
  const { reveal: _reveal, ...question } = next.question;
  return { ...next, question: question as Question };
}

/** Змінює типовий спосіб раунду; клітинки без власного способу спершу отримують попередній спосіб раунду явно; усні клітинки узгоджуються (fitCell). */
export function withDefaultMode(round: BoardRound, mode: AnswerMode): BoardRound {
  const next = { ...round, answerMode: mode };
  return {
    ...next,
    categories: round.categories.map((category) => ({
      ...category,
      cells: category.cells.map((cell) => fitCell(next, { ...cell, answerMode: cell.answerMode ?? round.answerMode })),
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

/** Рядок дошки «100 до 1» без тексту, написань і популярності (0 — чернетка). */
const isBlankSurveyRow = (row: { text: string; popularity: number; accepted: string[] }) =>
  row.text === '' && row.accepted.length === 0 && !(row.popularity > 0);

/** Заповнений рядок дошки: текст і популярність від 1 (верхню межу стереже сума). */
const isFilledSurveyRow = (row: { text: string; popularity: number }) => row.text !== '' && Number.isInteger(row.popularity) && row.popularity >= 1;

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
      case 'poll':
        return { ...question, text, options: withoutSpare(trimAll(question.options), LIMITS.minOptions) };
      case 'wall':
        return { ...question, text, groups: question.groups.map((group) => ({ ...group, name: group.name.trim(), tiles: trimAll(group.tiles) })) };
      case 'survey': {
        // Порожні рядки не зберігаються, якщо без них рядків досить; з хмарою без жодного заповненого рядка запасних немає.
        const rows = question.rows.map((row) => ({ ...row, text: row.text.trim(), accepted: row.accepted.map((s) => s.trim()).filter((s) => s !== '') }));
        const kept = rows.filter((row) => !isBlankSurveyRow(row));
        const spareOff = question.cloudId !== undefined && kept.length === 0;
        return { ...question, text, rows: kept.length >= LIMITS.minSurveyRows ? kept : spareOff ? [] : rows };
      }
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
      case 'bluff': {
        // Правда — перше написання: порожня лишається, щоб про неї сказала перевірка; порожні додаткові написання відкидаються.
        const [truth = '', ...others] = question.accepted.map((s) => s.trim());
        const spares = question.lies.map((lie) => lie.trim());
        const filledSpares = spares.filter((lie) => lie !== '');
        return {
          ...question,
          text,
          accepted: [truth, ...others.filter((s) => s !== '')],
          lies: filledSpares.length >= LIMITS.minBluffSpares ? filledSpares : spares,
        };
      }
      case 'clues':
        return {
          ...question,
          text,
          clues: question.clues.map((clue) => clue.trim()),
          accepted: question.accepted.map((s) => s.trim()).filter((s) => s !== ''),
        };
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

/** Що дозволяє місце запитання: картинка, що проявляється, «Хто я?», точка. */
interface Place {
  reveal: boolean;
  clues: boolean;
  pin: boolean;
  /** Стіна зв'язків: класика й звичайна клітинка з телефона. */
  wall: boolean;
  /** Опитування й хмара: лише класика. */
  vote: boolean;
  /** Блеф: лише класика. */
  bluff: boolean;
  /** «100 до 1»: класика й звичайна клітинка з телефона. */
  survey: boolean;
  /** Id «хмар слів» вище в класиці, з яких можна збирати дошку; null — на полі й поза класикою джерела з хмари немає. */
  clouds: readonly string[] | null;
  /** Усна клітинка: інтервал підказок схований, тож порада «зменште інтервал» недоречна. */
  voice: boolean;
}

const ANYWHERE: Place = { reveal: true, clues: true, pin: true, wall: true, vote: true, bluff: true, survey: true, clouds: [], voice: false };
/** Бліц і фінал: нічого з нового. Класика — усе, а хмари для «100 до 1» — ті, що вище. */
const roundPlace = (quiz: Quiz, roundIndex: number, questionIndex: number): Place =>
  quiz.rounds[roundIndex].type === 'classic'
    ? { ...ANYWHERE, clouds: cloudSources(quiz, roundIndex, questionIndex).map((cloud) => cloud.id) }
    : { reveal: false, clues: false, pin: false, wall: false, vote: false, bluff: false, survey: false, clouds: null, voice: false };
/** Клітинка поля: усе — на звичайній з телефона; «Хто я?» — ще й на усній; бліц-клітинка — нічого. */
const cellPlace = (round: BoardRound, cell: BoardCell): Place => {
  const normal = cell.kind === 'normal';
  const phone = normal && cellAnswerMode(round, cell) === 'phone';
  return { reveal: phone, clues: normal, pin: phone, wall: phone, vote: false, bluff: false, survey: phone, clouds: null, voice: normal && !phone };
};

/** Чи вистачає часу останній підказці: (n − 1) × інтервал + хвіст ≤ час. */
const lastClueAt = (question: Extract<Question, { type: 'clues' }>) => (question.clues.length - 1) * question.interval;

function problemKey(question: Question, place: Place = ANYWHERE): TextKey | null {
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
    case 'clues': {
      if (question.clues.some((clue) => clue === '')) return 'problemClueEmpty';
      if (question.accepted.length === 0) return 'problemNoAccepted';
      const { interval } = question;
      if (!Number.isInteger(interval) || interval < LIMITS.minClueSeconds || interval > LIMITS.maxClueSeconds) return 'problemCluesInterval';
      if (lastClueAt(question) + LIMITS.clueTailSeconds > timeLimit) return place.voice ? 'problemCluesTimeVoice' : 'problemCluesTime';
      break;
    }
    case 'pin': {
      if (question.map === null && question.imageUrl === null) return 'problemPinImage';
      const { fullRadius, zeroRadius } = question;
      if (!Number.isFinite(fullRadius) || fullRadius < 0 || fullRadius > LIMITS.pinMaxFullRadius) return 'problemPinFull';
      if (
        !Number.isFinite(zeroRadius) ||
        zeroRadius > LIMITS.pinMaxZeroRadius ||
        zeroRadius <= fullRadius
      ) {
        return 'problemPinRadius';
      }
      break;
    }
    case 'wall': {
      if (question.groups.some((group) => group.name === '' || group.tiles.some((tile) => tile.text === ''))) return 'problemWallEmpty';
      if (duplicateTile(question) !== '') return 'problemWallDuplicate';
      if (!Number.isInteger(question.mistakes) || question.mistakes < LIMITS.minWallMistakes || question.mistakes > LIMITS.maxWallMistakes) {
        return 'problemWallMistakes';
      }
      break;
    }
    case 'survey': {
      const { rows, answers } = question;
      const spareOnly = question.cloudId !== undefined && rows.length === 0;
      // Дробова популярність — не «незаповнений рядок»: окреме пояснення.
      if (rows.some((row) => Number.isFinite(row.popularity) && row.popularity > 0 && !Number.isInteger(row.popularity))) return 'problemSurveyPopularity';
      if (!spareOnly && (rows.length < LIMITS.minSurveyRows || !rows.every(isFilledSurveyRow))) return 'problemSurveyRows';
      if (surveyTotal(question) > LIMITS.surveyTotal) return 'problemSurveyTotal';
      if (duplicateSpelling(question) !== '') return 'problemSurveyDuplicate';
      if (!Number.isInteger(answers) || answers < 1 || answers > LIMITS.maxSurveyAnswers) return 'problemSurveyAnswers';
      break;
    }
    case 'bluff': {
      const [truth = ''] = question.accepted;
      if (truth === '') return 'problemBluffTruth';
      if (truth.length > LIMITS.bluffLie) return 'problemBluffTruthLong';
      const spares = badSpares(question);
      if (spares.filled < LIMITS.minBluffSpares) return 'problemBluffSpares';
      if (spares.truth !== '') return 'problemBluffSpareTruth';
      if (spares.twin !== '') return 'problemBluffSpareDuplicate';
      if (!Number.isInteger(question.choiceTime) || question.choiceTime < LIMITS.minTime || question.choiceTime > LIMITS.maxTime) return 'problemBluffChoiceTime';
      break;
    }
    case 'poll':
      if (question.options.some(isBlankOption)) return 'problemEmptyOption';
      break;
    case 'wordcloud':
      if (!Number.isInteger(question.words) || question.words < 1 || question.words > LIMITS.maxCloudWords) return 'problemCloudWords';
      break;
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
  if (question.reveal !== undefined && !place.reveal) return 'problemRevealPlace';
  if (question.type === 'clues' && !place.clues) return 'problemCluesPlace';
  if (question.type === 'pin' && !place.pin) return 'problemPinPlace';
  if (question.type === 'wall' && !place.wall) return 'problemWallPlace';
  if ((question.type === 'poll' || question.type === 'wordcloud') && !place.vote) return 'problemVotePlace';
  if (question.type === 'bluff' && !place.bluff) return 'problemBluffPlace';
  if (question.type === 'survey') {
    if (!place.survey) return 'problemSurveyPlace';
    if (question.cloudId !== undefined && !place.clouds?.includes(question.cloudId)) return 'problemSurveyCloud';
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
          if (problemKey(cells[index].question, cellPlace(current, cells[index])) !== null) return { round, question: question + index, cell: { category, index } };
        }
        question += cells.length;
      }
      continue;
    }
    const question = current.questions.findIndex((q, index) => problemKey(q, roundPlace(quiz, round, index)) !== null);
    if (question !== -1) return { round, question, cell: null };
  }
  return null;
}

/** Перша плитка стіни, що повторюється (без урахування регістру, пробілів і апострофів), у вигляді, у якому її порівнює схема. */
function duplicateTile(question: Extract<Question, { type: 'wall' }>): string {
  const seen = new Set<string>();
  for (const group of question.groups) {
    for (const tile of group.tiles) {
      const key = cloudKey(tile.text);
      if (seen.has(key)) return key;
      seen.add(key);
    }
  }
  return '';
}

/** Сума популярності рядків дошки; порожні й зіпсовані поля рахуються нулем. */
function surveyTotal(question: Extract<Question, { type: 'survey' }>): number {
  return question.rows.reduce((sum, row) => sum + (Number.isFinite(row.popularity) ? row.popularity : 0), 0);
}

/**
 * Перше написання, що веде у два рядки дошки (тим самим ключем, що й схема), — так, як його ввів ведучий (обрізане);
 * повтор у межах одного рядка не заважає.
 */
function duplicateSpelling(question: Extract<Question, { type: 'survey' }>): string {
  const seen = new Set<string>();
  for (const row of question.rows) {
    const mine = new Set<string>();
    for (const spelling of [row.text, ...row.accepted]) {
      const key = answerKey(spelling);
      if (mine.has(key)) continue;
      if (seen.has(key)) return spelling.trim();
      mine.add(key);
    }
    for (const key of mine) seen.add(key);
  }
  return '';
}

/**
 * Запасні вигадки блефу: скільки заповнено, перша, що збігається з написанням правди, і перша, що повторює іншу
 * (тим самим ключем, що й схема), — так, як її ввів ведучий (обрізана).
 */
function badSpares(question: Extract<Question, { type: 'bluff' }>): { filled: number; truth: string; twin: string } {
  const spares = question.lies.map((lie) => lie.trim()).filter((lie) => lie !== '');
  const truthKeys = new Set(question.accepted.map(answerKey));
  const seen = new Set<string>();
  let truth = '';
  let twin = '';
  for (const spare of spares) {
    const key = answerKey(spare);
    if (truth === '' && truthKeys.has(key)) truth = spare;
    if (twin === '' && seen.has(key)) twin = spare;
    seen.add(key);
  }
  return { filled: spares.length, truth, twin };
}

/** Запасна вигадка, про яку говорить повідомлення. */
const bluffSpareText = (question: Extract<Question, { type: 'bluff' }>, key: TextKey): string => {
  const spares = badSpares(question);
  return key === 'problemBluffSpareTruth' ? spares.truth : key === 'problemBluffSpareDuplicate' ? spares.twin : '';
};

/** Текст проблеми запитання; числа меж підставляються з LIMITS, а для підказок ще й з самого запитання. */
const problemText = (key: TextKey, index: number, question?: Question) =>
  t(key, {
    index,
    min: key === 'problemBluffSpares' ? LIMITS.minBluffSpares : key === 'problemBluffChoiceTime' ? LIMITS.minTime : LIMITS.minAudioSeconds,
    max: key === 'problemBluffTruthLong' ? LIMITS.bluffLie : key === 'problemBluffChoiceTime' ? LIMITS.maxTime : LIMITS.maxAudioSeconds,
    clueMin: LIMITS.minClueSeconds,
    clueMax: LIMITS.maxClueSeconds,
    pinMax: LIMITS.pinMaxZeroRadius,
    pinFullMax: LIMITS.pinMaxFullRadius,
    wallMin: LIMITS.minWallMistakes,
    wallMax: LIMITS.maxWallMistakes,
    cloudMax: LIMITS.maxCloudWords,
    tile: question?.type === 'wall' ? duplicateTile(question) : '',
    total: question?.type === 'survey' ? surveyTotal(question) : 0,
    text: question?.type === 'survey' ? duplicateSpelling(question) : question?.type === 'bluff' ? bluffSpareText(question, key) : '',
    surveyMin: LIMITS.minSurveyRows,
    surveyMax: LIMITS.maxSurveyAnswers,
    ...(question?.type === 'clues' ? { count: question.clues.length, at: lastClueAt(question), need: lastClueAt(question) + LIMITS.clueTailSeconds } : {}),
  });

/** Повідомлення про проблему клітинки: те саме, що для запитання, але з категорією. */
function cellProblem(category: number, index: number, key: TextKey, question: Question): string {
  const text = problemText(key, index, question);
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
    const problem = problemText(key, index + 1, spare).replace(/^[^:]*:\s*/, '');
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
          const problem = problemText(key, index + 1, spare).replace(/^[^:]*:\s*/, '');
          problems.push(where(t('problemCategorySpare', { category: name, index: index + 1, problem })));
        });
        category.cells.forEach((cell, index) => {
          const key = problemKey(cell.question, cellPlace(round, cell));
          if (key !== null) problems.push(where(cellProblem(categoryIndex + 1, index + 1, key, cell.question)));
        });
      });
      for (const issue of boardRoundIssues(round)) {
        problems.push(where(t(issue === 'too_many_questions' ? 'problemBoardTooMany' : 'problemGeneric', { index: 1 })));
      }
      return;
    }
    round.questions.forEach((question, index) => {
      const key = problemKey(question, roundPlace(draft, roundIndex, index));
      if (key !== null) problems.push(where(problemText(key, index + 1, question)));
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
