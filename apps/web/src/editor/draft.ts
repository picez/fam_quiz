import {
  DEFAULT_RULES,
  DEFAULT_SETTINGS,
  LIMITS,
  AUDIO_URL,
  YOUTUBE_ID,
  CHAIN_WORD,
  PIN_MAP_ASPECT,
  questionSchema,
  quizSchema,
  boardRoundIssues,
  duelShortfall,
  betMinimum,
  betsRoundIssue,
  roundRulesSchema,
  blitzRulesSchema,
  type AnswerMode,
  type AuctionRound,
  type TruthRound,
  type BetsRound,
  type BlitzRound,
  type BoardCategory,
  type BoardCell,
  type BoardRound,
  type ClassicRound,
  type DuelCategory,
  type DuelQuestion,
  type Duels,
  type FinalRound,
  type WipeoutRound,
  type SurvivalRound,
  WIPEOUT_TYPES,
  SURVIVAL_TYPES,
  LADDER_PRESETS,
  LIFELINES,
  ladderPresetSafe,
  type LadderRound,
  type Round,
  type MoreLessPair,
  type Question,
  type Quiz,
  type RoundRules,
  rulesOf,
  categorySparesOf,
  boardSpareSource,
  cellAnswerMode,
  QUESTION_TYPES,
  answerKey,
  isStorable,
  cloudKey,
  roundQuestions,
  REVEAL_TYPES,
  ladderPathIssue,
  letterSet,
  questionPrice,
  PUZZLE_TYPES,
  PUZZLES_ROUND_TYPES,
  isPuzzle,
  jigsawEdgeCount,
  jigsawGrid,
  jigsawPieceRatio,
  jigsawTabs,
  SPOT_MAX_COUNT,
  SPOT_MIN_COUNT,
  type MemoryCard,
  memoryCardKey,
  memoryGridSize,
  generateSudoku,
  countSudoku,
  isSudokuGrid,
  sudokuConflicts,
  EMPTY_SUDOKU,
  crosswordLetters,
  crosswordKeyLetters,
  crosswordIssue,
  layoutCrossword,
  pickKeyCells,
  type CrosswordLayout,
  type PuzzlesRound,
  type QuestRound,
  QUEST_TYPES,
  allowedBuffs,
  questKey,
  questDefaultOrder,
  type LadderPathIssue,
  type QuestionType,
} from '@quiz/shared';
import { t, type TextKey } from '../i18n';
import { newId } from './new-id';

export { QUESTION_TYPES, type QuestionType };

/**
 * Типи запитань, доступні в раунді: бліц — без ланцюжка, «Хто я?», точки, стіни, опитування й хмари;
 * поле — без ланцюжка, опитування й хмари; фінал і ставки — без «Хто я?», точки, стіни, «100 до 1», опитування й хмари;
 * сортування — скрізь; класика — усі.
 * Блеф — лише класика (поле, бліц і фінал його не мають).
 * Словесна драбина — лише класика й фінал.
 * «Ва-банк» — лише WIPEOUT_TYPES: один варіант, так/ні, число, текст, повзунок.
 * «Вибування» (основні запитання й питання на виживання) — лише SURVIVAL_TYPES, ті самі п'ять.
 * «Мільйонер» — лише «один варіант» (рівно з чотирма варіантами).
 * «100 до 1» — класика й поле (звичайна клітинка з телефона; решту клітинок перевіряє схема), не бліц і не фінал.
 * «Список на час» — так само: класика й поле, не бліц, не фінал, не ставки й не аукціон.
 * «Слова з літер» і «Більше чи менше» — так само, як «Список на час».
 * «Мелодія за нотами» — лише класика (як «Малюнок»).
 * «Малюнок» — лише класика (на полі, у бліці, фіналі, ставках, аукціоні й решті раундів його немає).
 * «Головоломки» — судоку, кросворд і пазл; судоку й кросворда немає більше ніде, а пазл ще й у класиці.
 */
export function questionTypesFor(roundType: Round['type']): readonly QuestionType[] {
  if (roundType === 'puzzles') return PUZZLES_ROUND_TYPES;
  // «Квест із кодом» (29g): звичайні запитання без медіа-механік.
  if (roundType === 'quest') return QUEST_TYPES;
  const types = roundType === 'classic' ? QUESTION_TYPES : questionTypesBeyondClassic(roundType).filter((type) => type !== 'drawing' && type !== 'jigsaw' && type !== 'spotdiff' && type !== 'memory' && type !== 'melody');
  return types.filter((type) => !(PUZZLE_TYPES as readonly string[]).includes(type));
}

/** Типи поза класикою (до відсіву «Малюнка»). */
function questionTypesBeyondClassic(roundType: Round['type']): readonly QuestionType[] {
  const unscored = (type: QuestionType) => type === 'poll' || type === 'wordcloud';
  if (roundType === 'blitz') {
    return QUESTION_TYPES.filter((type) => type !== 'chain' && type !== 'wordladder' && type !== 'clues' && type !== 'pin' && type !== 'wall' && type !== 'survey' && type !== 'timedlist' && type !== 'letterwords' && type !== 'moreless' && type !== 'bluff' && !unscored(type));
  }
  if (roundType === 'board') return QUESTION_TYPES.filter((type) => type !== 'chain' && type !== 'wordladder' && type !== 'bluff' && !unscored(type));
  if (roundType === 'final' || roundType === 'bets' || roundType === 'auction') {
    return QUESTION_TYPES.filter((type) => type !== 'clues' && type !== 'pin' && type !== 'wall' && type !== 'survey' && type !== 'timedlist' && type !== 'letterwords' && type !== 'moreless' && type !== 'bluff' && !unscored(type));
  }
  if (roundType === 'wipeout') return WIPEOUT_TYPES;
  if (roundType === 'survival') return SURVIVAL_TYPES;
  if (roundType === 'ladder') return ['single'];
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

type Common = Pick<Question, 'id' | 'text' | 'imageUrl' | 'video' | 'timeLimit' | 'points' | 'hint' | 'audio' | 'reveal' | 'betsCut'>;

const blank = () => ({ id: newId(), text: '' });
const blanks = (count: number) => Array.from({ length: count }, () => ({ id: newId(), text: '' }));

/** Скільки порожніх порівнянь у новому запитанні «Більше чи менше». */
const NEW_MORELESS_PAIRS = 3;

/** Порожнє порівняння «Більше чи менше»: лівий варіант правильний, бали задано. */
export function blankMoreLessPair(points: number, prompt = ''): MoreLessPair {
  return { id: newId(), prompt, a: { text: '', value: '' }, b: { text: '', value: '' }, correct: 'a', points };
}

/** Випадковий seed генератора судоку (ціле 0…2³² − 1). */
export function randomSudokuSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

type Sudoku = Extract<Question, { type: 'sudoku' }>;
type Crossword = Extract<Question, { type: 'crossword' }>;
export type JigsawQuestion = Extract<Question, { type: 'jigsaw' }>;
export type SpotdiffQuestion = Extract<Question, { type: 'spotdiff' }>;
export type MemoryQuestion = Extract<Question, { type: 'memory' }>;
export type MelodyQuestion = Extract<Question, { type: 'melody' }>;

/** Порожня половина пари «Пам’яті»: текст без картинки. */
export const blankMemoryCard = (): MemoryCard => ({ text: '' });

/** Нове порожнє слово кросворду. */
export const blankCrosswordEntry = () => ({ id: newId(), answer: '', clue: '' });

/** Що не так зі словами й ключем кросворду (для попереджень редактора). */
export type CrosswordWarning =
  | { kind: 'empty' }
  | { kind: 'word'; words: string[] }
  | { kind: 'duplicate'; words: string[] }
  | { kind: 'unplaced'; words: string[] }
  | { kind: 'key' }
  | { kind: 'missing'; letters: string[] };

export interface CrosswordBuild {
  /** Розкладка, що зберігається в запитанні (з ключовими клітинками); null — скласти не вдалося. */
  layout: CrosswordLayout | null;
  /** Сітка зі слів без ключа — для прев'ю; null — слова не складаються. */
  grid: CrosswordLayout | null;
  warning: CrosswordWarning | null;
}

/**
 * Складає кросворд зі слів, режиму й ключа (той самий детермінований компонувальник, що перевіряє схема).
 * Порожні слова — ще не готово (розкладки немає), але вже вписані від двох складаються для прев'ю; не українські, повтори й слова
 * без перетину — попередження з назвами слів;
 * у режимі ключа без придатного ключа сітка зберігається без ключових клітинок (про ключ скаже перевірка), а коли бракує літер — не зберігається.
 */
export function buildCrossword(question: Pick<Crossword, 'mode' | 'entries' | 'key'>): CrosswordBuild {
  const { entries } = question;
  const none = (warning: CrosswordWarning): CrosswordBuild => ({ layout: null, grid: null, warning });
  const filled = entries.filter((entry) => entry.answer.trim() !== '');
  const bad = filled.filter((entry) => crosswordLetters(entry.answer) === null);
  // Непридатне вже вписане слово важить більше за ще не вписане.
  if (bad.length > 0) return none({ kind: 'word', words: bad.map((entry) => entry.answer.trim()) });
  // Поки є порожні рядки, складаємо вже вписані слова (від двох): прев'ю й попередження — у міру набору, розкладка не зберігається.
  const partial = filled.length < entries.length;
  if (partial && filled.length < 2) return none({ kind: 'empty' });
  const words = partial ? filled : entries;
  const keys = words.map((entry) => crosswordLetters(entry.answer)!.join(''));
  const twins = words.filter((_, i) => keys.indexOf(keys[i]!) !== i);
  if (twins.length > 0) return none({ kind: 'duplicate', words: twins.map((entry) => entry.answer.trim()) });
  const laid = layoutCrossword(words);
  if (!laid.ok) {
    const ids = new Set(laid.ids);
    return none({ kind: laid.reason === 'word' ? 'word' : 'unplaced', words: words.filter((entry) => ids.has(entry.id)).map((entry) => entry.answer.trim()) });
  }
  const grid = laid.layout;
  if (partial) return { layout: null, grid, warning: { kind: 'empty' } };
  if (question.mode === 'full') return { layout: grid, grid, warning: null };
  if (question.key === null || crosswordKeyLetters(question.key) === null) return { layout: grid, grid, warning: { kind: 'key' } };
  const picked = pickKeyCells(grid, entries, question.key);
  if (!Array.isArray(picked)) return { layout: null, grid, warning: { kind: 'missing', letters: picked.missing } };
  return { layout: { ...grid, keyCells: picked }, grid, warning: null };
}

/** Кросворд з розкладкою, перескладеною зі слів, режиму й ключа. */
export function withCrosswordLayout(question: Crossword): Crossword {
  return { ...question, layout: buildCrossword(question).layout };
}

/** Стан цифр ведучого: повтори (клітинки), кількість розв'язків до двох і розв'язок, якщо він єдиний. */
export function sudokuCheck(givens: string): { conflicts: number[]; count: number; solution: string | null } {
  if (!isSudokuGrid(givens)) return { conflicts: [], count: 0, solution: null };
  const conflicts = sudokuConflicts(givens);
  if (conflicts.length > 0) return { conflicts, count: 0, solution: null };
  const found = countSudoku(givens, 2);
  return { conflicts, count: found.count, solution: found.count === 1 ? found.solution : null };
}

/** Судоку з цифрами ведучого: розв'язок записується, лише коли він єдиний. */
export function withSudokuGivens(question: Sudoku, givens: string): Sudoku {
  return { ...question, level: 'custom', seed: null, givens, solution: sudokuCheck(givens).solution ?? EMPTY_SUDOKU };
}

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
    case 'timedlist':
      // Без відео: без таймера список не скінчиться. Три порожні пункти, мінуса немає.
      return {
        ...common,
        video: null,
        type,
        timeLimit: LIMITS.defaultListTime,
        points: LIMITS.defaultListPoints,
        minus: null,
        items: Array.from({ length: LIMITS.minListItems }, () => ({ id: newId(), text: '', accepted: [] as string[] })),
      };
    case 'letterwords':
      // Без відео: без таймера слова не скінчаться. Дев'ять випадкових літер, найбільше слів, сума за слово.
      return {
        ...common,
        video: null,
        type,
        timeLimit: LIMITS.defaultLetterTime,
        points: LIMITS.defaultLetterWordPoints,
        set: { kind: 'random', count: LIMITS.defaultLetterSet },
        goal: 'most',
        per: 'word',
      };
    case 'moreless':
      // Без відео: без таймера ряд не скінчиться. Три порожні порівняння по 100, сума — ціна запитання.
      return {
        ...common,
        video: null,
        type,
        timeLimit: LIMITS.defaultMoreLessTime,
        points: LIMITS.defaultMoreLessPoints * NEW_MORELESS_PAIRS,
        pairs: Array.from({ length: NEW_MORELESS_PAIRS }, () => blankMoreLessPair(LIMITS.defaultMoreLessPoints)),
      };
    case 'drawing': {
      // Без відео, звуку й «перевертання»: видали б слово, а без таймера малюнок не скінчиться. Підказки немає: бафів теж.
      const { hint: _hint, audio: _audio, reveal: _reveal, ...rest } = common;
      return { ...rest, video: null, type, timeLimit: LIMITS.defaultDrawingTime, points: LIMITS.defaultDrawingPoints, accepted: [''] };
    }
    case 'sudoku': {
      // Головоломка: без відео (без таймера не скінчиться), звуку, «перевертання» й підказки (бафів немає). Сітка — середня, згенерована.
      // Типовий текст іншої головоломки (зміна типу) — як порожній: інакше кросворд лишився б «Розв’яжіть судоку».
      const { hint: _hint, audio: _audio, reveal: _reveal, ...rest } = common;
      const seed = randomSudokuSeed();
      return { ...rest, text: rest.text === '' || rest.text === t('crosswordDefaultText') || rest.text === t('jigsawDefaultText') || rest.text === t('memoryDefaultText') ? t('sudokuDefaultText') : rest.text, video: null, type, timeLimit: LIMITS.defaultSudokuTime, points: LIMITS.defaultPuzzlePoints, level: 'medium', seed, ...generateSudoku(seed, 'medium') };
    }
    case 'crossword': {
      // Як судоку; чотири порожні слова, розкладки ще немає.
      const { hint: _hint, audio: _audio, reveal: _reveal, ...rest } = common;
      return {
        ...rest,
        text: rest.text === '' || rest.text === t('sudokuDefaultText') || rest.text === t('jigsawDefaultText') || rest.text === t('memoryDefaultText') ? t('crosswordDefaultText') : rest.text,
        video: null,
        type,
        timeLimit: LIMITS.defaultCrosswordTime,
        points: LIMITS.defaultPuzzlePoints,
        mode: 'full',
        entries: Array.from({ length: LIMITS.minCrosswordWords }, blankCrosswordEntry),
        key: null,
        layout: null,
      };
    }
    case 'jigsaw': {
      // Як головоломка: без відео, звуку, «перевертання» й підказки. Фото додається окремо (photo), imageUrl завжди null.
      const { hint: _hint, audio: _audio, reveal: _reveal, ...rest } = common;
      const { rows, cols } = jigsawGrid(LIMITS.defaultJigsawPieces, '4:3');
      const seed = randomSudokuSeed();
      return {
        ...rest,
        text: rest.text === '' || rest.text === t('sudokuDefaultText') || rest.text === t('crosswordDefaultText') || rest.text === t('memoryDefaultText') ? t('jigsawDefaultText') : rest.text,
        imageUrl: null,
        video: null,
        type,
        timeLimit: LIMITS.defaultJigsawTime,
        points: LIMITS.defaultJigsawPoints,
        photo: rest.imageUrl ?? '',
        aspect: '4:3',
        focus: { x: 0.5, y: 0.5 },
        rows,
        cols,
        seed,
        tabs: jigsawTabs(rows, cols, seed),
        preview: true,
      };
    }
    case 'spotdiff': {
      // Як пазл: без відео, звуку, «перевертання» й підказки; дві картинки лежать у original і changed, imageUrl завжди null.
      const { hint: _hint, audio: _audio, reveal: _reveal, ...rest } = common;
      const stale = rest.text === t('sudokuDefaultText') || rest.text === t('crosswordDefaultText') || rest.text === t('jigsawDefaultText') || rest.text === t('memoryDefaultText');
      return { ...rest, text: stale ? '' : rest.text, imageUrl: null, video: null, type, timeLimit: LIMITS.defaultSpotdiffTime, points: LIMITS.defaultSpotdiffPoints, original: '', changed: '', aspect: 4 / 3, spots: [] };
    }
    case 'memory': {
      // Як пазл: без відео, звуку, «перевертання» й підказки; картки лише в парах, imageUrl завжди null. Шість порожніх пар, нова розкладка.
      const { hint: _hint, audio: _audio, reveal: _reveal, ...rest } = common;
      const stale = rest.text === '' || rest.text === t('sudokuDefaultText') || rest.text === t('crosswordDefaultText') || rest.text === t('jigsawDefaultText');
      return { ...rest, text: stale ? t('memoryDefaultText') : rest.text, imageUrl: null, video: null, type, timeLimit: LIMITS.defaultMemoryTime, points: LIMITS.defaultMemoryPoints, grid: '3x4', pairs: Array.from({ length: memoryGridSize('3x4').pairs }, () => ({ a: blankMemoryCard(), b: blankMemoryCard() })), seed: randomSudokuSeed() };
    }
    case 'melody': {
      // Власне джерело — track: без відео, загального звуку, «перевертання» й підказки (бафів немає). Порожній трек — чернетка (problemMelodyTrack).
      const { hint: _hint, audio: _audio, reveal: _reveal, ...rest } = common;
      return { ...rest, video: null, type, text: rest.text === '' ? t('melodyDefaultText') : rest.text, timeLimit: LIMITS.defaultMelodyTime, points: LIMITS.defaultPoints, track: { source: 'file', url: '', start: 0 }, accepted: [''] };
    }
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
    case 'wordladder':
      // Старт, одне проміжне слово й ціль; без відео — без таймера драбина не закінчиться.
      return { ...common, video: null, type, timeLimit: LIMITS.defaultWordLadderTime, path: ['', '', ''], maxSteps: LIMITS.defaultWordLadderSteps };
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
  const { id, text, imageUrl, video, timeLimit, points, hint, audio, reveal, betsCut } = question;
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
    ...(betsCut === undefined ? {} : { betsCut }),
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
  // Текст, «Хто я?» і мелодія: написання ті самі.
  if ((question.type === 'text' || question.type === 'clues') && type === 'melody') return { ...build(common, type), accepted: [...question.accepted] } as Question;
  if (question.type === 'melody' && type === 'text') return { ...build(common, type), accepted: [...question.accepted] } as Question;
  // Текст і малюнок: написання ті самі, перше — слово художника.
  if ((question.type === 'text' || question.type === 'drawing') && (type === 'text' || type === 'drawing')) return { ...build(common, type), accepted: [...question.accepted] } as Question;
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
  // «Правда про гравця»: запитань у раунді немає, таймер — поле самого раунду.
  if (round.type === 'truth') return { ...round, timeLimit: seconds };
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
    case 'drawing':
      return { ...question, id, accepted: [...question.accepted] };
    case 'melody':
      return { ...question, id, track: { ...question.track }, accepted: [...question.accepted] };
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
    case 'timedlist':
      return { ...question, id, items: question.items.map((item) => ({ ...item, id: newId(), accepted: [...item.accepted] })) };
    case 'letterwords':
      return { ...question, id, set: { ...question.set } };
    case 'moreless':
      return { ...question, id, pairs: question.pairs.map((pair) => ({ ...pair, id: newId(), a: { ...pair.a }, b: { ...pair.b } })) };
    case 'crossword':
      // Нові id слів: розкладка, що на них посилається, перескладається.
      return withCrosswordLayout({ ...question, id, entries: question.entries.map((entry) => ({ ...entry, id: newId() })) });
    case 'poll':
      return { ...question, id, options: question.options.map((option) => ({ ...option, id: newId() })) };
    case 'chain':
      return { ...question, id, words: [...question.words] };
    case 'wordladder':
      return { ...question, id, path: [...question.path] };
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

/** Новий «Ва-банк»: п'ять порожніх запитань «один варіант» з цінами 100…500 (драбина зростає), без перемішування. */
export function newWipeoutRound(): WipeoutRound {
  return {
    id: newId(),
    type: 'wipeout',
    title: '',
    shuffleOptions: false,
    questions: Array.from({ length: LIMITS.minWipeoutQuestions }, (_, i) => ({ ...newQuestion('single'), points: 100 * (i + 1) })),
  };
}

/** Нове «Вибування»: три порожні запитання «один варіант» по 100, два питання на виживання, випробування — питання, лишається 1, бонус 500. */
export function newSurvivalRound(): SurvivalRound {
  return {
    id: newId(),
    type: 'survival',
    title: '',
    speedBonus: false,
    shuffleOptions: false,
    rules: defaultRules(),
    questions: Array.from({ length: LIMITS.minSurvivalQuestions }, () => ({ ...newQuestion('single'), points: 100 })),
    trials: [newQuestion('single'), newQuestion('single')],
    trial: 'question',
    survivors: 1,
    bonus: 500,
  };
}

/** Нове запитання драбини «Мільйонер»: «один варіант» з рівно 4 порожніми варіантами; ціни немає (сума рівня — у сходинці). */
export function newLadderQuestion(): Question {
  const options = blanks(LIMITS.ladderOptions);
  return { ...newQuestion('single'), points: 0, type: 'single', options, correctId: options[0].id };
}

/** Новий «Мільйонер»: п'ять запитань по 4 варіанти, рівні з пресету, неспалимий — 1000, учасника вибирає ведучий, усі три підказки, без таймера. */
export function newLadderRound(): LadderRound {
  const levels = [...LADDER_PRESETS[LIMITS.minLadderQuestions]];
  return {
    id: newId(),
    type: 'ladder',
    title: '',
    shuffleOptions: false,
    questions: Array.from({ length: LIMITS.minLadderQuestions }, newLadderQuestion),
    levels,
    safe: ladderPresetSafe(levels),
    pick: 'host',
    lifelines: [...LIFELINES],
    timer: false,
  };
}

/**
 * Змінює кількість сходинок «Мільйонера» до `count`. Рівні й неспалимі за пресетом переходять на пресет нової довжини;
 * змінені автором — додають зверху `last + 1000`, а коли це не більше за верхній рівень (він уже на максимумі чи порожній), беруть пресет нової довжини;
 * при вилученні сходинки `removed` пропадає її власні рівень і позначка, решта неспалимих зсувається вниз разом зі своїми рівнями. Неспалимих на верхній сходинці й вище не лишається.
 */
export function resizeLadder(round: LadderRound, count: number, removed?: number): LadderRound {
  const old = round.levels.length;
  const preset = LADDER_PRESETS[old];
  const presetSafe = ladderPresetSafe(round.levels);
  const isPreset =
    preset !== undefined &&
    round.levels.every((level, i) => level === preset[i]) &&
    round.safe.length === presetSafe.length &&
    presetSafe.every((s) => round.safe.includes(s));
  const target = LADDER_PRESETS[count];
  if (isPreset && target !== undefined) {
    const levels = [...target];
    return { ...round, levels, safe: ladderPresetSafe(levels) };
  }
  let levels = round.levels.slice(0, count);
  let safe = round.safe;
  if (removed !== undefined && count < old) {
    levels = round.levels.filter((_, i) => i !== removed);
    safe = round.safe.filter((s) => s !== removed).map((s) => (s > removed ? s - 1 : s));
  }
  while (levels.length < count) {
    const last = levels[levels.length - 1] ?? 0;
    const next = Math.min(LIMITS.maxLadderLevel, last + 1000);
    if (!(next > last) && target !== undefined) {
      const levelsFromPreset = [...target];
      return { ...round, levels: levelsFromPreset, safe: ladderPresetSafe(levelsFromPreset) };
    }
    levels = [...levels, next];
  }
  return { ...round, levels, safe: safe.filter((s) => s < count - 1) };
}

/** Новий раунд «Фінал»: одне запитання, автоматична перевірка, класичні ставки; правил балів у ньому немає. */
export function newFinalRound(): FinalRound {
  return { id: newId(), type: 'final', title: '', shuffleOptions: false, check: 'auto', wagerMode: 'classic', questions: [newQuestion('single')] };
}

/** Новий раунд «Ставки»: одне запитання без обрізу, стартова ставка й крок з типових, найбільшої немає; автоматична перевірка. */
export function newBetsRound(): BetsRound {
  return { id: newId(), type: 'bets', title: '', shuffleOptions: false, check: 'auto', betStart: LIMITS.defaultBetStart, betStep: LIMITS.defaultBetStep, betMax: null, questions: [newQuestion('single')] };
}

/** Новий раунд «Аукціон»: одне запитання без обрізу, торг фіксованим кроком, помилка коштує ставки; автоматична перевірка. */
export function newAuctionRound(): AuctionRound {
  return { id: newId(), type: 'auction', title: '', shuffleOptions: false, check: 'auto', bidMode: 'step', bidStep: LIMITS.defaultBidStep, loss: 'bid', questions: [newQuestion('single')] };
}

/** Новий «Квест із кодом» (29g): порожні глобальне запитання й код, спроб 3, бонус 1000 балів, три порожні запитання; порядок позицій з'являється разом із кодом. */
export function newQuestRound(): QuestRound {
  return {
    id: newId(),
    type: 'quest',
    title: '',
    speedBonus: false,
    shuffleOptions: false,
    rules: defaultRules(),
    prompt: '',
    code: '',
    order: [],
    tries: LIMITS.defaultQuestTries,
    bonus: { kind: 'points', points: LIMITS.defaultQuestBonus },
    questions: [newQuestion('single'), newQuestion('single'), newQuestion('single')],
  };
}

/** Код «Квесту» як його вводять: нормалізований на льоту; зміна довжини скидає порядок на «зліва направо». */
export function withQuestCode(round: QuestRound, raw: string): QuestRound {
  const code = questKey(raw);
  const sameLength = Array.from(code).length === round.order.length;
  return { ...round, code, order: sameLength ? round.order : questDefaultOrder(Array.from(code).length) };
}

/** Нові «Головоломки»: одне згенероване судоку середньої складності; правил, перемішування й швидкості немає. */
export function newPuzzlesRound(): PuzzlesRound {
  return { id: newId(), type: 'puzzles', title: '', questions: [newQuestion('sudoku')] };
}

/** Новий «Правда про гравця»: без запитань (їх створює гра з фактів), ціна й таймер типові (30 с). */
export function newTruthRound(): TruthRound {
  return { id: newId(), type: 'truth', title: '', points: LIMITS.defaultPoints, timeLimit: LIMITS.defaultTime };
}

/** Нове запитання драбини «Ва-банк»: «один варіант», ціна на сотню вища за попереднє (не більше максимуму); перше — 100. */
export function newWipeoutQuestion(after: Question | undefined): Question {
  return newBoardQuestion(after);
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
    case 'timedlist': {
      // Пункт без назви й без написань не зберігається; порожні написання відкидаються. Пункт лише з написаннями лишається: про нього скаже перевірка.
      const items = question.items
        .map((item) => ({ ...item, text: item.text.trim(), accepted: item.accepted.map((s) => s.trim()).filter((s) => s !== '') }))
        .filter((item) => item.text !== '' || item.accepted.length > 0);
      return { ...question, text, items };
    }
    case 'letterwords': {
      // Свій набір без зайвих пробілів по краях; найдовше слово завжди рахується за літери.
      const set = question.set.kind === 'fixed' ? { ...question.set, letters: question.set.letters.trim() } : question.set;
      return { ...question, text, set, per: question.goal === 'longest' ? 'letter' : question.per };
    }
    case 'moreless': {
      // Тексти й значення без зайвих пробілів по краях; ціна запитання — сума балів порівнянь.
      const pairs = question.pairs.map((pair) => ({ ...pair, prompt: pair.prompt.trim(), a: { text: pair.a.text.trim(), value: pair.a.value.trim() }, b: { text: pair.b.text.trim(), value: pair.b.value.trim() } }));
      return { ...question, text, pairs, points: pairs.reduce((sum, pair) => sum + pair.points, 0) };
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
    case 'wordladder': {
      // Порожні проміжні слова відкидаються; стартове й цільове лишаються, навіть порожні, щоб про них сказала перевірка.
      const path = question.path.map((word) => word.normalize('NFC').trim());
      if (path.length < 2) return { ...question, text, path };
      return { ...question, text, path: [path[0], ...path.slice(1, -1).filter((word) => word !== ''), path[path.length - 1]] };
    }
    case 'sort': {
      const words = question.words.map((word) => ({ ...word, text: word.text.trim() }));
      let end = words.length;
      while (end > LIMITS.minSortWords && words[end - 1].text === '') end -= 1;
      return { ...question, text, categories: trimAll(question.categories), words: words.slice(0, end) };
    }
    case 'text':
      return { ...question, text, accepted: question.accepted.map((s) => s.trim()).filter((s) => s !== '') };
    case 'drawing': {
      // Слово — перше написання: порожнє лишається, щоб про нього сказала перевірка; порожні додаткові відкидаються. Підказки в малюнку немає.
      const { hint: _hint, ...rest } = question;
      const [word = '', ...others] = question.accepted.map((s) => s.trim());
      return { ...rest, text, accepted: [word, ...others.filter((s) => s !== '')] };
    }
    case 'sudoku': {
      // Розв'язок — похідний від цифр: єдиний розв'язок пишеться заново (той самий для згенерованої сітки). Підказки немає.
      const { hint: _hint, ...rest } = question;
      return { ...rest, text, solution: sudokuCheck(question.givens).solution ?? question.solution };
    }
    case 'jigsaw': {
      // Фото — лише в photo (готова картинка запитання видала б пазл: її прибирає не чищення, а проблема), без відео, звуку, «перевертання» й підказки (бафів немає).
      const { hint: _hint, audio: _audio, reveal: _reveal, ...rest } = question;
      return { ...rest, text, video: null };
    }
    case 'spotdiff': {
      // Картинки — лише в original і changed (готова картинка запитання видала б відмінності), без відео, звуку, «перевертання» й підказки.
      const { hint: _hint, audio: _audio, reveal: _reveal, ...rest } = question;
      return { ...rest, text, video: null };
    }
    case 'melody': {
      // Назва — перше написання: порожнє лишається, щоб про нього сказала перевірка; порожні додаткові відкидаються. Без відео, звуку, «перевертання» й підказки.
      const { hint: _hint, audio: _audio, reveal: _reveal, ...rest } = question;
      const [title = '', ...others] = question.accepted.map((s) => s.trim());
      return { ...rest, text, video: null, accepted: [title, ...others.filter((s) => s !== '')] };
    }
    case 'memory': {
      // Картки лише в парах: текст без пробілів по краях, не довший за поле; без відео, звуку, «перевертання» й підказки.
      const { hint: _hint, audio: _audio, reveal: _reveal, ...rest } = question;
      const card = (c: MemoryCard): MemoryCard => (c.imageUrl === undefined ? { text: c.text.trim() } : { text: c.text.trim(), imageUrl: c.imageUrl });
      return { ...rest, text, video: null, pairs: question.pairs.map((pair) => ({ a: card(pair.a), b: card(pair.b) })) };
    }
    case 'crossword': {
      // Слова й підказки без пробілів по краях, ключ лише в режимі ключа; розкладка перескладається з почищеного. Підказки для бафів немає.
      const { hint: _hint, ...rest } = question;
      const entries = question.entries.map((entry) => ({ ...entry, answer: entry.answer.trim(), clue: entry.clue.trim() }));
      return withCrosswordLayout({ ...rest, text, entries, key: question.mode === 'key' ? (question.key ?? '').trim() : null });
    }
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
        // У власному темпі інтервал схований: непридатний (скажімо, з відновленої чернетки) зберігається типовим.
        ...(question.cluePace === 'self' && !validClueInterval(question.interval) ? { interval: LIMITS.defaultClueSeconds } : {}),
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
/** Запитання в тому вигляді, у якому воно піде на сервер (те саме чищення, що в cleaned). */
export function cleanedQuestion(question: Question): Question {
  const { hint, reveal, ...rest } = cleanBody(question);
  const trimmed = hint?.trim() ?? '';
  // Режим проявлення без картинки (її прибрали) зникає тихо.
  const kept = reveal !== undefined && rest.imageUrl !== null && rest.video === null ? { ...rest, reveal } : rest;
  return (trimmed === '' ? kept : { ...kept, hint: trimmed }) as Question;
}

/** Вікторина в тому вигляді, у якому вона піде на сервер. */
export function cleaned(quiz: Quiz): Quiz {
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
  // Обріз ставок живе лише в раундах «Ставки» й «Аукціон»: перенесене чи старе запитання його не несе.
  const noCut = (question: Question): Question => {
    if (question.betsCut === undefined) return question;
    const { betsCut: _cut, ...rest } = question;
    return rest as Question;
  };
  const { spares, ...whole } = quiz;
  return {
    ...whole,
    title: quiz.title.trim(),
    description: quiz.description.trim(),
    rounds: quiz.rounds.map((round) => {
      const title = round.title.trim();
      if (round.type === 'truth') return { ...round, title };
      if (round.type === 'quest') {
        // Код нормалізується, порядок із чужою довжиною скидається; решта — як у класиці.
        const { code, order } = withQuestCode(round, round.code);
        return { ...round, title, code, order, questions: round.questions.map((question) => noCut(cleanedQuestion(question))) };
      }
      if (round.type === 'final') return { ...round, title, questions: round.questions.map((question) => inFinal(noCut(cleanedQuestion(question)))) };
      if (round.type === 'bets' || round.type === 'auction') return { ...round, title, questions: round.questions.map((question) => inFinal(cleanedQuestion(question))) };
      if (round.type === 'survival') {
        // Для «удачі» порожні питання на виживання — просто незаповнений шаблон: вони не потрібні.
        const trials = round.trial === 'luck' ? round.trials.filter((trial) => trial.text.trim() !== '') : round.trials;
        return { ...round, title, questions: round.questions.map((question) => noCut(cleanedQuestion(question))), trials: trials.map((trial) => noCut(cleanedQuestion(trial))) };
      }
      if (round.type !== 'board') return { ...round, title, questions: round.questions.map((question) => noCut(cleanedQuestion(question))) };
      return {
        ...round,
        title,
        categories: round.categories.map(({ spares: categorySpares, ...category }) => ({
          ...category,
          title: category.title.trim(),
          cells: category.cells.map((cell) => ({ ...cell, question: noCut(cleanedQuestion(cell.question)) })),
          ...(categorySpares === undefined || categorySpares.length === 0 ? {} : { spares: categorySpares.map((spare) => noCut(cleanedQuestion(spare))) }),
        })),
      };
    }),
    ...(quiz.duels === undefined ? {} : { duels: cleanDuels(quiz.duels) }),
    ...(spares === undefined || spares.length === 0 ? {} : { spares: spares.map((spare) => noCut(cleanedQuestion(spare))) }),
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
  /** Сортування: класика, фінал, бліц і звичайна клітинка з телефона. */
  sort: boolean;
  /** Ланцюжок слів: усюди, крім бліцу й поля (правило chain_round схеми). */
  chain: boolean;
  /** Словесна драбина: лише класика, фінал і ставки (правило wordladder_place схеми). */
  wordladder: boolean;
  /** Список на час: класика й звичайна клітинка з телефона (правило timedlist_place схеми). */
  timedlist: boolean;
  /** Слова з літер: так само (правило letterwords_place схеми). */
  letterwords: boolean;
  /** Більше чи менше: так само (правило moreless_place схеми). */
  moreless: boolean;
  /** Малюнок: лише класика, жодної клітинки поля (правило drawing_place схеми). */
  drawing: boolean;
  /** Судоку й кросворд: лише раунд «Головоломки» (правило puzzle_place схеми). */
  puzzle: boolean;
  /** Раунд «Головоломки»: інших типів тут немає (правило puzzles_type схеми). */
  onlyPuzzles: boolean;
  /** Пазл: лише класика й «Головоломки» (правило jigsaw_place схеми). */
  jigsaw: boolean;
  /** «Знайди відмінності»: так само, лише класика й «Головоломки» (правило spotdiff_place схеми). */
  spotdiff: boolean;
  /** «Пам’ять»: так само, лише класика й «Головоломки» (правило memory_place схеми). */
  memory: boolean;
  /** «Мелодія за нотами»: лише класика (правило melody_place схеми). */
  melody: boolean;
}

const ANYWHERE: Place = { reveal: true, clues: true, pin: true, wall: true, vote: true, bluff: true, survey: true, clouds: [], voice: false, sort: true, chain: true, wordladder: true, timedlist: true, letterwords: true, moreless: true, drawing: true, puzzle: false, onlyPuzzles: false, jigsaw: true, spotdiff: true, memory: true, melody: true };
/** Бліц і фінал: нічого з нового. Класика — усе, а хмари для «100 до 1» — ті, що вище. */
const roundPlace = (quiz: Quiz, roundIndex: number, questionIndex: number): Place =>
  quiz.rounds[roundIndex].type === 'classic'
    ? { ...ANYWHERE, clouds: cloudSources(quiz, roundIndex, questionIndex).map((cloud) => cloud.id) }
    : { reveal: false, clues: false, pin: false, wall: false, vote: false, bluff: false, survey: false, clouds: null, voice: false, sort: true, chain: quiz.rounds[roundIndex].type !== 'blitz', wordladder: quiz.rounds[roundIndex].type === 'final' || quiz.rounds[roundIndex].type === 'bets' || quiz.rounds[roundIndex].type === 'auction', timedlist: false, letterwords: false, moreless: false, drawing: false, puzzle: quiz.rounds[roundIndex].type === 'puzzles', onlyPuzzles: quiz.rounds[roundIndex].type === 'puzzles', jigsaw: quiz.rounds[roundIndex].type === 'puzzles', spotdiff: quiz.rounds[roundIndex].type === 'puzzles', memory: quiz.rounds[roundIndex].type === 'puzzles', melody: false };
/** Клітинка поля: усе — на звичайній з телефона; «Хто я?» — ще й на усній; бліц-клітинка — нічого. */
const cellPlace = (round: BoardRound, cell: BoardCell): Place => {
  const normal = cell.kind === 'normal';
  const phone = normal && cellAnswerMode(round, cell) === 'phone';
  return { reveal: phone, clues: normal, pin: phone, wall: phone, vote: false, bluff: false, survey: phone, clouds: null, voice: normal && !phone, sort: phone, chain: false, wordladder: false, timedlist: phone, letterwords: phone, moreless: phone, drawing: false, puzzle: false, onlyPuzzles: false, jigsaw: false, spotdiff: false, memory: false, melody: false };
};

/** Що заважає зберегти клітинку (уже почищену); null — клітинка готова. Одне джерело для problemsOf, firstProblem і cellState. */
export function cellIssue(round: BoardRound, cell: BoardCell): TextKey | null {
  return problemKey(cell.question, cellPlace(round, cell));
}

/** Ключі без вписаного автором: ідентифікатори, тип, вибір правильного й типова мапа. */
const NOT_CONTENT = new Set(['id', 'type', 'correctId', 'correctIds', 'categoryId', 'map']);
/** Чи автор щось вписав чи додав: будь-який непорожній рядок (текст, варіант, картинка, відео, аудіо, підказка) поза службовими ключами. */
function hasContent(value: unknown, key = ''): boolean {
  if (NOT_CONTENT.has(key)) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.some((item) => hasContent(item));
  if (value !== null && typeof value === 'object') return Object.entries(value).some(([name, item]) => hasContent(item, name));
  return false;
}

export type CellState = 'empty' | 'incomplete' | 'ready';
/** Стан клітинки в редакторі: порожня (нічого не вписано), не заповнена (cellIssue ≠ null) чи готова. */
export function cellState(round: BoardRound, cell: BoardCell): CellState {
  const question = cleanedQuestion(cell.question);
  if (!hasContent(question)) return 'empty';
  return cellIssue(round, { ...cell, question }) !== null ? 'incomplete' : 'ready';
}

export interface CategoryReadiness {
  ready: number;
  total: number;
  titleMissing: boolean;
}
export interface BoardReadiness {
  ready: number;
  total: number;
  notReady: number;
  categories: CategoryReadiness[];
}
/** Скільки клітинок поля готові: усього й по категоріях; порожня назва категорії — окремо. */
export function boardReadiness(round: BoardRound): BoardReadiness {
  const categories = round.categories.map((category) => ({
    ready: category.cells.filter((cell) => cellState(round, cell) === 'ready').length,
    total: category.cells.length,
    titleMissing: category.title.trim() === '',
  }));
  const ready = categories.reduce((sum, category) => sum + category.ready, 0);
  const total = categories.reduce((sum, category) => sum + category.total, 0);
  return { ready, total, notReady: total - ready, categories };
}

/** Чи вистачає часу останній підказці: (n − 1) × інтервал + хвіст ≤ час. */
const lastClueAt = (question: Extract<Question, { type: 'clues' }>) => (question.clues.length - 1) * question.interval;
/** Вада шляху драбини → текст проблеми. */
const LADDER_PROBLEMS: Record<LadderPathIssue, TextKey> = {
  wordladder_word: 'problemWordLadderWord',
  wordladder_length: 'problemWordLadderLength',
  wordladder_step: 'problemWordLadderStep',
  wordladder_steps: 'problemWordLadderSteps',
};
const validClueInterval = (interval: number) => Number.isInteger(interval) && interval >= LIMITS.minClueSeconds && interval <= LIMITS.maxClueSeconds;

/** Найбільший час запитання: головоломкам — власна межа (типові 180 і 240 с понад загальні 120). */
export const maxTimeOf = (question: Pick<Question, 'type'>) => (isPuzzle(question) || question.type === 'jigsaw' || question.type === 'spotdiff' || question.type === 'memory' ? LIMITS.maxPuzzleTime : LIMITS.maxTime);
/** Найменший час запитання: пазлу потрібно не менше LIMITS.minJigsawTime. */
export const minTimeOf = (question: Pick<Question, 'type'>) => (question.type === 'jigsaw' ? LIMITS.minJigsawTime : question.type === 'spotdiff' ? LIMITS.minSpotdiffTime : question.type === 'memory' ? LIMITS.minMemoryTime : question.type === 'melody' ? LIMITS.minMelodyTime : LIMITS.minTime);

/** Вада збереженого кросворду, яку не впіймали перевірки вище (скажімо, з імпорту) → текст проблеми. */
const CROSSWORD_PROBLEMS = {
  crossword_word: 'problemCrosswordWord',
  crossword_duplicate: 'problemCrosswordDuplicate',
  crossword_layout: 'problemCrosswordLayout',
  crossword_key: 'problemCrosswordKey',
  crossword_key_mode: 'problemCrosswordKey',
  crossword_key_letters: 'problemCrosswordKeyLetters',
} as const satisfies Record<string, TextKey>;

function problemKey(question: Question, place: Place = ANYWHERE): TextKey | null {
  if (question.text === '') return 'problemNoText';
  // Місце головоломок — раніше за їхні поля: судоку поза «Головоломками» не виправити цифрами.
  if (isPuzzle(question) && !place.puzzle) return 'problemPuzzlePlace';
  if (question.type === 'jigsaw' && !place.jigsaw) return 'problemJigsawPlace';
  if (question.type === 'spotdiff' && !place.spotdiff) return 'problemSpotdiffPlace';
  if (question.type === 'memory' && !place.memory) return 'problemMemoryPlace';
  if (question.type === 'melody' && !place.melody) return 'problemMelodyPlace';
  if (!isPuzzle(question) && question.type !== 'jigsaw' && question.type !== 'spotdiff' && question.type !== 'memory' && place.onlyPuzzles) return 'problemPuzzlesType';
  const { timeLimit, points } = question;
  const inLimits =
    Number.isInteger(timeLimit) &&
    timeLimit >= minTimeOf(question) &&
    timeLimit <= maxTimeOf(question) &&
    // У «Більше чи менше» ціна — сума балів порівнянь: вона й межа за неї мають власні тексти нижче.
    (question.type === 'moreless' || (Number.isInteger(points) && points >= 0 && points <= LIMITS.maxPoints));
  // У «Словах з літер» поле балів зветься «Сума» (за одиницю).
  if (!inLimits) return question.type === 'letterwords' ? 'problemLettersLimits' : question.type === 'jigsaw' ? 'problemJigsawLimits' : question.type === 'spotdiff' ? 'problemSpotdiffLimits' : question.type === 'memory' ? 'problemMemoryLimits' : question.type === 'melody' ? 'problemMelodyLimits' : isPuzzle(question) ? 'problemPuzzleLimits' : 'problemLimits';

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
    case 'wordladder': {
      const { path, maxSteps } = question;
      if (path.length < 2 || path[0] === '' || path[path.length - 1] === '') return 'problemWordLadderEmpty';
      if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > LIMITS.maxWordLadderSteps) return 'problemWordLadderMaxSteps';
      const issue = ladderPathIssue(path, maxSteps);
      if (issue !== null) return LADDER_PROBLEMS[issue];
      break;
    }
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
      // Кожен відкриває сам: інтервал схований і нічого не робить, треба лише досить часу.
      if (question.cluePace === 'self') {
        if (timeLimit < LIMITS.selfCluesMinTime) return 'problemCluesSelfTime';
        break;
      }
      const { interval } = question;
      if (!validClueInterval(interval)) return 'problemCluesInterval';
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
      // Кілька відповідей в опитуванні: сума може перевищити 100.
      if (question.multiple !== true && surveyTotal(question) > LIMITS.surveyTotal) return 'problemSurveyTotal';
      if (duplicateSpelling(question) !== '') return 'problemSurveyDuplicate';
      if (!Number.isInteger(answers) || answers < 1 || answers > LIMITS.maxSurveyAnswers) return 'problemSurveyAnswers';
      break;
    }
    case 'timedlist': {
      const { items } = question;
      if (items.some((item) => item.text === '')) return 'problemListEmpty';
      if (items.length < LIMITS.minListItems || items.length > LIMITS.maxListItems) return 'problemListItems';
      if (duplicateListSpelling(question) !== '') return 'problemListDuplicate';
      if (question.points * items.length > LIMITS.maxPoints) return 'problemListPoints';
      if (question.minus !== null && (!Number.isInteger(question.minus) || question.minus < 1 || question.minus > LIMITS.maxPoints)) return 'problemListMinus';
      break;
    }
    case 'letterwords': {
      const { set } = question;
      // Набір — окремий текст проблеми для кожного способу: випадковий (кількість) і свій (літери).
      if (set.kind === 'random' ? !Number.isInteger(set.count) || set.count < LIMITS.minLetterSet || set.count > LIMITS.maxLetterSet : letterSet(set.letters) === null) return 'problemLettersSet';
      if (questionPrice(question) > LIMITS.maxPoints) return 'problemLettersPoints';
      break;
    }
    case 'moreless': {
      const { pairs } = question;
      if (pairs.length < LIMITS.minMoreLessPairs || pairs.length > LIMITS.maxMoreLessPairs) return 'problemMoreLessPairs';
      if (pairs.some((pair) => [pair.prompt, pair.a.text, pair.a.value, pair.b.text, pair.b.value].some((text) => text === ''))) return 'problemMoreLessEmpty';
      if (pairs.some((pair) => answerKey(pair.a.text) === answerKey(pair.b.text))) return 'problemMoreLessSame';
      if (pairs.some((pair) => !Number.isInteger(pair.points) || pair.points < 1 || pair.points > LIMITS.maxPoints)) return 'problemMoreLessPairPoints';
      if (pairs.reduce((sum, pair) => sum + pair.points, 0) > LIMITS.maxPoints) return 'problemMoreLessPoints';
      break;
    }
    case 'sudoku': {
      if (!isSudokuGrid(question.givens)) return 'problemSudokuGrid';
      const check = sudokuCheck(question.givens);
      if (check.conflicts.length > 0) return 'problemSudokuConflict';
      if (check.count === 0) return 'problemSudokuNone';
      if (check.count > 1) return 'problemSudokuMany';
      if (check.solution !== question.solution) return 'problemSudokuGrid';
      break;
    }
    case 'crossword': {
      const { entries } = question;
      if (entries.length < LIMITS.minCrosswordWords || entries.length > LIMITS.maxCrosswordWords) return 'problemCrosswordCount';
      if (entries.some((entry) => entry.answer === '')) return 'problemCrosswordWords';
      if (entries.some((entry) => entry.clue === '')) return 'problemCrosswordClue';
      const warning = buildCrossword(question).warning;
      if (warning?.kind === 'word') return 'problemCrosswordWord';
      if (warning?.kind === 'duplicate') return 'problemCrosswordDuplicate';
      if (warning?.kind === 'unplaced') return 'problemCrosswordLayout';
      if (warning?.kind === 'key') return 'problemCrosswordKey';
      if (warning?.kind === 'missing') return 'problemCrosswordKeyLetters';
      const issue = crosswordIssue(question);
      if (issue !== null) return CROSSWORD_PROBLEMS[issue];
      break;
    }
    case 'jigsaw': {
      if (question.imageUrl !== null) return 'problemJigsawImage';
      if (question.photo === '') return 'problemJigsawPhoto';
      const { rows, cols } = question;
      const pieces = rows * cols;
      const ratio = jigsawPieceRatio(rows, cols, question.aspect);
      if (pieces < LIMITS.minJigsawPieces || pieces > LIMITS.maxJigsawPieces || ratio < 0.5 || ratio > 2 || question.tabs.length !== jigsawEdgeCount(rows, cols)) return 'problemJigsawGrid';
      break;
    }
    case 'spotdiff': {
      if (question.imageUrl !== null || question.original === '' || question.changed === '') return 'problemSpotdiffImages';
      if (question.original === question.changed) return 'problemSpotdiffSame';
      if (question.spots.length < SPOT_MIN_COUNT || question.spots.length > SPOT_MAX_COUNT) return 'problemSpotdiffSpots';
      break;
    }
    case 'memory': {
      const cards = question.pairs.flatMap((pair) => [pair.a, pair.b]);
      if (question.pairs.length !== memoryGridSize(question.grid).pairs || cards.some((c) => (c.text.trim() !== '') === (c.imageUrl !== undefined))) return 'problemMemoryPairs';
      if (new Set(cards.map(memoryCardKey)).size !== cards.length) return 'problemMemoryDuplicate';
      break;
    }
    case 'melody': {
      const { track } = question;
      const valid = track.source === 'file' ? AUDIO_URL.test(track.url) : YOUTUBE_ID.test(track.id);
      if (!valid || !Number.isInteger(track.start) || track.start < 0 || track.start > LIMITS.maxVideoStart) return 'problemMelodyTrack';
      if (question.accepted.length === 0 || question.accepted.some((s) => s.trim() === '')) return 'problemMelodyAccepted';
      break;
    }
    case 'drawing':
      if ((question.accepted[0] ?? '') === '') return 'problemDrawingWord';
      // Довше за поле вгадування не впише ніхто (буває з імпорту: редактор довше не пускає).
      if (question.accepted.some((s) => s.length > LIMITS.drawGuess)) return 'problemDrawingLong';
      break;
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
  if (question.type === 'sort' && !place.sort) return 'problemSortPlace';
  if (question.type === 'chain' && !place.chain) return 'problemChainPlace';
  if (question.type === 'wordladder' && !place.wordladder) return 'problemWordLadderPlace';
  if (question.type === 'timedlist' && !place.timedlist) return 'problemListPlace';
  if (question.type === 'letterwords' && !place.letterwords) return 'problemLettersPlace';
  if (question.type === 'moreless' && !place.moreless) return 'problemMoreLessPlace';
  if (question.type === 'drawing' && !place.drawing) return 'problemDrawingPlace';
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

const wholeBet = (value: number, min: number) => Number.isInteger(value) && value >= min && value <= LIMITS.maxBet;
/** Стартова ставка, крок чи найбільша ставка поза межами. */
const betsNumbersBroken = (round: BetsRound) => !wholeBet(round.betStart, 1) || !wholeBet(round.betStep, 0) || (round.betMax !== null && !wholeBet(round.betMax, 1));
/** Налаштування ставок не дають зберегти: числа чи мінімум останнього запитання над найбільшою ставкою. */
const betsSettingsBroken = (round: BetsRound) => betsNumbersBroken(round) || betsRoundIssue(round, round.questions.length) !== null;

/** Крок ставки «Аукціону» поза межами 1…maxBet. Схема вимагає крок і в режимі free, тому RoundSettings при перемиканні на free повертає некоректний крок до типового. */
const auctionNumbersBroken = (round: AuctionRound) => !wholeBet(round.bidStep, 1);

/** Ціна чи таймер «Правди про гравця» поза межами. */
const truthNumbersBroken = (round: TruthRound) =>
  !Number.isInteger(round.points) || round.points < 0 || round.points > LIMITS.maxPoints || !Number.isInteger(round.timeLimit) || round.timeLimit < LIMITS.minTime || round.timeLimit > LIMITS.maxTime;

/** «Квест із кодом»: що не так з кодом, порядком, бонусом чи запитаннями раунду (ключі проблем), без проблем самих запитань. */
function questIssues(round: QuestRound, quiz: Quiz): TextKey[] {
  const issues: TextKey[] = [];
  const length = Array.from(round.code).length;
  if (round.prompt.trim() === '') issues.push('problemQuestPrompt');
  if (length < LIMITS.minQuestCode || length > LIMITS.maxQuestCode) issues.push('problemQuestCode');
  const sorted = [...round.order].sort((a, b) => a - b);
  if (sorted.length !== length || sorted.some((value, index) => value !== index)) issues.push('problemQuestOrder');
  if (round.questions.length < Math.max(length, LIMITS.minQuestCode)) issues.push('problemQuestShort');
  const allowed: readonly string[] = QUEST_TYPES;
  if (round.questions.some((question) => !allowed.includes(question.type))) issues.push('problemQuestType');
  if (!Number.isInteger(round.tries) || round.tries < 1 || round.tries > LIMITS.maxQuestTries) issues.push('problemRules');
  const { bonus } = round;
  if (bonus.kind === 'points') {
    if (!Number.isInteger(bonus.points) || bonus.points < 1 || bonus.points > LIMITS.maxPoints) issues.push('problemRules');
  } else if (bonus.buff === 'stealth' || !allowedBuffs(quiz).includes(bonus.buff) || (bonus.first !== null && (!Number.isInteger(bonus.first) || bonus.first < 1 || bonus.first > LIMITS.maxPlayers))) {
    issues.push('problemQuestBuff');
  }
  return issues;
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
          if (cellIssue(current, cells[index]) !== null) return { round, question: question + index, cell: { category, index } };
        }
        question += cells.length;
      }
      continue;
    }
    // Запитань у «Правді про гравця» немає: проблема — другий такий раунд чи числа раунду.
    if (current.type === 'truth') {
      if (truthNumbersBroken(current) || rounds.findIndex((r) => r.type === 'truth') !== round) return { round, question: 0, cell: null };
      continue;
    }
    // Налаштування ставок (числа, найбільша ставка) зламані: вказуємо на раунд, а не на запитання.
    if (current.type === 'bets' && betsSettingsBroken(current)) return { round, question: 0, cell: null };
    if (current.type === 'auction' && auctionNumbersBroken(current)) return { round, question: 0, cell: null };
    if (current.type === 'quest' && questIssues(current, quiz).length > 0) return { round, question: 0, cell: null };
    const question = current.questions.findIndex((q, index) => problemKey(q, roundPlace(quiz, round, index)) !== null || ((current.type === 'bets' || current.type === 'auction') && q.betsCut === undefined));
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

/** Перше написання, що веде у два пункти списку (тим самим ключем, що й схема), — так, як його ввів ведучий; повтор у межах пункту не заважає. */
function duplicateListSpelling(question: Extract<Question, { type: 'timedlist' }>): string {
  const seen = new Set<string>();
  for (const item of question.items) {
    const mine = new Set<string>();
    for (const spelling of [item.text, ...item.accepted]) {
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

/** Літери ключа, яких бракує в словах кросворду ([] — вистачає або ключ ще не придатний). */
const crosswordMissing = (question: Crossword): string[] => {
  const warning = buildCrossword(question).warning;
  return warning?.kind === 'missing' ? warning.letters : [];
};

/** Текст проблеми запитання; числа меж підставляються з LIMITS, а для підказок ще й з самого запитання. */
const problemText = (key: TextKey, index: number, question?: Question) =>
  t(key, {
    index,
    min: key === 'problemCrosswordWord' ? LIMITS.minCrosswordWord : key === 'problemCrosswordKey' ? LIMITS.minCrosswordKey : key === 'problemCrosswordCount' ? LIMITS.minCrosswordWords : key === 'problemPuzzleLimits' ? LIMITS.minTime : key === 'problemJigsawLimits' ? LIMITS.minJigsawTime : key === 'problemSpotdiffLimits' ? LIMITS.minSpotdiffTime : key === 'problemMemoryLimits' ? LIMITS.minMemoryTime : key === 'problemMelodyLimits' ? LIMITS.minMelodyTime : key === 'problemBluffSpares' ? LIMITS.minBluffSpares : key === 'problemBluffChoiceTime' ? LIMITS.minTime : key === 'problemListItems' ? LIMITS.minListItems : key === 'problemLettersSet' ? LIMITS.minLetterSet : key === 'problemMoreLessPairs' ? LIMITS.minMoreLessPairs : LIMITS.minAudioSeconds,
    max:
      key === 'problemCrosswordWord'
        ? LIMITS.maxCrosswordWord
        : key === 'problemCrosswordKey'
        ? LIMITS.maxCrosswordKey
        : key === 'problemCrosswordCount'
        ? LIMITS.maxCrosswordWords
        : key === 'problemPuzzleLimits' || key === 'problemJigsawLimits' || key === 'problemSpotdiffLimits' || key === 'problemMemoryLimits'
        ? LIMITS.maxPuzzleTime
        : key === 'problemBluffTruthLong'
        ? LIMITS.bluffLie
        : key === 'problemBluffChoiceTime'
          ? LIMITS.maxTime
          : key === 'problemListItems'
            ? LIMITS.maxListItems
            : key === 'problemLettersSet'
              ? LIMITS.maxLetterSet
              : key === 'problemMoreLessPairs'
                ? LIMITS.maxMoreLessPairs
                : key === 'problemDrawingLong'
                ? LIMITS.drawGuess
                : key === 'problemListPoints' || key === 'problemListMinus' || key === 'problemLettersPoints' || key === 'problemMoreLessPairPoints' || key === 'problemMoreLessPoints'
                  ? LIMITS.maxPoints
                  : LIMITS.maxAudioSeconds,
    points: LIMITS.maxPoints,
    // Літери, яких бракує для ключа кросворду.
    letters: question?.type === 'crossword' ? crosswordMissing(question).join(', ') : '',
    // Номер першого пункту списку без назви.
    item: question?.type === 'timedlist' ? question.items.findIndex((entry) => entry.text === '') + 1 : 0,
    clueMin: LIMITS.minClueSeconds,
    clueMax: LIMITS.maxClueSeconds,
    pinMax: LIMITS.pinMaxZeroRadius,
    pinFullMax: LIMITS.pinMaxFullRadius,
    wallMin: LIMITS.minWallMistakes,
    wallMax: LIMITS.maxWallMistakes,
    cloudMax: LIMITS.maxCloudWords,
    tile: question?.type === 'wall' ? duplicateTile(question) : '',
    total: question?.type === 'survey' ? surveyTotal(question) : 0,
    text: question?.type === 'survey' ? duplicateSpelling(question) : question?.type === 'timedlist' ? duplicateListSpelling(question) : question?.type === 'bluff' ? bluffSpareText(question, key) : '',
    surveyMin: LIMITS.minSurveyRows,
    surveyMax: LIMITS.maxSurveyAnswers,
    letterMin: LIMITS.minWordLadderLetters,
    letterMax: LIMITS.maxWordLadderLetters,
    // Найменше кроків — 1 (та сама межа, що в перевірці maxSteps вище).
    stepsMin: 1,
    stepsMax: LIMITS.maxWordLadderSteps,
    ...(question?.type === 'clues'
      ? { count: question.clues.length, at: lastClueAt(question), need: question.cluePace === 'self' ? LIMITS.selfCluesMinTime : lastClueAt(question) + LIMITS.clueTailSeconds }
      : {}),
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
    if (round.type !== 'final' && !(round.type === 'blitz' ? blitzRulesSchema : roundRulesSchema).safeParse(rulesOf(round)).success) problems.push(where(t('problemRules')));
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
          const key = cellIssue(round, cell);
          if (key !== null) problems.push(where(cellProblem(categoryIndex + 1, index + 1, key, cell.question)));
        });
      });
      for (const issue of boardRoundIssues(round)) {
        problems.push(where(t(issue === 'too_many_questions' ? 'problemBoardTooMany' : 'problemGeneric', { index: 1 })));
      }
      return;
    }
    if (round.type === 'truth') {
      if (draft.rounds.findIndex((r) => r.type === 'truth') !== roundIndex) problems.push(where(t('problemTruthOnce')));
      if (truthNumbersBroken(round)) problems.push(where(t('problemTruthNumbers', { max: LIMITS.maxPoints, min: LIMITS.minTime, maxTime: LIMITS.maxTime })));
      return;
    }
    if (round.type === 'bets') {
      if (betsNumbersBroken(round)) problems.push(where(t('problemRules')));
      else if (betsRoundIssue(round, round.questions.length) !== null) {
        problems.push(where(t('problemBetsMax', { min: betMinimum(round, round.questions.length - 1), max: round.betMax ?? 0 })));
      }
      if (round.questions.some((question) => question.betsCut === undefined)) problems.push(where(t('problemBetsCut')));
    }
    if (round.type === 'auction') {
      if (auctionNumbersBroken(round)) problems.push(where(t('problemRules')));
      if (round.questions.some((question) => question.betsCut === undefined)) problems.push(where(t('problemAuctionCut')));
    }
    if (round.type === 'quest') {
      for (const key of questIssues(round, draft)) {
        problems.push(where(key === 'problemQuestCode' ? t(key, { min: LIMITS.minQuestCode, max: LIMITS.maxQuestCode }) : key === 'problemQuestShort' ? t(key, { length: Math.max(Array.from(round.code).length, LIMITS.minQuestCode) }) : t(key)));
      }
    }
    if (round.type === 'wipeout') {
      if (round.questions.length < LIMITS.minWipeoutQuestions) problems.push(where(t('problemWipeoutFew', { min: LIMITS.minWipeoutQuestions })));
      if (round.questions.length > LIMITS.maxWipeoutQuestions) problems.push(where(t('problemWipeoutMany', { max: LIMITS.maxWipeoutQuestions })));
      const allowed: readonly string[] = WIPEOUT_TYPES;
      if (round.questions.some((question) => !allowed.includes(question.type))) problems.push(where(t('problemWipeoutType')));
    }
    if (round.type === 'survival') {
      if (round.questions.length < LIMITS.minSurvivalQuestions) problems.push(where(t('problemSurvivalFew', { min: LIMITS.minSurvivalQuestions })));
      if (round.questions.length > LIMITS.maxSurvivalQuestions) problems.push(where(t('problemSurvivalMany', { max: LIMITS.maxSurvivalQuestions })));
      const allowed: readonly string[] = SURVIVAL_TYPES;
      // Для «удачі» порожні питання на виживання не рахуються: вони не потрібні й не зберігаються.
      const trials = round.trial === 'luck' ? round.trials.filter((trial) => trial.text.trim() !== '') : round.trials;
      if ([...round.questions, ...trials].some((question) => !allowed.includes(question.type))) problems.push(where(t('problemSurvivalType')));
      if (!Number.isInteger(round.survivors) || round.survivors < 1 || round.survivors > LIMITS.maxSurvivors) {
        problems.push(where(t('problemSurvivors', { max: LIMITS.maxSurvivors })));
      }
      if (!Number.isInteger(round.bonus) || round.bonus < 0 || round.bonus > LIMITS.maxPoints) {
        problems.push(where(t('problemSurvivalBonus', { max: LIMITS.maxPoints })));
      }
      if (round.trial === 'question' && round.trials.length === 0) problems.push(where(t('problemSurvivalTrials')));
      round.trials.forEach((trial, index) => {
        if (round.trial === 'luck' && trial.text.trim() === '') return;
        const key = problemKey(trial, roundPlace(draft, roundIndex, 0));
        if (key === null) return;
        // «Запитання N: текст» → «Питання на виживання N: текст».
        const problem = problemText(key, index + 1, trial).replace(/^[^:]*:\s*/, '');
        problems.push(where(t('problemSurvivalTrial', { index: index + 1, problem })));
      });
    }
    if (round.type === 'ladder') {
      if (round.questions.length < LIMITS.minLadderQuestions) problems.push(where(t('problemLadderFew', { min: LIMITS.minLadderQuestions })));
      if (round.questions.length > LIMITS.maxLadderQuestions) problems.push(where(t('problemLadderMany', { max: LIMITS.maxLadderQuestions })));
      if (round.questions.some((question) => question.type !== 'single' || question.options.length !== LIMITS.ladderOptions)) {
        problems.push(where(t('problemLadderType')));
      }
      const levelsBad =
        round.levels.length !== round.questions.length ||
        round.levels.some((level, i) => !Number.isInteger(level) || level < 1 || level > LIMITS.maxLadderLevel || (i > 0 && level <= round.levels[i - 1]));
      if (levelsBad) problems.push(where(t('problemLadderLevels', { max: LIMITS.maxLadderLevel })));
      if (new Set(round.safe).size !== round.safe.length || round.safe.some((s) => s >= round.questions.length - 1)) {
        problems.push(where(t('problemLadderSafe')));
      }
    }
    round.questions.forEach((question, index) => {
      const key = problemKey(question, roundPlace(draft, roundIndex, index));
      if (key !== null) problems.push(where(problemText(key, index + 1, question)));
    });
  });
  if (draft.duels !== undefined) problems.push(...duelProblems(draft.duels));
  if (draft.spares !== undefined) problems.push(...spareProblems(draft.spares));
  if (draft.settings.buffs?.includes('swap') && draft.spares === undefined && categorySparesOf(draft).length === 0) problems.push(t('problemSparesEmpty'));
  const teams = draft.settings.teams;
  const teamNames = teams?.names ?? [];
  if (teamNames.some((name) => name.trim() === '')) problems.push(t('problemTeamName'));
  else if (teamNames.some((name) => !isStorable(name))) problems.push(t('problemTeamUnstorable'));
  else if (teams && teamNames.length !== teams.count) problems.push(t('problemTeamCount'));
  else if (new Set(teamNames.map(answerKey)).size < teamNames.length) problems.push(t('problemTeamNames'));
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
      if (messages.includes('wipeout_type')) problems.push(t('problemWipeoutType'));
      if (messages.includes('too_many_questions')) problems.push(t('problemQuizTooMany', { max: LIMITS.maxQuizQuestions }));
      if (messages.includes('duplicate_question_ids') || messages.includes('duplicate_round_ids')) problems.push(t('problemDuplicateIds'));
      if (messages.includes('survival_type')) problems.push(t('problemSurvivalType'));
      if (messages.includes('ladder_type')) problems.push(t('problemLadderType'));
      if (messages.includes('ladder_lifelines')) problems.push(t('problemLadderLifelines'));
      if (messages.includes('ladder_levels')) problems.push(t('problemLadderLevels', { max: LIMITS.maxLadderLevel }));
      if (messages.includes('ladder_safe')) problems.push(t('problemLadderSafe'));
      if (messages.includes('survival_trials')) problems.push(t('problemSurvivalTrials'));
      if (messages.includes('survival_trial_media')) problems.push(t('problemSurvivalTrialMedia'));
      if (messages.includes('spare_type')) problems.push(t('problemSpareType'));
      if (messages.includes('puzzle_place')) problems.push(t('problemPuzzlePlace', { index: 1 }));
      if (messages.includes('quest_code')) problems.push(t('problemQuestCode', { min: LIMITS.minQuestCode, max: LIMITS.maxQuestCode }));
      if (messages.includes('quest_order')) problems.push(t('problemQuestOrder'));
      if (messages.includes('quest_buff')) problems.push(t('problemQuestBuff'));
      if (messages.includes('quest_type')) problems.push(t('problemQuestType'));
      if (messages.includes('puzzles_type')) problems.push(t('problemPuzzlesType', { index: 1 }));
      if (messages.includes('spare_video')) problems.push(t('problemSpareVideo'));
      if (messages.includes('duplicate_spare_ids')) problems.push(t('problemSpareDuplicate'));
      if (messages.includes('spares_empty')) problems.push(t('problemSparesEmpty'));
      if (messages.includes('team_names')) problems.push(t('problemTeamCount'));
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
