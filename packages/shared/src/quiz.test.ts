import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ANSWER_WINDOW,
  DEFAULT_RULES,
  DEFAULT_SETTINGS,
  pickAnswererSchema,
  BUFF_KINDS,
  DEBUFF_KINDS,
  LEGACY_DEBUFFS,
  READY_BUFFS,
  allowedBuffs,
  allowedDebuffs,
  buffSchema,
  buyDebuffSchema,
  debuffPrice,
  retrySchema,
  voteSchema,
  hintSchema,
  IMAGE_LIMITS,
  answerSchema,
  finalRoundSchema,
  guessSchema,
  joinSchema,
  questionSchema,
  ROUND_TYPES,
  QUESTION_TYPES,
  questionsOf,
  questionPrice,
  sortSchema,
  declareSchema,
  duelAnswerSchema,
  duelPickSchema,
  duelsSchema,
  LIMITS,
  REVEAL_MIN_SHARE,
  SIMPLE_TYPES,
  answerWindowMs,
  audioLeadMs,
  proximityPartial,
  cluesAt,
  isSelfPaced,
  cloudKey,
  cloudWords,
  isUnscored,
  duelThreshold,
  duelShortfall,
  cloudHideSchema,
  wallScored,
  wallShare,
  clueShare,
  pinDistance,
  pinShare,
  revealShare,
  sliderShare,
  allSpares,
  questionIdsOf,
  withUniqueQuestionIds,
  boardSpareSource,
  categorySparesOf,
  quizSchema,
  boardRoundIssues,
  cellAnswerMode,
  roundQuestions,
  roundSchema,
  rulesOf,
  WIPEOUT_TYPES,
  SURVIVAL_TYPES,
  roundTrials,
  surveyOrder,
  surveyShare,
  surveyHitsOf,
  answerKey,
  wordLadderCheckSchema,
  wordLadderWordSchema,
  timedListWordSchema,
  letterWordSchema,
  letterCheckSchema,
  moreLessPickSchema,
  drawOpSchema,
  drawGuessSchema,
  type Answer,
  type BoardRound,
  type Question,
  type Quiz,
  emptyBrief,
  roundBrief,
  generateSudoku,
  layoutCrossword,
  pickKeyCells,
  duelQuestionSchema,
  puzzleFillSchema,
  jigsawPlaceSchema,
  jigsawHoldSchema,
  jigsawGrid,
  jigsawTabs,
  fitsPuzzlesRound,
  isPuzzle,
  puzzleDoneSchema,
  PUZZLE_BATCHES_PER_SECOND,
  spotdiffTapSchema,
  SPOTDIFF_TAPS_PER_SECOND,
  SPOTDIFF_MISSES,
  SPOTDIFF_FREEZE_MS,
  SPOTDIFF_MAX_FREEZE_MS,
  spotdiffFreezeMs,
  SPOT_MIN_ASPECT,
  SPOT_MAX_ASPECT,
} from './index';

const single = {
  id: 'q1',
  type: 'single',
  text: 'Столиця України?',
  imageUrl: null,
  timeLimit: 20,
  points: 1000,
  options: [
    { id: 'a', text: 'Львів' },
    { id: 'b', text: 'Київ' },
  ],
  correctId: 'b',
};

/** Класичний раунд із типовими налаштуваннями. */
const round = (id: string, questions: object[], patch: object = {}) => ({
  id,
  type: 'classic',
  title: '',
  speedBonus: true,
  shuffleOptions: false,
  rules: DEFAULT_RULES,
  questions,
  ...patch,
});

/** Копії запитання з різними id: q-<prefix>-0, q-<prefix>-1, … */
const many = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, i) => ({ ...single, id: `q-${prefix}-${i}` }));

const valid = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

const spareSingle = {
  id: 's1',
  type: 'single',
  text: 'Яка річка тече через Київ?',
  imageUrl: null,
  timeLimit: LIMITS.defaultTime,
  points: LIMITS.defaultPoints,
  options: [
    { id: 'a', text: 'Дніпро' },
    { id: 'b', text: 'Дунай' },
  ],
  correctId: 'a',
};
const orderSpare = {
  id: 's2',
  type: 'order',
  text: 'Розставте за зростанням',
  imageUrl: null,
  timeLimit: LIMITS.defaultTime,
  points: LIMITS.defaultPoints,
  items: [
    { id: 'i1', text: 'Один' },
    { id: 'i2', text: 'Два' },
    { id: 'i3', text: 'Три' },
  ],
};

describe('round description', () => {
  it('a round may carry a description and old rounds without one still parse', () => {
    const quiz = (patch: object) => ({ title: 'Т', description: '', settings: DEFAULT_SETTINGS, rounds: [round('r1', [single], patch)] });
    expect(quizSchema.parse(quiz({})).rounds[0].description).toBeUndefined();
    expect(quizSchema.parse(quiz({ description: '  Кіно 90-х  ' })).rounds[0].description).toBe('Кіно 90-х');
    expect(valid(quizSchema, quiz({ description: 'а'.repeat(600) }))).toBe(true);
    expect(valid(quizSchema, quiz({ description: 'а'.repeat(601) }))).toBe(false);
  });
});

describe('questionSchema', () => {
  it('accepts a valid single-choice question', () => {
    expect(valid(questionSchema, single)).toBe(true);
  });

  it('rejects a correct id that is not among the options', () => {
    expect(valid(questionSchema, { ...single, correctId: 'z' })).toBe(false);
  });

  it('rejects duplicate option ids', () => {
    const options = [
      { id: 'a', text: 'Львів' },
      { id: 'a', text: 'Київ' },
    ];
    expect(valid(questionSchema, { ...single, options, correctId: 'a' })).toBe(false);
  });

  it('rejects a time limit outside 5–120 seconds', () => {
    expect(valid(questionSchema, { ...single, timeLimit: 4 })).toBe(false);
    expect(valid(questionSchema, { ...single, timeLimit: 121 })).toBe(false);
  });

  it('rejects multi-choice with a repeated correct id', () => {
    const multi = { ...single, type: 'multi', correctIds: ['a', 'a'] };
    expect(valid(questionSchema, multi)).toBe(false);
  });

  it('order labels are optional and at most 40 characters', () => {
    const order = {
      id: 'q6',
      type: 'order',
      text: 'Розташуйте міста з заходу на схід',
      imageUrl: null,
      timeLimit: 20,
      points: 1000,
      items: [
        { id: 'u', text: 'Ужгород' },
        { id: 'l', text: 'Львів' },
        { id: 'k', text: 'Київ' },
      ],
    };
    const withLabels = (patch: object) => ({ ...order, ...patch });
    expect(valid(questionSchema, order)).toBe(true);
    expect(questionSchema.parse(withLabels({ topLabel: '  Найбільший ', bottomLabel: 'Найменший' }))).toMatchObject({ topLabel: 'Найбільший', bottomLabel: 'Найменший' });
    expect(valid(questionSchema, withLabels({ topLabel: 'а'.repeat(40) }))).toBe(true);
    expect(valid(questionSchema, withLabels({ bottomLabel: 'а'.repeat(41) }))).toBe(false);
  });

  it('an option may be a picture, then its text is optional, but never both empty', () => {
    const pic = '/uploads/abcdefabcdefabcd.png';
    const withOptions = (options: object[]) => ({ ...single, options });
    const order = {
      id: 'q6',
      type: 'order',
      text: 'Розташуйте міста з заходу на схід',
      imageUrl: null,
      timeLimit: 20,
      points: 1000,
      items: [
        { id: 'u', text: 'Ужгород' },
        { id: 'l', text: 'Львів' },
        { id: 'k', text: 'Київ' },
      ],
    };
    expect(valid(questionSchema, single)).toBe(true);
    expect(valid(questionSchema, withOptions([{ id: 'a', text: '', imageUrl: pic }, { id: 'b', text: 'Київ', imageUrl: pic }, { id: 'c', text: 'Одеса' }]))).toBe(true);
    expect(valid(questionSchema, withOptions([{ id: 'a', text: '  ' }, { id: 'b', text: 'Київ' }]))).toBe(false);
    expect(valid(questionSchema, withOptions([{ id: 'a', text: 'Львів', imageUrl: 'https://evil.example/x.png' }, { id: 'b', text: 'Київ' }]))).toBe(false);
    expect(valid(questionSchema, { ...order, items: [{ id: 'u', text: '', imageUrl: pic }, ...order.items.slice(1)] })).toBe(false);
  });

  it('rejects an order question with fewer than three items', () => {
    const order = {
      id: 'q6',
      type: 'order',
      text: 'Розташуйте міста з заходу на схід',
      imageUrl: null,
      timeLimit: 20,
      points: 1000,
      items: [
        { id: 'l', text: 'Львів' },
        { id: 'k', text: 'Київ' },
      ],
    };
    expect(valid(questionSchema, order)).toBe(false);
  });

  it('rejects a negative numeric tolerance', () => {
    const numeric = {
      id: 'q5',
      type: 'numeric',
      text: 'Яка висота Говерли в метрах?',
      imageUrl: null,
      timeLimit: 20,
      points: 1000,
      correct: 2061,
      tolerance: -1,
    };
    expect(valid(questionSchema, numeric)).toBe(false);
  });
});

describe('quizSchema', () => {
  const quiz = { title: 'Географія', description: '', settings: DEFAULT_SETTINGS, rounds: [round('r1', [single])] };
  const withRules = (rules: object) => ({
    ...quiz,
    rounds: [round('r1', [single], { rules: { ...DEFAULT_RULES, ...rules } })],
  });

  it('accepts a quiz with one question', () => {
    expect(valid(quizSchema, quiz)).toBe(true);
  });

  it('an old quiz without the newcomers flag parses unchanged; the flag is a boolean', () => {
    expect(quizSchema.parse(quiz).settings).toEqual(quiz.settings);
    expect('newcomers' in quizSchema.parse(quiz).settings).toBe(false);
    expect(quizSchema.safeParse({ ...quiz, settings: { ...quiz.settings, newcomers: true } }).success).toBe(true);
    expect(quizSchema.safeParse({ ...quiz, settings: { ...quiz.settings, newcomers: 'так' } }).success).toBe(false);
  });

  it('rejects a quiz without questions', () => {
    expect(valid(quizSchema, { ...quiz, rounds: [round('r1', [])] })).toBe(false);
  });

  it('accepts a quiz with two classic rounds', () => {
    const two = { ...quiz, rounds: [round('r1', [single]), round('r2', [{ ...single, id: 'q2' }], { title: 'Другий' })] };
    expect(valid(quizSchema, two)).toBe(true);
  });

  it('rejects a quiz with no rounds or with more than ten', () => {
    expect(valid(quizSchema, { ...quiz, rounds: [] })).toBe(false);
    const eleven = Array.from({ length: 11 }, (_, i) => round(`r${i}`, many(String(i), 1)));
    expect(valid(quizSchema, { ...quiz, rounds: eleven })).toBe(false);
  });

  it('rejects more than 200 questions in the whole quiz', () => {
    const rounds = [round('r1', many('a', 100)), round('r2', many('b', 100)), round('r3', many('c', 1))];
    expect(valid(quizSchema, { ...quiz, rounds })).toBe(false);
    expect(valid(quizSchema, { ...quiz, rounds: rounds.slice(0, 2) })).toBe(true);
  });

  it('rejects more than 100 questions in one round', () => {
    expect(valid(quizSchema, { ...quiz, rounds: [round('r1', many('a', 101))] })).toBe(false);
  });

  it('rejects the same question id in two rounds and the same round id twice', () => {
    expect(valid(quizSchema, { ...quiz, rounds: [round('r1', [single]), round('r2', [single])] })).toBe(false);
    const sameRoundId = [round('r1', [single]), round('r1', [{ ...single, id: 'q2' }])];
    expect(valid(quizSchema, { ...quiz, rounds: sameRoundId })).toBe(false);
  });

  it('rejects round rules outside their limits', () => {
    expect(valid(quizSchema, withRules({ partial: 50 }))).toBe(true);
    expect(valid(quizSchema, withRules({ partial: 95 }))).toBe(false);
    expect(valid(quizSchema, withRules({ streak: { length: 2, bonus: { kind: 'fixed', value: 2000 } } }))).toBe(true);
    expect(valid(quizSchema, withRules({ streak: { length: 1, bonus: { kind: 'percent', value: 50 } } }))).toBe(false);
    expect(valid(quizSchema, withRules({ streak: { length: 2, bonus: { kind: 'percent', value: 201 } } }))).toBe(false);
    expect(valid(quizSchema, withRules({ multiplier: 3 }))).toBe(true);
    expect(valid(quizSchema, withRules({ multiplier: 4 }))).toBe(false);
  });

  it('rejects a round title longer than 60 characters', () => {
    expect(valid(quizSchema, { ...quiz, rounds: [round('r1', [single], { title: 'я'.repeat(61) })] })).toBe(false);
  });

  describe('blitz round', () => {
    const blitz = (patch: object = {}) => ({
      id: 'b1',
      type: 'blitz',
      title: 'Бліц',
      shuffleOptions: false,
      answerWindow: DEFAULT_ANSWER_WINDOW,
      attempts: 1,
      check: 'auto',
      rules: { ...DEFAULT_RULES, partial: null },
      questions: [{ ...single, id: 'q2' }],
      ...patch,
    });
    const withBlitz = (patch: object = {}) => ({ ...quiz, rounds: [round('r1', [single]), blitz(patch)] });

    it('is accepted next to a classic round', () => {
      expect(valid(quizSchema, withBlitz())).toBe(true);
      expect(valid(quizSchema, withBlitz({ answerWindow: null, attempts: null, check: 'manual' }))).toBe(true);
    });

    it('rejects a window under five seconds, four attempts and partial points', () => {
      expect(valid(quizSchema, withBlitz({ answerWindow: 4 }))).toBe(false);
      expect(valid(quizSchema, withBlitz({ attempts: 4 }))).toBe(false);
      expect(valid(quizSchema, withBlitz({ rules: { ...DEFAULT_RULES, partial: 50 } }))).toBe(false);
    });

    it('blitz series steps are optional and bounded', () => {
      const rules = (patch: object) => ({ rules: { ...DEFAULT_RULES, partial: null, ...patch } });
      expect(valid(quizSchema, withBlitz())).toBe(true);
      expect(valid(quizSchema, withBlitz(rules({ streakPlus: null })))).toBe(true);
      expect(valid(quizSchema, withBlitz(rules({ streakPlus: { step: 250 }, streakMinus: { step: 2000 } })))).toBe(true);
      for (const bad of [{ step: 0 }, { step: 2001 }, { step: 2.5 }, {}]) {
        expect(valid(quizSchema, withBlitz(rules({ streakPlus: bad })))).toBe(false);
        expect(valid(quizSchema, withBlitz(rules({ streakMinus: bad })))).toBe(false);
      }
      const parsed = quizSchema.parse(withBlitz(rules({ streakPlus: { step: 250 } })));
      const parsedRound = parsed.rounds[1];
      expect(parsedRound?.type === 'blitz' && parsedRound.rules.streakPlus).toEqual({ step: 250 });
    });
  });

  it('lists every question in the order of rounds', () => {
    const rounds = [round('r1', [single, { ...single, id: 'q2' }]), round('r2', [{ ...single, id: 'q3' }])];
    const parsed = quizSchema.parse({ ...quiz, rounds });
    expect(questionsOf(parsed).map((q) => q.id)).toEqual(['q1', 'q2', 'q3']);
  });
});

describe('answerSchema', () => {
  it('accepts an answer of each type', () => {
    expect(valid(answerSchema, { type: 'single', optionId: 'a' })).toBe(true);
    expect(valid(answerSchema, { type: 'multi', optionIds: ['a', 'c'] })).toBe(true);
    expect(valid(answerSchema, { type: 'boolean', value: true })).toBe(true);
    expect(valid(answerSchema, { type: 'text', value: 'Одеса' })).toBe(true);
    expect(valid(answerSchema, { type: 'numeric', value: 2061 })).toBe(true);
    expect(valid(answerSchema, { type: 'order', itemIds: ['u', 'l', 'k'] })).toBe(true);
  });

  it('accepts a slider answer and rejects a non-finite one', () => {
    expect(valid(answerSchema, { type: 'slider', value: 1.5 })).toBe(true);
    expect(valid(answerSchema, { type: 'slider', value: Number.POSITIVE_INFINITY })).toBe(false);
  });

  it('rejects a numeric answer that is not a finite number', () => {
    expect(valid(answerSchema, { type: 'numeric', value: Number.NaN })).toBe(false);
    expect(valid(answerSchema, { type: 'numeric', value: Number.POSITIVE_INFINITY })).toBe(false);
  });

  it('rejects a text answer longer than 200 characters', () => {
    expect(valid(answerSchema, { type: 'text', value: 'я'.repeat(201) })).toBe(false);
  });
});

describe('text that the database cannot store', () => {
  const NUL = 'ab\u0000cd';
  const LONE_SURROGATE = 'ab\ud800cd';
  const quizWith = (patch: object) => ({
    title: 'Гра',
    description: '',
    settings: DEFAULT_SETTINGS,
    rounds: [round('r1', [single])],
    ...patch,
  });

  it('is refused in nicknames, answers and quiz texts', () => {
    for (const bad of [NUL, LONE_SURROGATE]) {
      expect(valid(joinSchema, { nickname: bad })).toBe(false);
      expect(valid(answerSchema, { type: 'text', value: bad })).toBe(false);
      expect(valid(answerSchema, { type: 'single', optionId: bad })).toBe(false);
      expect(valid(answerSchema, { type: 'multi', optionIds: ['a', bad] })).toBe(false);
      expect(valid(answerSchema, { type: 'order', itemIds: [bad] })).toBe(false);
      expect(valid(questionSchema, { ...single, text: bad })).toBe(false);
      expect(valid(questionSchema, { ...single, options: [{ id: 'a', text: bad }, { id: 'b', text: 'Київ' }] })).toBe(false);
      expect(valid(quizSchema, quizWith({ title: bad }))).toBe(false);
      expect(valid(quizSchema, quizWith({ description: bad }))).toBe(false);
    }
  });

  it('still accepts emoji and letters outside the basic plane', () => {
    expect(valid(joinSchema, { nickname: 'Оля 🙂' })).toBe(true);
    expect(valid(answerSchema, { type: 'text', value: 'Київ 🏙️ 𝔘' })).toBe(true);
    expect(valid(quizSchema, quizWith({ title: 'Гра 🎉' }))).toBe(true);
  });
});

describe('question image address', () => {
  const withImage = (imageUrl: unknown) => questionSchema.safeParse({ ...single, imageUrl }).success;

  it('accepts an address of an uploaded image', () => {
    expect(withImage('/uploads/0123456789abcdef0123456789abcdef.jpg')).toBe(true);
    expect(withImage('/uploads/0123456789abcdef.webp')).toBe(true);
    expect(withImage(null)).toBe(true);
  });

  it('rejects addresses outside the uploads of this site', () => {
    for (const address of [
      'https://example.com/a.png',
      '//example.com/uploads/0123456789abcdef.png',
      'javascript:alert(1)',
      '/uploads/../../etc/passwd',
      '/uploads/0123456789abcdef.svg',
      '/uploads/0123456789ABCDEF.png',
      '/uploads/short.png',
      '',
    ]) {
      expect(withImage(address), address).toBe(false);
    }
  });

  it('publishes the limits for uploads', () => {
    expect(IMAGE_LIMITS.maxBytes).toBe(2 * 1024 * 1024);
    expect(IMAGE_LIMITS.types).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  });
});

describe('question video', () => {
  const cat = (id: string) => ({
    id,
    title: `Категорія ${id}`,
    cells: Array.from({ length: 3 }, (_, i) => ({ mark: 'none', question: { ...single, id: `q-${id}-${i}` } })),
  });

  it('an old question without a video reads as video null', () => {
    const quiz = quizSchema.parse({ title: 'Т', description: '', settings: DEFAULT_SETTINGS, rounds: [round('r1', [single])] });
    expect(questionsOf(quiz)[0]!.video).toBeNull();
    const board = roundSchema.parse({
      id: 'b1',
      type: 'board',
      title: '',
      shuffleOptions: false,
      categories: [cat('c1'), cat('c2'), cat('c3')],
      answerMode: 'phone',
      check: 'auto',
      rules: DEFAULT_RULES,
    }) as BoardRound;
    expect(board.categories[0]!.cells[0]!.question.video).toBeNull();
  });

  it('a question may have both an image and a video', () => {
    const result = questionSchema.parse({
      ...single,
      imageUrl: '/uploads/abcdef0123456789.png',
      video: { id: 'dQw4w9WgXcQ', start: 30 },
    });
    expect(result.video).toEqual({ id: 'dQw4w9WgXcQ', start: 30 });
  });

  it('a video other than an id and a start is refused', () => {
    for (const video of [
      { id: 'bad', start: 0 },
      { id: 'dQw4w9WgXcQ', start: -1 },
      { id: 'dQw4w9WgXcQ', start: 1.5 },
      { id: 'dQw4w9WgXcQ', start: 43_201 },
      { url: 'https://evil.example' },
    ]) {
      expect(valid(questionSchema, { ...single, video })).toBe(false);
    }
  });
});

describe('board round', () => {
  /** Категорія з count запитань; points різні, щоб бачити порядок. */
  const category = (id: string, count: number, patch: object = {}) => ({
    id,
    title: `Категорія ${id}`,
    cells: Array.from({ length: count }, (_, i) => ({
      mark: 'none',
      question: { ...single, id: `q-${id}-${i}`, points: 100 * (i + 1) },
    })),
    ...patch,
  });
  const board = (categories: object[], patch: object = {}) => ({
    id: 'b1',
    type: 'board',
    title: '',
    shuffleOptions: false,
    categories,
    answerMode: 'phone',
    check: 'auto',
    rules: DEFAULT_RULES,
    ...patch,
  });
  const boardQuiz = (rounds: object[]) => ({ title: 'Поле', description: '', settings: DEFAULT_SETTINGS, rounds });
  const threeCategories = () => [category('c1', 3), category('c2', 4), category('c3', 10)];

  it('an old board cell reads as a normal cell with the round answer mode', () => {
    const round = roundSchema.parse(board(threeCategories(), { answerMode: 'voice' })) as BoardRound;
    const cell = round.categories[0]!.cells[0]!;
    expect(cell.kind).toBe('normal');
    expect(cell.penalty).toBe('none');
    expect(cell.answerMode).toBeUndefined();
    expect(cellAnswerMode(round, cell)).toBe('voice');
  });

  it('a cell may have its own kind, answer mode and penalty', () => {
    const categories = threeCategories();
    Object.assign(categories[0]!.cells[0]!, { mark: 'x2', kind: 'blitz', answerMode: 'phone', penalty: 'all' });
    const round = roundSchema.parse(board(categories, { answerMode: 'voice' })) as BoardRound;
    const cell = round.categories[0]!.cells[0]!;
    expect(cell).toMatchObject({ kind: 'blitz', answerMode: 'phone', penalty: 'all' });
    expect(cellAnswerMode(round, cell)).toBe('phone');
  });

  it('an unknown cell kind, answer mode or penalty is refused', () => {
    for (const patch of [{ kind: 'mega' }, { answerMode: 'radio' }, { penalty: 'half' }]) {
      const categories = threeCategories();
      Object.assign(categories[0]!.cells[0]!, patch);
      expect(valid(roundSchema, board(categories))).toBe(false);
    }
  });

  it('a quiz with a board round passes the schema', () => {
    const categories = threeCategories();
    (categories[1].cells[2] as { mark: string }).mark = 'x2';
    expect(valid(quizSchema, boardQuiz([board(categories)]))).toBe(true);
  });

  it('board limits: 2 or 9 categories, 2 or 11 questions in a category are refused', () => {
    const quizOf = (categories: object[]) => valid(quizSchema, boardQuiz([board(categories)]));
    expect(quizOf([category('c1', 3), category('c2', 3)])).toBe(false);
    expect(quizOf(Array.from({ length: 8 }, (_, i) => category(`c${i}`, 3)))).toBe(true);
    expect(quizOf(Array.from({ length: 9 }, (_, i) => category(`c${i}`, 3)))).toBe(false);
    expect(quizOf([category('c1', 2), category('c2', 3), category('c3', 3)])).toBe(false);
    expect(quizOf([category('c1', 11), category('c2', 3), category('c3', 3)])).toBe(false);
  });

  it('an empty category title is refused', () => {
    const categories = [category('c1', 3, { title: '  ' }), category('c2', 3), category('c3', 3)];
    expect(valid(quizSchema, boardQuiz([board(categories)]))).toBe(false);
  });

  it('question ids must be unique across board cells', () => {
    const categories = threeCategories();
    categories[1].cells[0].question.id = categories[0].cells[0].question.id;
    const result = quizSchema.safeParse(boardQuiz([board(categories)]));
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain('duplicate_question_ids');
  });

  it('category ids must be unique within a round', () => {
    const categories = [category('c1', 3), category('c1', 3), category('c3', 3)];
    categories[1].cells.forEach((cell, i) => (cell.question.id = `other-${i}`));
    const result = quizSchema.safeParse(boardQuiz([board(categories)]));
    expect(result.error?.issues.map((issue) => issue.message)).toContain('duplicate_ids');
  });

  it('a bet mark is not a cell mark', () => {
    const categories = threeCategories();
    (categories[0].cells[0] as { mark: string }).mark = 'bet';
    expect(valid(roundSchema, board(categories))).toBe(false);
  });

  it('roundQuestions lists board questions by category in cell order', () => {
    const parsed = roundSchema.parse(board([category('c1', 3), category('c2', 3), category('c3', 3)]));
    expect(roundQuestions(parsed).map((q) => q.id)).toEqual([
      'q-c1-0', 'q-c1-1', 'q-c1-2', 'q-c2-0', 'q-c2-1', 'q-c2-2', 'q-c3-0', 'q-c3-1', 'q-c3-2',
    ]);
    const classic = roundSchema.parse(round('r1', many('a', 2)));
    expect(roundQuestions(classic).map((q) => q.id)).toEqual(['q-a-0', 'q-a-1']);
  });

  it('questionsOf counts board questions towards the 200 limit', () => {
    // 8 категорій по 10 = 80 запитань у полі + 100 + 21 класичних = 201.
    const categories = Array.from({ length: 8 }, (_, i) => category(`c${i}`, 10));
    const rounds = [board(categories), round('r1', many('a', 100)), round('r2', many('b', 21))];
    const result = quizSchema.safeParse(boardQuiz(rounds));
    expect(result.error?.issues.map((issue) => issue.message)).toContain('too_many_questions');
    const ok = boardQuiz(rounds.slice(0, 2)) as unknown as Quiz;
    expect(questionsOf(quizSchema.parse(ok))).toHaveLength(180);
  });

  it('a board round may not hold more than 100 questions', () => {
    // 8×10 = 80 допустимо за формою, тому перевіряємо через boardRoundIssues напряму.
    const parsed = roundSchema.parse(board(Array.from({ length: 8 }, (_, i) => category(`c${i}`, 10))));
    if (parsed.type !== 'board') throw new Error('expected a board round');
    expect(boardRoundIssues(parsed)).toEqual([]);
    const big = { ...parsed, categories: [...parsed.categories, ...parsed.categories.map((c, i) => ({ ...c, id: `d${i}` }))] };
    expect(boardRoundIssues(big)).toContain('too_many_questions');
  });
  describe('category spares (9d)', () => {
    const spare = (id: string, patch: object = {}) => ({ ...spareSingle, id, ...patch });
    const withSpares = (spares: object[] | undefined) =>
      boardQuiz([board([category('c1', 3, spares === undefined ? {} : { spares }), category('c2', 3), category('c3', 3)])]) as object & { settings: object };
    const swapOn = (quiz: object & { settings: object }) => ({ ...quiz, settings: { ...quiz.settings, buffs: ['swap'] } });
    const issues = (value: unknown) => {
      const result = quizSchema.safeParse(value);
      return result.success ? [] : result.error.issues.map((i) => i.message);
    };

    it('an old category has no spares; a category may hold 1…5 simple spares', () => {
      const old = quizSchema.parse(withSpares(undefined));
      expect(old.rounds[0].type === 'board' && old.rounds[0].categories[0].spares).toBeUndefined();
      expect(valid(quizSchema, withSpares([spare('cs1')]))).toBe(true);
      expect(valid(quizSchema, withSpares(Array.from({ length: LIMITS.maxCategorySpares }, (_, i) => spare(`cs${i}`))))).toBe(true);
      expect(valid(quizSchema, withSpares(Array.from({ length: LIMITS.maxCategorySpares + 1 }, (_, i) => spare(`cs${i}`))))).toBe(false);
      expect(valid(quizSchema, withSpares([]))).toBe(false);
    });

    it('category spares follow the pool rules: simple types, no video, unique ids everywhere', () => {
      expect(issues(withSpares([{ ...orderSpare, id: 'cs1' }]))).toContain('spare_type');
      expect(issues(withSpares([spare('cs1', { video: { id: 'dQw4w9WgXcQ', start: 0 } })]))).toContain('spare_video');
      expect(issues(withSpares([spare('cs1'), spare('cs1')]))).toContain('duplicate_spare_ids');
      expect(issues(withSpares([spare('q-c2-0')]))).toContain('duplicate_spare_ids');
      expect(issues({ ...withSpares([spare('cs1')]), spares: [spare('cs1')] })).toContain('duplicate_spare_ids');
    });

    it('swap is valid with spares only in categories; spares_empty only when there are none at all', () => {
      expect(issues(swapOn(withSpares(undefined)))).toContain('spares_empty');
      expect(valid(quizSchema, swapOn(withSpares([spare('cs1')])))).toBe(true);
      expect(valid(quizSchema, { ...swapOn(withSpares(undefined)), spares: [spare('s1')] })).toBe(true);
    });

    it('category spares are not questions of the quiz', () => {
      const parsed = quizSchema.parse(withSpares([spare('cs1')]));
      expect(questionsOf(parsed).map((q) => q.id)).not.toContain('cs1');
      expect(questionsOf(parsed)).toHaveLength(9);
    });

    it('allSpares, categorySparesOf and boardSpareSource', () => {
      const legacy = quizSchema.parse({ ...withSpares(undefined), spares: [spare('s1')] });
      expect(boardSpareSource(legacy)).toBe('quiz');
      expect(categorySparesOf(legacy)).toEqual([]);
      expect(allSpares(legacy).map((q) => q.id)).toEqual(['s1']);
      const mixed = quizSchema.parse({ ...withSpares([spare('cs1'), spare('cs2')]), spares: [spare('s1')] });
      expect(boardSpareSource(mixed)).toBe('category');
      expect(categorySparesOf(mixed).map((q) => q.id)).toEqual(['cs1', 'cs2']);
      expect(allSpares(mixed).map((q) => q.id)).toEqual(['s1', 'cs1', 'cs2']);
    });
  });
});

describe('match question', () => {
  const pair = (l: string, r: string, i: number) => ({ left: { id: `a${i}`, text: l }, right: { id: `z${i}`, text: r } });
  const matchQ = (n: number) => ({
    id: 'm',
    type: 'match',
    text: 'З’єднайте',
    imageUrl: null,
    timeLimit: 30,
    points: 1000,
    pairs: Array.from({ length: n }, (_, i) => pair(`Л${i}`, `П${i}`, i)),
  });
  const withRight = (i: number, text: string) => {
    const q = matchQ(3);
    q.pairs[i] = { ...q.pairs[i], right: { ...q.pairs[i].right, text } };
    return q;
  };

  it('accepts a match question with 3 to 6 pairs', () => {
    expect(valid(questionSchema, matchQ(3))).toBe(true);
    expect(valid(questionSchema, matchQ(6))).toBe(true);
    expect(valid(questionSchema, matchQ(2))).toBe(false);
    expect(valid(questionSchema, matchQ(7))).toBe(false);
  });

  it('refuses a match pair text longer than 120 characters or empty', () => {
    expect(valid(questionSchema, withRight(0, 'x'.repeat(121)))).toBe(false);
    expect(valid(questionSchema, withRight(0, 'x'.repeat(120)))).toBe(true);
    expect(valid(questionSchema, withRight(0, '  '))).toBe(false);
  });

  it('refuses a match question whose ids repeat across both columns', () => {
    const q = matchQ(3);
    q.pairs[1] = { ...q.pairs[1], right: { ...q.pairs[1].right, id: q.pairs[0].left.id } };
    const result = questionSchema.safeParse(q);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('duplicate_ids');
  });

  it('answerSchema accepts match links and refuses more than six', () => {
    const link = (i: number) => ({ left: `a${i}`, right: `z${i}` });
    expect(valid(answerSchema, { type: 'match', links: [link(0)] })).toBe(true);
    expect(valid(answerSchema, { type: 'match', links: Array.from({ length: 6 }, (_, i) => link(i)) })).toBe(true);
    expect(valid(answerSchema, { type: 'match', links: Array.from({ length: 7 }, (_, i) => link(i)) })).toBe(false);
    expect(valid(answerSchema, { type: 'match', links: [{ left: '', right: 'z0' }] })).toBe(false);
    expect(valid(answerSchema, { type: 'match', links: [{ left: 'a0', right: 'z\u0000' }] })).toBe(false);
  });
});

describe('final round', () => {
  const finalR = (id: string, questions: object[], patch: object = {}) => ({
    id,
    type: 'final',
    title: '',
    shuffleOptions: false,
    check: 'auto',
    questions,
    ...patch,
  });
  const quizOf = (rounds: object[]) => ({ title: 'T', description: '', settings: DEFAULT_SETTINGS, rounds });

  it('a quiz with a final round passes the schema', () => {
    const quiz = quizOf([round('r', [single]), finalR('f', [{ ...single, id: 'f1' }])]);
    expect(valid(quizSchema, quiz)).toBe(true);
  });

  it('a final round has exactly one valid question', () => {
    expect(valid(roundSchema, finalR('f', []))).toBe(false);
    expect(valid(roundSchema, finalR('f', [single, { ...single, id: 'q2' }]))).toBe(false);
    expect(valid(roundSchema, finalR('f', [{ ...single, text: '' }]))).toBe(false);
    expect(valid(roundSchema, finalR('f', [single]))).toBe(true);
  });

  it('a final round has no rules and rulesOf gives the defaults', () => {
    const f = roundSchema.parse(finalR('f', [single]));
    expect(rulesOf(f)).toEqual(DEFAULT_RULES);
    const c = roundSchema.parse(round('r', [single], { rules: { ...DEFAULT_RULES, multiplier: 2 } }));
    expect(rulesOf(c).multiplier).toBe(2);
  });

  it('question ids stay unique across a final and other rounds', () => {
    const quiz = quizOf([round('r', [single]), finalR('f', [single])]);
    const result = quizSchema.safeParse(quiz);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('duplicate_question_ids');
  });

  it('a stored final without a wager mode is classic', () => {
    expect(finalRoundSchema.parse(finalR('f', [single])).wagerMode).toBe('classic');
    expect(finalRoundSchema.parse(finalR('f', [single], { wagerMode: 'bank' })).wagerMode).toBe('bank');
    expect(valid(finalRoundSchema, finalR('f', [single], { wagerMode: 'pot' }))).toBe(false);
  });

  it('roundQuestions of a final round is its one question', () => {
    const f = roundSchema.parse(finalR('f', [single]));
    expect(roundQuestions(f).map((q) => q.id)).toEqual(['q1']);
  });
});

describe('chain question', () => {
  const chainQ = (words: string[], patch: object = {}) => ({ id: 'c', type: 'chain', text: 'Ланцюжок', imageUrl: null, video: null,
    timeLimit: 60, points: 1000, words, hintSeconds: 5, ...patch });
  const W3 = ['Форель', 'Риба', 'Океан'];
  const quizOf = (rounds: object[]) => ({ title: 'T', description: '', settings: DEFAULT_SETTINGS, rounds });
  const issues = (value: unknown) => {
    const parsed = questionSchema.safeParse(value);
    return parsed.success ? [] : parsed.error.issues.map((i) => i.message);
  };

  it('accepts a chain of 3 to 10 words', () => {
    expect(valid(questionSchema, chainQ(W3))).toBe(true);
    expect(valid(questionSchema, chainQ(Array.from({ length: 10 }, () => 'Слово')))).toBe(true);
    expect(valid(questionSchema, chainQ(['Форель', 'Риба']))).toBe(false);
    expect(valid(questionSchema, chainQ(Array.from({ length: 11 }, () => 'Слово')))).toBe(false);
  });

  it('chain words are letters with single spaces, hyphens or apostrophes between them', () => {
    for (const word of ['Нью-Йорк', "м'ята", 'М’ята', 'Біла Церква', 'Ох']) expect(valid(questionSchema, chainQ(['Форель', word, 'Океан']))).toBe(true);
    for (const word of ['Р', 'R2D2', '-Риба', 'Риба-', 'Біла  Церква', 'а'.repeat(31), '']) expect(valid(questionSchema, chainQ(['Форель', word, 'Океан']))).toBe(false);
    expect((questionSchema.parse(chainQ(['  Форель ', 'Риба', 'Океан'])) as { words: string[] }).words[0]).toBe('Форель');
  });

  it('a chain word typed in decomposed form (и + combining breve) is stored composed', () => {
    const nfd = 'Гай'.normalize('NFD');
    expect(nfd).not.toBe('Гай');
    expect((questionSchema.parse(chainQ(['Форель', nfd, 'Океан'])) as { words: string[] }).words[1]).toBe('Гай');
  });

  it('a hint adds 1 to 30 seconds', () => {
    expect(valid(questionSchema, chainQ(W3, { hintSeconds: 1 }))).toBe(true);
    expect(valid(questionSchema, chainQ(W3, { hintSeconds: 30 }))).toBe(true);
    expect(valid(questionSchema, chainQ(W3, { hintSeconds: 0 }))).toBe(false);
    expect(valid(questionSchema, chainQ(W3, { hintSeconds: 31 }))).toBe(false);
  });

  it('a chain cannot have a video', () => {
    expect(issues(chainQ(W3, { video: { id: 'dQw4w9WgXcQ', start: 0 } }))).toContain('chain_video');
  });

  it('a chain plays only in classic and final rounds', () => {
    const cat = (id: string) => ({ id, title: id, cells: [1, 2, 3].map((n) => ({ mark: 'none', question: { ...chainQ(W3), id: `${id}${n}` } })) });
    const board = { id: 'b', type: 'board', title: '', shuffleOptions: false, categories: [cat('a'), cat('b'), cat('c')], answerMode: 'phone', check: 'auto', rules: DEFAULT_RULES };
    const blitz = { id: 'bl', type: 'blitz', title: '', shuffleOptions: false, answerWindow: 15, attempts: 1, check: 'auto',
      rules: { ...DEFAULT_RULES, partial: null }, questions: [chainQ(W3, { id: 'cb' })] };
    const final = { id: 'f', type: 'final', title: '', shuffleOptions: false, check: 'auto', questions: [chainQ(W3, { id: 'cf' })] };
    expect(valid(quizSchema, quizOf([round('r', [chainQ(W3, { id: 'cc' })])]))).toBe(true);
    expect(valid(quizSchema, quizOf([round('r', [single]), final]))).toBe(true);
    for (const bad of [blitz, board]) {
      const parsed = quizSchema.safeParse(quizOf([round('r', [single]), bad]));
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues.map((i) => i.message)).toContain('chain_round');
    }
  });

  it('answerSchema never accepts a chain summary and guessSchema limits the word', () => {
    expect(valid(answerSchema, { type: 'chain', solved: 6, hints: 0, timeMs: 1 })).toBe(false);
    expect(valid(guessSchema, { word: 'Риба' })).toBe(true);
    expect(valid(guessSchema, { word: 'а'.repeat(31) })).toBe(false);
    expect(valid(guessSchema, { word: 5 })).toBe(false);
  });
});

describe('word ladder question (26c)', () => {
  const OWNER = ['ПОЛЕ', 'ПОЛА', 'ПОРА', 'ПАРА', 'ТАРА'];
  const ladderQ = (path: string[], patch: object = {}) => ({ id: 'l', type: 'wordladder', text: 'Від ПОЛЕ до ТАРА', imageUrl: null, video: null,
    timeLimit: 90, points: 1000, path, maxSteps: 8, ...patch });
  const quizOf = (rounds: object[]) => ({ title: 'T', description: '', settings: DEFAULT_SETTINGS, rounds });
  const issues = (schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: { message: string }[] } } }, value: unknown) => {
    const parsed = schema.safeParse(value);
    return parsed.success ? [] : (parsed.error?.issues.map((i) => i.message) ?? []);
  };

  it('accepts a word ladder with a valid host path', () => {
    expect(QUESTION_TYPES.indexOf('wordladder')).toBe(QUESTION_TYPES.indexOf('chain') + 1);
    expect(issues(questionSchema, ladderQ(OWNER))).toEqual([]);
    expect((questionSchema.parse(ladderQ([' ПОЛЕ ', 'ПОЛА'])) as { path: string[] }).path).toEqual(['ПОЛЕ', 'ПОЛА']);
    expect(valid(questionSchema, ladderQ(['ПОЛЕ']))).toBe(false);
    expect(valid(questionSchema, ladderQ(OWNER, { maxSteps: 0 }))).toBe(false);
    expect(valid(questionSchema, ladderQ(OWNER, { maxSteps: LIMITS.maxWordLadderSteps + 1 }))).toBe(false);
  });

  it('refuses a broken path, too many steps and a video', () => {
    expect(issues(questionSchema, ladderQ(['ПОЛЕ', 'ПИЛА']))).toContain('wordladder_step');
    expect(issues(questionSchema, ladderQ(OWNER, { maxSteps: 3 }))).toContain('wordladder_steps');
    expect(issues(questionSchema, ladderQ(OWNER, { video: { id: 'dQw4w9WgXcQ', start: 0 } }))).toContain('wordladder_video');
    expect(issues(questionSchema, ladderQ(['ПО', 'ПА']))).toContain('wordladder_word');
    expect(issues(questionSchema, ladderQ(['ПОЛЕ', 'ПОЛЕМ']))).toContain('wordladder_length');
  });

  it('a word ladder plays only in classic and final rounds', () => {
    const q = (id: string) => ladderQ(OWNER, { id });
    const cat = (id: string) => ({ id, title: id, cells: [1, 2, 3].map((n) => ({ mark: 'none', question: n === 1 ? q(`${id}${n}`) : { ...single, id: `${id}${n}` } })) });
    const board = { id: 'b', type: 'board', title: '', shuffleOptions: false, categories: [cat('a'), cat('b'), cat('c')], answerMode: 'phone', check: 'auto', rules: DEFAULT_RULES };
    const blitzRound = { id: 'bl', type: 'blitz', title: '', shuffleOptions: false, answerWindow: 15, attempts: 1, check: 'auto',
      rules: { ...DEFAULT_RULES, partial: null }, questions: [q('lb')] };
    const wipeoutRound = { id: 'rw', type: 'wipeout', title: '', shuffleOptions: false,
      questions: [q('lw'), ...[1, 2, 3, 4].map((n) => ({ ...single, id: `w${n}` }))] };
    const final = { id: 'f', type: 'final', title: '', shuffleOptions: false, check: 'auto', questions: [q('lf')] };
    expect(issues(quizSchema, quizOf([round('r', [q('lc')])]))).toEqual([]);
    expect(issues(quizSchema, quizOf([round('r', [single]), final]))).toEqual([]);
    for (const bad of [blitzRound, wipeoutRound, board]) {
      expect(issues(quizSchema, quizOf([round('r', [single]), bad]))).toContain('wordladder_place');
    }
  });

  it('old quizzes still parse', () => {
    const old = quizOf([round('r', [single, orderSpare])]);
    const parsed = quizSchema.safeParse(old);
    expect(parsed.success).toBe(true);
    expect(JSON.stringify(parsed.data)).not.toContain('wordladder');
  });

  it('answerSchema never accepts a ladder summary; the word event is limited', () => {
    expect(valid(answerSchema, { type: 'wordladder', words: ['пола'], steps: 1, finished: false })).toBe(false);
    expect(valid(wordLadderWordSchema, { word: 'пола' })).toBe(true);
    expect(valid(wordLadderWordSchema, { word: 'а'.repeat(31) })).toBe(false);
    expect(valid(wordLadderWordSchema, { word: 5 })).toBe(false);
    expect(valid(wordLadderCheckSchema, { words: OWNER })).toBe(true);
    expect(valid(wordLadderCheckSchema, { words: [] })).toBe(false);
    expect(valid(wordLadderCheckSchema, { words: Array.from({ length: 22 }, () => 'поле') })).toBe(false);
  });
});

describe('sort question', () => {
  const sortQ = (patch: object = {}) => ({ id: 's', type: 'sort', text: 'Розсортуйте', imageUrl: null, video: null, timeLimit: 60, points: 100,
    categories: [{ id: 'c1', text: 'Овочі' }, { id: 'c2', text: 'Фрукти' }],
    words: [{ id: 'w1', text: 'Морква', categoryId: 'c1' }, { id: 'w2', text: 'Яблуко', categoryId: 'c2' },
            { id: 'w3', text: 'Буряк', categoryId: 'c1' }, { id: 'w4', text: 'Груша', categoryId: 'c2' }],
    lockSeconds: 3, ...patch });
  const quizOf = (rounds: object[]) => ({ title: 'T', description: '', settings: DEFAULT_SETTINGS, rounds });
  const issues = (schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: { message: string }[] } } }, value: unknown) => {
    const parsed = schema.safeParse(value);
    return parsed.success ? [] : (parsed.error?.issues.map((i) => i.message) ?? []);
  };
  const cats = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, text: `Категорія ${i + 1}` }));
  const wordsIn = (n: number, categories: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `w${i + 1}`, text: `Слово ${i + 1}`, categoryId: `c${(i % categories) + 1}` }));

  it('accepts a sort of 2 to 4 categories and 4 to 20 words', () => {
    expect(valid(questionSchema, sortQ())).toBe(true);
    expect(valid(questionSchema, sortQ({ categories: cats(4), words: wordsIn(4, 4) }))).toBe(true);
    expect(valid(questionSchema, sortQ({ categories: cats(1), words: wordsIn(4, 1) }))).toBe(false);
    expect(valid(questionSchema, sortQ({ categories: cats(5), words: wordsIn(5, 5) }))).toBe(false);
    expect(valid(questionSchema, sortQ({ words: wordsIn(3, 2) }))).toBe(false);
    expect(valid(questionSchema, sortQ({ words: wordsIn(21, 2) }))).toBe(false);
    expect(valid(questionSchema, sortQ({ words: wordsIn(20, 2), points: 100 }))).toBe(true);
  });

  it('a sort word belongs to a known category and every category has a word', () => {
    const words = wordsIn(4, 2);
    expect(issues(questionSchema, sortQ({ words: [...words.slice(0, 3), { ...words[3]!, categoryId: 'c9' }] }))).toContain('unknown_category');
    expect(issues(questionSchema, sortQ({ words: wordsIn(4, 1) }))).toContain('sort_empty_category');
  });

  it('sort words and ids do not repeat', () => {
    const words = wordsIn(4, 2);
    expect(issues(questionSchema, sortQ({ words: [{ ...words[0]!, text: 'Морква' }, { ...words[1]!, text: ' морква ' }, words[2], words[3]] }))).toContain('sort_duplicate_words');
    expect(issues(questionSchema, sortQ({ words: [{ ...words[0]!, id: 'c1' }, words[1], words[2], words[3]] }))).toContain('duplicate_ids');
  });

  it('words × points per word stay within 2000 and the lock is 1 to 10 s', () => {
    expect(valid(questionSchema, sortQ({ points: 500 }))).toBe(true);
    expect(issues(questionSchema, sortQ({ points: 501 }))).toContain('sort_points');
    expect(valid(questionSchema, sortQ({ lockSeconds: 1 }))).toBe(true);
    expect(valid(questionSchema, sortQ({ lockSeconds: 10 }))).toBe(true);
    expect(valid(questionSchema, sortQ({ lockSeconds: 0 }))).toBe(false);
    expect(valid(questionSchema, sortQ({ lockSeconds: 11 }))).toBe(false);
    expect(valid(questionSchema, sortQ({ categories: [{ id: 'c1', text: 'а'.repeat(30) }, { id: 'c2', text: 'Фрукти' }] }))).toBe(true);
    expect(valid(questionSchema, sortQ({ categories: [{ id: 'c1', text: 'а'.repeat(31) }, { id: 'c2', text: 'Фрукти' }] }))).toBe(false);
    const words = wordsIn(4, 2);
    expect(valid(questionSchema, sortQ({ words: [{ ...words[0]!, text: 'а'.repeat(40) }, words[1], words[2], words[3]] }))).toBe(true);
    expect(valid(questionSchema, sortQ({ words: [{ ...words[0]!, text: 'а'.repeat(41) }, words[1], words[2], words[3]] }))).toBe(false);
  });

  it('a sort cannot have a video', () => {
    expect(issues(questionSchema, sortQ({ video: { id: 'dQw4w9WgXcQ', start: 0 } }))).toContain('sort_video');
  });

  it('a sort plays in every round type, but on a board only in a normal phone cell', () => {
    const blitz = { id: 'bl', type: 'blitz', title: '', shuffleOptions: false, answerWindow: 15, attempts: 1, check: 'auto',
      rules: { ...DEFAULT_RULES, partial: null }, questions: [sortQ({ id: 'sb' })] };
    const final = { id: 'f', type: 'final', title: '', shuffleOptions: false, check: 'auto', questions: [sortQ({ id: 'sf' })] };
    const board = (cell: object, patch: object = {}) => {
      const cat = (id: string, first?: object) => ({ id, title: id, cells: [1, 2, 3].map((n) =>
        n === 1 && first !== undefined ? { mark: 'none', ...first, question: sortQ({ id: `${id}${n}` }) } : { mark: 'none', question: { ...single, id: `${id}${n}` } }) });
      return { id: 'b', type: 'board', title: '', shuffleOptions: false, categories: [cat('a', cell), cat('b'), cat('c')], answerMode: 'phone', check: 'auto', rules: DEFAULT_RULES, ...patch };
    };
    expect(valid(quizSchema, quizOf([round('r', [sortQ({ id: 'sc' })])]))).toBe(true);
    expect(valid(quizSchema, quizOf([round('r', [single]), blitz]))).toBe(true);
    expect(valid(quizSchema, quizOf([round('r', [single]), final]))).toBe(true);
    expect(valid(quizSchema, quizOf([board({ kind: 'normal', answerMode: 'phone' })]))).toBe(true);
    expect(valid(quizSchema, quizOf([board({})]))).toBe(true);
    expect(issues(quizSchema, quizOf([board({ kind: 'blitz', answerMode: 'phone' })]))).toContain('sort_cell');
    expect(issues(quizSchema, quizOf([board({ kind: 'normal', answerMode: 'voice' })]))).toContain('sort_cell');
    expect(issues(quizSchema, quizOf([board({ kind: 'normal' }, { answerMode: 'voice' })]))).toContain('sort_cell');
  });

  it('questionPrice is words × points for a sort and points otherwise', () => {
    expect(questionPrice(questionSchema.parse(sortQ()))).toBe(400);
    expect(questionPrice(questionSchema.parse(sortQ({ points: 50 })))).toBe(200);
    expect(questionPrice(questionSchema.parse({ ...single, points: 300 }))).toBe(300);
  });

  it('answerSchema never accepts a sort summary and sortSchema checks the move', () => {
    expect(valid(answerSchema, { type: 'sort', sorted: 4, total: 4, misses: 0, timeMs: 1 })).toBe(false);
    expect(valid(sortSchema, { wordId: 'w1', categoryId: 'c1' })).toBe(true);
    expect(valid(sortSchema, { wordId: 5, categoryId: 'c1' })).toBe(false);
    expect(valid(sortSchema, { wordId: 'w'.repeat(65), categoryId: 'c1' })).toBe(false);
  });
});

describe('duels', () => {
  const baseQuiz = { title: 'Т', description: '', settings: DEFAULT_SETTINGS, rounds: [round('r1', [single])] };
  const dq = (id: string, text: string, accepted: string[]) => ({ id, text, accepted });
  const capitals = { id: 'dc1', title: 'Столиці', questions: [dq('d1', 'Столиця Франції?', ['Париж']), dq('d2', 'Столиця Італії?', ['Рим'])] };
  const chemistry = {
    id: 'dc2',
    title: 'Хімія',
    questions: [dq('d3', 'Символ Fe — це…', ['Залізо', 'Ферум']), dq('d4', 'Символ Au — це…', ['Золото', 'Аурум'])],
  };
  const duelsOf = (patch: object = {}) => ({ categories: [capitals, chemistry], questionsPerDuel: 2, timeLimit: 30, stake: 300, ...patch });
  const withDuels = (patch: object = {}) => ({ ...baseQuiz, duels: duelsOf(patch) });
  const issues = (value: unknown) => {
    const result = quizSchema.safeParse(value);
    return result.success ? [] : result.error.issues.map((i) => i.message);
  };
  /** Категорія з n запитаннями, id з префіксом. */
  const category = (id: string, n: number, patch: object = {}) => ({
    id,
    title: 'Категорія',
    questions: Array.from({ length: n }, (_, i) => dq(`${id}-q${i}`, `Запитання ${i}?`, ['Так'])),
    ...patch,
  });

  it('a quiz without duels stays valid and has none', () => {
    const parsed = quizSchema.parse(baseQuiz);
    expect(parsed.duels).toBeUndefined();
  });

  it('accepts a duel pool by categories with text answers', () => {
    expect(valid(quizSchema, withDuels())).toBe(true);
    expect(quizSchema.parse(withDuels()).duels?.categories[1].questions[0].accepted).toEqual(['Залізо', 'Ферум']);
    expect(valid(duelsSchema, duelsOf())).toBe(true);
  });

  it('duel limits', () => {
    expect(valid(quizSchema, withDuels({ questionsPerDuel: 0 }))).toBe(false);
    expect(valid(quizSchema, withDuels({ questionsPerDuel: 8 }))).toBe(false);
    expect(valid(quizSchema, withDuels({ timeLimit: 4 }))).toBe(false);
    expect(valid(quizSchema, withDuels({ timeLimit: 121 }))).toBe(false);
    expect(valid(quizSchema, withDuels({ stake: -1 }))).toBe(false);
    expect(valid(quizSchema, withDuels({ stake: 5001 }))).toBe(false);
    expect(valid(quizSchema, withDuels({ stake: 1.5 }))).toBe(false);
    expect(valid(quizSchema, withDuels({ stake: 0 }))).toBe(true);
    expect(valid(quizSchema, withDuels({ stake: 5000 }))).toBe(true);
    const cats = (categories: object[]) => withDuels({ categories, questionsPerDuel: 1 });
    expect(valid(quizSchema, cats([]))).toBe(false);
    expect(valid(quizSchema, cats(Array.from({ length: 8 }, (_, i) => category(`c${i}`, 1))))).toBe(true);
    expect(valid(quizSchema, cats(Array.from({ length: 9 }, (_, i) => category(`c${i}`, 1))))).toBe(false);
    expect(valid(quizSchema, cats([category('c', 0)]))).toBe(false);
    expect(valid(quizSchema, cats([category('c', 20)]))).toBe(true);
    expect(valid(quizSchema, cats([category('c', 21)]))).toBe(false);
    expect(valid(quizSchema, cats([category('c', 1, { title: 'а'.repeat(40) })]))).toBe(true);
    expect(valid(quizSchema, cats([category('c', 1, { title: 'а'.repeat(41) })]))).toBe(false);
    expect(valid(quizSchema, cats([category('c', 1, { title: '  ' })]))).toBe(false);
    const oneQ = (q: object) => cats([{ id: 'c', title: 'К', questions: [{ ...dq('q', 'Запитання?', ['Так']), ...q }] }]);
    expect(valid(quizSchema, oneQ({ accepted: [] }))).toBe(false);
    expect(valid(quizSchema, oneQ({ accepted: Array.from({ length: 10 }, (_, i) => `в${i}`) }))).toBe(true);
    expect(valid(quizSchema, oneQ({ accepted: Array.from({ length: 11 }, (_, i) => `в${i}`) }))).toBe(false);
    expect(valid(quizSchema, oneQ({ accepted: ['я'.repeat(200)] }))).toBe(true);
    expect(valid(quizSchema, oneQ({ accepted: ['я'.repeat(201)] }))).toBe(false);
    expect(valid(quizSchema, oneQ({ text: '' }))).toBe(false);
    expect(valid(quizSchema, oneQ({ text: 'я'.repeat(301) }))).toBe(false);
  });

  it("every duel category holds at least a duel's worth of questions", () => {
    expect(issues(withDuels({ questionsPerDuel: 3 }))).toContain('duel_category_short');
    expect(issues(withDuels({ questionsPerDuel: 2 }))).not.toContain('duel_category_short');
  });

  it('duel ids do not repeat', () => {
    const asCategoryId = { ...capitals, questions: [capitals.questions[0], { ...capitals.questions[1], id: 'dc1' }] };
    expect(issues(withDuels({ categories: [asCategoryId, chemistry] }))).toContain('duplicate_duel_ids');
    const sameQuestionId = { ...chemistry, questions: [{ ...chemistry.questions[0], id: 'd1' }, chemistry.questions[1]] };
    expect(issues(withDuels({ categories: [capitals, sameQuestionId] }))).toContain('duplicate_duel_ids');
    expect(issues(withDuels())).not.toContain('duplicate_duel_ids');
  });

  it('duel events check their payloads', () => {
    expect(valid(declareSchema, { opponentId: 'p2' })).toBe(true);
    expect(valid(declareSchema, { opponentId: 5 })).toBe(false);
    expect(valid(duelPickSchema, { categoryId: 'dc1' })).toBe(true);
    expect(valid(duelPickSchema, { categoryId: 'x'.repeat(65) })).toBe(false);
    expect(valid(duelAnswerSchema, { text: '  ' })).toBe(false);
    expect(valid(duelAnswerSchema, { text: 'я'.repeat(201) })).toBe(false);
    expect(valid(duelAnswerSchema, { text: ' Париж ' })).toBe(true);
  });

  it('duel limits are exported', () => {
    expect(LIMITS.maxDuelCategories).toBe(8);
    expect(LIMITS.maxDuelCategoryQuestions).toBe(20);
    expect(LIMITS.maxDuelQuestions).toBe(7);
    expect(LIMITS.defaultDuelQuestions).toBe(3);
    expect(LIMITS.defaultDuelTime).toBe(30);
    expect(LIMITS.maxDuelStake).toBe(5000);
    expect(LIMITS.defaultDuelStake).toBe(300);
    expect(LIMITS.maxDuelTries).toBe(30);
  });
});

describe('debuff prices', () => {
  const quiz = (extra?: object) => ({
    title: 'Т',
    description: '',
    settings: { leaderboard: 'each', ...extra },
    rounds: [round('r1', [single])],
  });

  it('an old quiz without prices charges the default 200 for every debuff', () => {
    const old = quizSchema.parse(quiz());
    for (const kind of DEBUFF_KINDS) expect(debuffPrice(old, kind)).toBe(200);
    expect(old.settings.debuffShop).toBeUndefined();
  });

  it('a price set by the host wins; the rest stay at the default', () => {
    const parsed = quizSchema.parse(quiz({ debuffPrices: { fog: 100, shake: 5000 } }));
    expect(debuffPrice(parsed, 'fog')).toBe(100);
    expect(debuffPrice(parsed, 'shake')).toBe(5000);
    expect(debuffPrice(parsed, 'mud')).toBe(200);
  });

  it('refuses prices out of 50…5000, fractions and unknown debuffs', () => {
    for (const prices of [{ fog: 0 }, { fog: 49 }, { fog: 5001 }, { fog: 100.5 }, { fog: -200 }, { magic: 100 }]) {
      expect(valid(quizSchema, quiz({ debuffPrices: prices })), JSON.stringify(prices)).toBe(false);
    }
  });

  it('the shop flag is a boolean and nothing else', () => {
    expect(valid(quizSchema, quiz({ debuffShop: false }))).toBe(true);
    expect(valid(quizSchema, quiz({ debuffShop: 'no' }))).toBe(false);
  });

  it('the away penalty flag is a boolean and nothing else', () => {
    expect(valid(quizSchema, quiz({ awayPenalty: true }))).toBe(true);
    expect(valid(quizSchema, quiz({}))).toBe(true);
    expect(valid(quizSchema, quiz({ awayPenalty: 'yes' }))).toBe(false);
  });

  it('the purchase event names the target and the kind', () => {
    expect(valid(buyDebuffSchema, { targetId: 'p1', kind: 'fog' })).toBe(true);
    expect(valid(buyDebuffSchema, { targetId: 'p1', kind: 'rain' })).toBe(false);
    expect(valid(buyDebuffSchema, { kind: 'fog' })).toBe(false);
  });
});

describe('buffs and debuffs in the settings', () => {
  const baseQuiz = { title: 'Т', description: '', settings: DEFAULT_SETTINGS, rounds: [round('r1', [single])] };
  const withPowers = (settings: object) => ({ ...baseQuiz, settings: { ...baseQuiz.settings, ...settings } });
  const issues = (value: unknown) => {
    const result = quizSchema.safeParse(value);
    return result.success ? [] : result.error.issues.map((i) => i.message);
  };

  it('a quiz without power settings allows the six legacy debuffs and no buff', () => {
    const parsed = quizSchema.parse(baseQuiz);
    expect(parsed.settings.debuffs).toBeUndefined();
    expect(parsed.settings.buffs).toBeUndefined();
    expect(allowedDebuffs(parsed)).toEqual([...LEGACY_DEBUFFS]);
    expect(allowedBuffs(parsed)).toEqual([]);
  });
  it('keeps chosen debuffs and buffs in the canonical order', () => {
    const parsed = quizSchema.parse(withPowers({ debuffs: ['mud', 'fog'], buffs: ['shield', 'fifty'] }));
    expect(allowedDebuffs(parsed)).toEqual(['fog', 'mud']);
    expect(allowedBuffs(parsed)).toEqual(['fifty', 'shield']);
    expect(allowedDebuffs(quizSchema.parse(withPowers({ debuffs: [] })))).toEqual([]);
  });
  it('refuses unknown kinds, repeats and buffs that are not ready yet', () => {
    expect(valid(quizSchema, withPowers({ debuffs: ['rain'] }))).toBe(false);
    expect(issues(withPowers({ buffs: ['double', 'double'] }))).toContain('duplicate_powers');
    expect(issues(withPowers({ debuffs: ['fog', 'fog'] }))).toContain('duplicate_powers');
    expect(issues(withPowers({ buffs: ['swap'] }))).toContain('spares_empty');
    expect(valid(quizSchema, withPowers({ buffs: ['audience', 'hint'] }))).toBe(true);
    expect(valid(quizSchema, { ...withPowers({ buffs: [...READY_BUFFS] }), spares: [spareSingle] })).toBe(true);
  });
  it('buff events check their payloads', () => {
    expect(valid(buffSchema, { kind: 'fifty' })).toBe(true);
    expect(valid(buffSchema, { kind: 'magic' })).toBe(false);
    expect(valid(retrySchema, { keep: true })).toBe(true);
    expect(valid(retrySchema, { keep: 'yes' })).toBe(false);
  });
  it('12h: new debuffs only by choice, their prices default, new buffs pass and peek carries a target', () => {
    expect(LEGACY_DEBUFFS).toEqual(['shake', 'fog', 'freeze', 'mirror', 'guests', 'mud']);
    expect(allowedDebuffs(quizSchema.parse(withPowers({ debuffs: ['bubbles', 'flip'] })))).toEqual(['flip', 'bubbles']);
    const priced = quizSchema.parse(withPowers({ debuffPrices: { torch: 300 } }));
    expect(debuffPrice(priced, 'torch')).toBe(300);
    expect(debuffPrice(priced, 'sticky')).toBe(LIMITS.defaultDebuffPrice);
    const powers = quizSchema.parse(withPowers({ buffs: ['peek', 'guard', 'scope', 'letter', 'risk'] }));
    expect(allowedBuffs(powers)).toEqual(['risk', 'letter', 'scope', 'guard', 'peek']);
    expect(valid(buffSchema, { kind: 'peek', targetId: 'p2' })).toBe(true);
    expect(valid(buffSchema, { kind: 'peek' })).toBe(true);
    expect(valid(buffSchema, { kind: 'spy' })).toBe(false);
  });
  it('all thirteen buff kinds are known and ready', () => {
    expect(BUFF_KINDS).toHaveLength(13);
    expect(READY_BUFFS).toEqual([...BUFF_KINDS]);
  });

  const PLAYER_UUID = 'p1';

  it('a question may carry a short hint; old questions have none', () => {
    const parsed = quizSchema.parse(baseQuiz);
    expect(questionsOf(parsed)[0].hint).toBeUndefined();
    const withHint = { ...baseQuiz, rounds: [{ ...baseQuiz.rounds[0], questions: [{ ...single, hint: '  Тече через Київ ' }] }] };
    expect(questionsOf(quizSchema.parse(withHint))[0].hint).toBe('Тече через Київ');
    const long = { ...baseQuiz, rounds: [{ ...baseQuiz.rounds[0], questions: [{ ...single, hint: 'я'.repeat(LIMITS.hintText + 1) }] }] };
    expect(valid(quizSchema, long)).toBe(false);
    const empty = { ...baseQuiz, rounds: [{ ...baseQuiz.rounds[0], questions: [{ ...single, hint: '   ' }] }] };
    expect(valid(quizSchema, empty)).toBe(false);
  });
  it('spare pool rules', () => {
    expect(valid(quizSchema, { ...baseQuiz, spares: [spareSingle] })).toBe(true);
    expect(valid(quizSchema, { ...baseQuiz, spares: [] })).toBe(false);
    expect(issues({ ...baseQuiz, spares: [orderSpare] })).toContain('spare_type');
    expect(issues({ ...baseQuiz, spares: [{ ...spareSingle, video: { id: 'dQw4w9WgXcQ', start: 0 } }] })).toContain('spare_video');
    expect(issues({ ...baseQuiz, spares: [spareSingle, spareSingle] })).toContain('duplicate_spare_ids');
    expect(issues({ ...baseQuiz, spares: [{ ...spareSingle, id: single.id }] })).toContain('duplicate_spare_ids');
    expect(valid(quizSchema, { ...baseQuiz, spares: Array.from({ length: LIMITS.maxSpares + 1 }, (_, i) => ({ ...spareSingle, id: `s${i}` })) })).toBe(false);
  });
  it('swap needs spares; a pool without swap is fine', () => {
    expect(issues(withPowers({ buffs: ['swap'] }))).toContain('spares_empty');
    expect(valid(quizSchema, { ...withPowers({ buffs: ['swap'] }), spares: [spareSingle] })).toBe(true);
    expect(valid(quizSchema, withPowers({ buffs: ['audience', 'hint'] }))).toBe(true);
    expect(valid(quizSchema, { ...baseQuiz, spares: [spareSingle] })).toBe(true);
  });
  it('vote and hint events check their payloads', () => {
    expect(valid(voteSchema, { askerId: PLAYER_UUID, answer: { type: 'single', optionId: 'a' } })).toBe(true);
    expect(valid(voteSchema, { askerId: PLAYER_UUID, answer: { type: 'magic' } })).toBe(false);
    expect(valid(hintSchema, { playerId: PLAYER_UUID, text: 'Тече через Київ' })).toBe(true);
    expect(valid(hintSchema, { playerId: PLAYER_UUID, text: null })).toBe(true);
    expect(valid(hintSchema, { playerId: PLAYER_UUID, text: '  ' })).toBe(false);
    expect(valid(hintSchema, { playerId: PLAYER_UUID, text: 'я'.repeat(LIMITS.hintText + 1) })).toBe(false);
  });
});

describe('slider (10b)', () => {
  const slider = { id: 's1', type: 'slider', text: 'Скільки?', imageUrl: null, video: null, timeLimit: 20, points: 1000,
    min: 0, max: 100, step: 1, correct: 50, tolerance: 2, zeroBeyond: 12, unit: '%' } as const;
  const issues = (value: unknown) => {
    const parsed = questionSchema.safeParse(value);
    return parsed.success ? [] : parsed.error.issues.map((i) => i.message);
  };
  const parsed = (value: unknown) => questionSchema.parse(value) as Extract<Question, { type: 'slider' }>;

  it('a slider is a question type and a simple type', () => {
    expect(QUESTION_TYPES).toContain('slider');
    expect(SIMPLE_TYPES).toContain('slider');
    expect(valid(questionSchema, slider)).toBe(true);
    expect(valid(questionSchema, { ...slider, zeroBeyond: undefined, unit: undefined })).toBe(true);
  });

  it('checks range, step, correct value and the zero distance', () => {
    expect(issues({ ...slider, min: 100 })).toContain('slider_range');
    expect(issues({ ...slider, step: 0.7 })).toContain('slider_range');
    expect(issues({ ...slider, max: 100_001 })).toContain('slider_range');
    expect(issues({ ...slider, correct: 101 })).toContain('slider_correct');
    expect(issues({ ...slider, zeroBeyond: 2 })).toContain('slider_zero');
    expect(valid(questionSchema, { ...slider, step: 0 })).toBe(false);
    expect(valid(questionSchema, { ...slider, unit: 'x'.repeat(LIMITS.sliderUnit + 1) })).toBe(false);
    expect(valid(questionSchema, { ...slider, min: 0, max: 1, step: 0.1, correct: 0.5 })).toBe(true);
  });

  it('sliderShare: full inside the tolerance, linear to zero, nothing outside the range', () => {
    const q = parsed(slider);
    expect(sliderShare(q, 52)).toBe(1);
    expect(sliderShare(q, 57)).toBeCloseTo(0.5);
    expect(sliderShare(q, 58)).toBeCloseTo(0.4);
    expect(sliderShare(q, 62)).toBe(0);
    expect(sliderShare(q, 101)).toBe(0);
    expect(sliderShare(q, Number.NaN)).toBe(0);
    const strict = parsed({ ...slider, zeroBeyond: undefined });
    expect(sliderShare(strict, 52)).toBe(1);
    expect(sliderShare(strict, 53)).toBe(0);
  });
});

describe('audio and revealing picture (10b)', () => {
  const file = { source: 'file', url: `/uploads/${'a'.repeat(32)}.mp3`, start: 5, duration: 30 } as const;
  const img = `/uploads/${'b'.repeat(32)}.png`;
  const multiQ = { ...single, id: 'qm', type: 'multi', correctIds: ['b'], correctId: undefined };
  const issues = (schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: { message: string }[] } } }, value: unknown) => {
    const result = schema.safeParse(value);
    return result.success ? [] : (result.error?.issues.map((i) => i.message) ?? []);
  };
  const quizOf = (rounds: object[], patch: object = {}) => ({ title: 'T', description: '', settings: DEFAULT_SETTINGS, rounds, ...patch });
  const revealing = (id: string) => ({ ...single, id, imageUrl: img, reveal: 'pixels' });

  it('audio is optional, from our storage or YouTube, never together with a video', () => {
    expect(valid(questionSchema, { ...single, audio: file })).toBe(true);
    expect(valid(questionSchema, { ...single, audio: { source: 'youtube', id: 'dQw4w9WgXcQ', start: 0, duration: 15 } })).toBe(true);
    expect(valid(questionSchema, { ...single, audio: { ...file, url: 'https://evil.example/a.mp3' } })).toBe(false);
    expect(valid(questionSchema, { ...single, audio: { ...file, duration: LIMITS.maxAudioSeconds + 1 } })).toBe(false);
    expect(issues(questionSchema, { ...single, audio: file, video: { id: 'dQw4w9WgXcQ', start: 0 } })).toContain('audio_video');
  });

  it('the audio lead and the answer window', () => {
    expect(audioLeadMs({ timeLimit: 20, audio: file })).toBe(30_000);
    expect(audioLeadMs({ timeLimit: 20, audio: { ...file, duration: 20 } })).toBe(0);
    expect(audioLeadMs({ timeLimit: 20 })).toBe(0);
    expect(answerWindowMs({ timeLimit: 20, audio: file })).toBe(50_000);
    expect(answerWindowMs({ timeLimit: 20 })).toBe(20_000);
  });

  it('revealing picture: needs a picture, no video, single/text/numeric only', () => {
    expect(valid(questionSchema, { ...single, imageUrl: img, reveal: 'pixels' })).toBe(true);
    expect(issues(questionSchema, { ...single, reveal: 'blur' })).toContain('reveal_image');
    expect(issues(questionSchema, { ...single, imageUrl: img, reveal: 'blur', video: { id: 'dQw4w9WgXcQ', start: 0 } })).toContain('reveal_video');
    expect(issues(questionSchema, { ...multiQ, imageUrl: img, reveal: 'blur' })).toContain('reveal_type');
  });

  it('revealShare: 100 % at once, 30 % at full reveal, linear between', () => {
    expect(revealShare(0, 20_000)).toBe(1);
    expect(revealShare(10_000, 20_000)).toBeCloseTo(0.65);
    expect(revealShare(20_000, 20_000)).toBeCloseTo(REVEAL_MIN_SHARE);
    expect(revealShare(30_000, 20_000)).toBeCloseTo(REVEAL_MIN_SHARE);
    expect(revealShare(5, 0)).toBe(REVEAL_MIN_SHARE);
  });

  it('reveal only in classic and on a normal phone cell', () => {
    const blitz = { id: 'bl', type: 'blitz', title: '', shuffleOptions: false, answerWindow: DEFAULT_ANSWER_WINDOW, attempts: 1,
      check: 'auto', rules: { ...DEFAULT_RULES, partial: null }, questions: [revealing('q1')] };
    const finalR = { id: 'f', type: 'final', title: '', shuffleOptions: false, check: 'auto', questions: [revealing('q1')] };
    const board = (patch: object = {}) => ({
      id: 'b', type: 'board', title: '', shuffleOptions: false, answerMode: 'phone', check: 'auto', rules: DEFAULT_RULES, ...patch,
      categories: [1, 2, 3].map((n) => ({ id: `c${n}`, title: `К${n}`, cells: [1, 2, 3].map((m) => ({ mark: 'none',
        question: n === 1 && m === 1 ? revealing('qr') : { ...single, id: `q${n}${m}` } })) })),
    });
    expect(issues(quizSchema, quizOf([round('r', [revealing('q1')])]))).toEqual([]);
    expect(issues(quizSchema, quizOf([blitz]))).toContain('reveal_place');
    expect(issues(quizSchema, quizOf([finalR]))).toContain('reveal_place');
    expect(issues(quizSchema, quizOf([board()]))).toEqual([]);
    const withCell = (cellPatch: object) => {
      const b = board();
      Object.assign(b.categories[0]!.cells[0]!, cellPatch);
      return quizOf([b]);
    };
    expect(issues(quizSchema, withCell({ kind: 'blitz' }))).toContain('reveal_place');
    expect(issues(quizSchema, withCell({ answerMode: 'voice' }))).toContain('reveal_place');
    expect(issues(quizSchema, quizOf([board({ answerMode: 'voice' })]))).toContain('reveal_place');
  });

  it('spares take no audio or reveal', () => {
    const base = quizOf([round('r', [single])]);
    expect(valid(quizSchema, { ...base, spares: [spareSingle] })).toBe(true);
    expect(issues(quizSchema, { ...base, spares: [{ ...spareSingle, audio: file }] })).toContain('spare_video');
    expect(issues(quizSchema, { ...base, spares: [{ ...spareSingle, imageUrl: img, reveal: 'blur' }] })).toContain('spare_video');
  });

  it('proximityPartial: proximity types only (slider), not a revealing picture', () => {
    const slider = questionSchema.parse({ id: 's', type: 'slider', text: 'С', imageUrl: null, timeLimit: 20, points: 100,
      min: 0, max: 10, step: 1, correct: 5, tolerance: 0 });
    expect(proximityPartial(slider)).toBe(true);
    expect(proximityPartial(questionSchema.parse(revealing('q')))).toBe(false);
    expect(proximityPartial(questionSchema.parse(single))).toBe(false);
  });
});

describe('clues (10c)', () => {
  const cluesQ = { id: 'c1', type: 'clues', text: 'Хто я?', imageUrl: null, video: null, timeLimit: 30, points: 1000,
    clues: ['Я народився 1814 року.', 'Я був кріпаком.', 'Я художник.', 'Я написав «Кобзар».', 'Я на купюрі 100 гривень.'],
    accepted: ['Шевченко', 'Тарас Шевченко'], interval: 5 } as const;
  const issues = (value: unknown) => {
    const parsed = questionSchema.safeParse(value);
    return parsed.success ? [] : parsed.error.issues.map((i) => i.message);
  };
  it('is a question type but not a simple or reveal type', () => {
    expect(QUESTION_TYPES).toContain('clues');
    expect(SIMPLE_TYPES).not.toContain('clues');
    expect(valid(questionSchema, cluesQ)).toBe(true);
  });
  it('checks the clue count, length, interval and that the last clue opens 5 s before the end', () => {
    expect(valid(questionSchema, { ...cluesQ, clues: cluesQ.clues.slice(0, 2) })).toBe(false);
    expect(valid(questionSchema, { ...cluesQ, clues: [...cluesQ.clues, 'a', 'b'] })).toBe(false); // 7 > 6
    expect(valid(questionSchema, { ...cluesQ, clues: ['x'.repeat(LIMITS.clueText + 1), 'b', 'c'] })).toBe(false);
    expect(valid(questionSchema, { ...cluesQ, interval: 2 })).toBe(false);
    expect(issues({ ...cluesQ, timeLimit: 24 })).toContain('clues_time'); // 4 × 5 + 5 = 25 > 24
    expect(issues({ ...cluesQ, timeLimit: 25 })).not.toContain('clues_time');
    expect(issues({ ...cluesQ, video: { id: 'dQw4w9WgXcQ', start: 0 } })).toContain('clues_video');
  });
  it('cluesAt and clueShare', () => {
    expect(cluesAt(cluesQ, 0)).toBe(1);
    expect(cluesAt(cluesQ, 4999)).toBe(1);
    expect(cluesAt(cluesQ, 5000)).toBe(2);
    expect(cluesAt(cluesQ, 60_000)).toBe(5);
    expect(cluesAt(cluesQ, -100)).toBe(1);
    expect(cluesAt(cluesQ, Number.POSITIVE_INFINITY)).toBe(5);
    expect(cluesAt(cluesQ, Number.NaN)).toBe(1);
    expect([1, 2, 3, 4, 5].map((k) => clueShare(5, k))).toEqual([1, 0.8, 0.6, 0.4, 0.2]);
    expect(clueShare(5, 9)).toBe(0.2);
    expect(clueShare(5, 0)).toBe(1);
    expect(clueShare(5, Number.NaN)).toBe(1);
  });
  it('a revealing picture is not allowed (reveal_type); audio is allowed', () => {
    const img = `/uploads/${'b'.repeat(32)}.png`;
    expect(issues({ ...cluesQ, imageUrl: img, reveal: 'blur' })).toContain('reveal_type');
    expect(valid(questionSchema, { ...cluesQ, imageUrl: img })).toBe(true);
    expect(valid(questionSchema, { ...cluesQ, audio: { source: 'file', url: `/uploads/${'a'.repeat(32)}.mp3`, start: 0, duration: 20 } })).toBe(true);
  });
  it('the answer is a string', () => {
    expect(valid(answerSchema, { type: 'clues', value: 'Шевченко' })).toBe(true);
    expect(valid(answerSchema, { type: 'clues', value: 5 })).toBe(false);
  });

  describe('at own pace (12c)', () => {
    it('self needs no interval and no clue timing, but at least 20 s', () => {
      const { interval: _interval, ...noInterval } = cluesQ;
      const parsed = questionSchema.safeParse({ ...noInterval, cluePace: 'self', timeLimit: LIMITS.selfCluesMinTime });
      expect(parsed.success).toBe(true);
      expect(parsed.data).toMatchObject({ cluePace: 'self', interval: LIMITS.defaultClueSeconds });
      const six = { ...cluesQ, clues: [...cluesQ.clues, 'Шоста.'], interval: 30, cluePace: 'self' };
      expect(issues({ ...six, timeLimit: 20 })).toEqual([]); // (6 − 1) × 30 + 5 > 20, але clues_time не діє
      expect(issues({ ...six, timeLimit: 19 })).toContain('clues_self_time');
      expect(issues({ ...six, timeLimit: 19 })).not.toContain('clues_time');
    });

    it('timer is the default: a question without the field parses as before and keeps no key', () => {
      const parsed = questionSchema.safeParse(cluesQ);
      expect(parsed.success).toBe(true);
      expect('cluePace' in (parsed.data as object)).toBe(false);
      expect(issues({ ...cluesQ, cluePace: 'timer', timeLimit: 24 })).toContain('clues_time');
      expect(issues({ ...cluesQ, cluePace: 'magic' })).not.toEqual([]);
    });

    it('isSelfPaced and the same places as before', () => {
      expect(isSelfPaced({ ...cluesQ, cluePace: 'self' } as unknown as Question)).toBe(true);
      expect(isSelfPaced(cluesQ as unknown as Question)).toBe(false);
      expect(LIMITS.selfCluesMinTime).toBe(20);
    });
  });
});

describe('pin (10c)', () => {
  const pinQ = { id: 'p1', type: 'pin', text: 'Де Київ?', imageUrl: null, video: null, timeLimit: 30, points: 1000,
    map: 'world', aspect: 2, target: { x: 0.5, y: 0.5 }, fullRadius: 3, zeroRadius: 15 } as const;
  const img = `/uploads/${'b'.repeat(32)}.png`;
  const issues = (value: unknown) => {
    const parsed = questionSchema.safeParse(value);
    return parsed.success ? [] : parsed.error.issues.map((i) => i.message);
  };
  it('a pin is a question type, not simple; a map or an own picture as the base', () => {
    expect(QUESTION_TYPES).toContain('pin');
    expect(SIMPLE_TYPES).not.toContain('pin');
    expect(valid(questionSchema, pinQ)).toBe(true);
    expect(valid(questionSchema, { ...pinQ, map: null, imageUrl: img, aspect: 0.75 })).toBe(true);
    expect(issues({ ...pinQ, map: null })).toContain('pin_base');
    expect(issues({ ...pinQ, imageUrl: img })).toContain('pin_base');
    expect(issues({ ...pinQ, aspect: 1.5 })).toContain('pin_aspect');
    expect(issues({ ...pinQ, zeroRadius: 3 })).toContain('pin_radius');
    expect(issues({ ...pinQ, video: { id: 'dQw4w9WgXcQ', start: 0 } })).toContain('pin_video');
    expect(valid(questionSchema, { ...pinQ, target: { x: 1.2, y: 0.5 } })).toBe(false);
    expect(valid(questionSchema, { ...pinQ, map: null, imageUrl: img, aspect: 5 })).toBe(false);
  });
  it('pinDistance measures in % of the longer side and respects the aspect', () => {
    expect(pinDistance(pinQ, 0.52, 0.5)).toBeCloseTo(2);
    expect(pinDistance(pinQ, 0.5, 0.68)).toBeCloseTo(9); // висота — половина ширини
    expect(pinDistance({ ...pinQ, aspect: 0.5 }, 0.68, 0.5)).toBeCloseTo(9); // тепер довша — висота
  });
  it('pinShare: full inside the inner circle, linear to the outer, nothing outside', () => {
    expect(pinShare(pinQ, 0.52, 0.5)).toBe(1);
    expect(pinShare(pinQ, 0.59, 0.5)).toBeCloseTo(0.5);
    expect(pinShare(pinQ, 0.62, 0.5)).toBeCloseTo(0.25);
    expect(pinShare(pinQ, 0.66, 0.5)).toBe(0);
    expect(pinShare(pinQ, Number.NaN, 0.5)).toBe(0);
    expect(pinShare(pinQ, 1.2, 0.5)).toBe(0);
  });
  it('pinShare exactly on the circles: full radius pays all, zero radius pays nothing', () => {
    expect(pinShare(pinQ, 0.53, 0.5)).toBe(1); // рівно 3 %
    expect(pinShare(pinQ, 0.65, 0.5)).toBe(0); // рівно 15 %
    expect(pinShare(pinQ, 0.5, 0.56)).toBe(1); // висота — половина ширини: 0,06 × 0,5 = 3 %
  });
  it('a revealing own picture is not allowed (reveal_type); audio is allowed', () => {
    expect(issues({ ...pinQ, map: null, imageUrl: img, reveal: 'pixels' })).toContain('reveal_type');
    expect(valid(questionSchema, { ...pinQ, audio: { source: 'youtube', id: 'dQw4w9WgXcQ', start: 0, duration: 15 } })).toBe(true);
  });
  it('proximityPartial: slider and pin only', () => {
    expect(proximityPartial(pinQ as unknown as Question)).toBe(true);
    expect(proximityPartial(single as unknown as Question)).toBe(false);
    expect(proximityPartial({ type: 'clues' } as unknown as Question)).toBe(false);
    expect(proximityPartial({ type: 'text' } as unknown as Question)).toBe(false);
  });
  it('the answer is a point inside the picture', () => {
    expect(valid(answerSchema, { type: 'pin', x: 0.3, y: 1 })).toBe(true);
    expect(valid(answerSchema, { type: 'pin', x: -0.1, y: 0.5 })).toBe(false);
    expect(valid(answerSchema, { type: 'pin', x: 0.5, y: Number.POSITIVE_INFINITY })).toBe(false);
  });
});

describe('where clues and pins live (10c)', () => {
  const cluesQ = { id: 'c1', type: 'clues', text: 'Хто я?', imageUrl: null, video: null, timeLimit: 30, points: 1000,
    clues: ['а', 'б', 'в'], accepted: ['Х'], interval: 5 };
  const pinQ = { id: 'p1', type: 'pin', text: 'Де?', imageUrl: null, video: null, timeLimit: 30, points: 1000,
    map: 'world', aspect: 2, target: { x: 0.5, y: 0.5 }, fullRadius: 3, zeroRadius: 15 };
  const issues = (value: unknown) => {
    const result = quizSchema.safeParse(value);
    return result.success ? [] : result.error.issues.map((i) => i.message);
  };
  const quizOf = (rounds: object[], patch: object = {}) => ({ title: 'T', description: '', settings: DEFAULT_SETTINGS, rounds, ...patch });
  const blitz = (q: object) => ({ id: 'bl', type: 'blitz', title: '', shuffleOptions: false, answerWindow: DEFAULT_ANSWER_WINDOW, attempts: 1,
    check: 'auto', rules: { ...DEFAULT_RULES, partial: null }, questions: [q] });
  const finalR = (q: object) => ({ id: 'f', type: 'final', title: '', shuffleOptions: false, check: 'auto', questions: [q] });
  const board = (q: object, patch: object = {}) => ({
    id: 'b', type: 'board', title: '', shuffleOptions: false, answerMode: 'phone', check: 'auto', rules: DEFAULT_RULES, ...patch,
    categories: [1, 2, 3].map((n) => ({ id: `c${n}`, title: `К${n}`, cells: [1, 2, 3].map((m) => ({ mark: 'none',
      question: n === 1 && m === 1 ? q : { ...single, id: `q${n}${m}` } })) })),
  });
  const withCell = (q: object, cellPatch: object) => {
    const b = board(q);
    Object.assign(b.categories[0]!.cells[0]!, cellPatch);
    return quizOf([b]);
  };

  it('clues: classic, a normal phone cell and a voice cell; not blitz, final or a blitz cell', () => {
    expect(issues(quizOf([round('r', [cluesQ])]))).toEqual([]);
    expect(issues(quizOf([board(cluesQ)]))).toEqual([]);
    expect(issues(quizOf([board(cluesQ, { answerMode: 'voice' })]))).toEqual([]);
    expect(issues(withCell(cluesQ, { answerMode: 'voice' }))).toEqual([]);
    expect(issues(quizOf([blitz(cluesQ)]))).toContain('clues_place');
    expect(issues(quizOf([finalR(cluesQ)]))).toContain('clues_place');
    expect(issues(withCell(cluesQ, { kind: 'blitz' }))).toContain('clues_place');
  });
  it('clues at own pace: still not blitz, final or a blitz cell (12c)', () => {
    const own = { ...cluesQ, cluePace: 'self', timeLimit: 30 };
    expect(issues(quizOf([blitz(own)]))).toContain('clues_place');
    expect(issues(quizOf([finalR(own)]))).toContain('clues_place');
    expect(issues(withCell(own, { kind: 'blitz' }))).toContain('clues_place');
  });
  it('pin: classic and a normal phone cell; not blitz, final, a blitz cell or a voice cell', () => {
    expect(issues(quizOf([round('r', [pinQ])]))).toEqual([]);
    expect(issues(quizOf([board(pinQ)]))).toEqual([]);
    expect(issues(quizOf([blitz(pinQ)]))).toContain('pin_place');
    expect(issues(quizOf([finalR(pinQ)]))).toContain('pin_place');
    expect(issues(withCell(pinQ, { kind: 'blitz' }))).toContain('pin_place');
    expect(issues(withCell(pinQ, { answerMode: 'voice' }))).toContain('pin_place');
    expect(issues(quizOf([board(pinQ, { answerMode: 'voice' })]))).toContain('pin_place');
  });
  it('spares cannot be clues or pins', () => {
    const base = quizOf([round('r', [single])]);
    expect(issues({ ...base, spares: [{ ...cluesQ, id: 's1' }] })).toContain('spare_type');
    expect(issues({ ...base, spares: [{ ...pinQ, id: 's1' }] })).toContain('spare_type');
  });
});

describe('wall (10d)', () => {
  const qIssues = (value: unknown) => {
    const result = questionSchema.safeParse(value);
    return result.success ? [] : result.error.issues.map((i) => i.message);
  };
  const tiles = (prefix: string, ...texts: string[]) => texts.map((text, i) => ({ id: `${prefix}${i + 1}`, text }));
  const wallQ = { id: 'w1', type: 'wall', text: "Знайдіть зв'язки", imageUrl: null, video: null, timeLimit: 90, points: 1000, mistakes: 3,
    groups: [
      { id: 'gr', name: 'Річки', tiles: tiles('r', 'Дніпро', 'Десна', 'Рось', 'Псел') },
      { id: 'gm', name: 'Гори', tiles: tiles('m', 'Говерла', 'Петрос', 'Піп Іван', 'Бребенескул') },
      { id: 'gl', name: 'Озера', tiles: tiles('l', 'Світязь', 'Синевир', 'Ялпуг', 'Кагул') },
      { id: 'gi', name: 'Острови', tiles: tiles('i', 'Хортиця', 'Джарилгач', 'Зміїний', 'Бірючий') },
    ] };
  it('a wall is a question type, not simple; 4×4 and 3×3 only', () => {
    expect(QUESTION_TYPES).toContain('wall');
    expect(SIMPLE_TYPES).not.toContain('wall');
    expect(valid(questionSchema, wallQ)).toBe(true);
    const small = { ...wallQ, groups: wallQ.groups.slice(0, 3).map((g) => ({ ...g, tiles: g.tiles.slice(0, 3) })) };
    expect(valid(questionSchema, small)).toBe(true);
    expect(qIssues({ ...wallQ, groups: [...wallQ.groups.slice(0, 3), { ...wallQ.groups[3], tiles: wallQ.groups[3]!.tiles.slice(0, 3) }] })).toContain('wall_shape');
    expect(qIssues({ ...small, groups: [...small.groups.slice(0, 2), wallQ.groups[3]] })).toContain('wall_shape');
  });
  it('checks tiles, names, mistakes, duplicates and video', () => {
    const dupe = { ...wallQ, groups: [{ ...wallQ.groups[0], tiles: tiles('r', 'Дніпро', ' дніпро ', 'Рось', 'Псел') }, ...wallQ.groups.slice(1)] };
    expect(qIssues(dupe)).toContain('wall_duplicate_tiles');
    expect(valid(questionSchema, { ...wallQ, mistakes: 0 })).toBe(false);
    expect(valid(questionSchema, { ...wallQ, mistakes: 6 })).toBe(false);
    expect(valid(questionSchema, { ...wallQ, groups: [{ ...wallQ.groups[0], name: '' }, ...wallQ.groups.slice(1)] })).toBe(false);
    expect(valid(questionSchema, { ...wallQ, groups: [{ ...wallQ.groups[0], tiles: tiles('r', 'x'.repeat(LIMITS.wallTile + 1), 'Десна', 'Рось', 'Псел') }, ...wallQ.groups.slice(1)] })).toBe(false);
    expect(qIssues({ ...wallQ, video: { id: 'dQw4w9WgXcQ', start: 0 } })).toContain('wall_video');
    expect(qIssues({ ...wallQ, groups: [{ ...wallQ.groups[0], id: 'gm' }, ...wallQ.groups.slice(1)] })).toContain('duplicate_ids');
  });
  it('wallScored: the last group gives nothing; wallShare', () => {
    expect([0, 1, 2, 4].map((f) => wallScored(f, 4))).toEqual([0, 1, 2, 3]);
    expect(wallShare(2, 4)).toBe(0.5);
    expect(wallShare(3, 3)).toBeCloseTo(2 / 3);
    expect(proximityPartial(wallQ as unknown as Question)).toBe(true);
  });
});

describe('poll and word cloud (10d)', () => {
  const qIssues = (value: unknown) => {
    const result = questionSchema.safeParse(value);
    return result.success ? [] : result.error.issues.map((i) => i.message);
  };
  const pollQ = { id: 'p1', type: 'poll', text: 'Найкраща пора року?', imageUrl: null, video: null, timeLimit: 20, points: 0,
    options: [{ id: 'a', text: 'Весна' }, { id: 'b', text: 'Літо' }, { id: 'c', text: 'Осінь' }] };
  const cloudQ = { id: 'k1', type: 'wordcloud', text: 'З чим асоціюється Київ?', imageUrl: null, video: null, timeLimit: 30, points: 0, words: 3 };
  it('both are unscored types with zero points', () => {
    expect(isUnscored(pollQ as { type: 'poll' })).toBe(true);
    expect(isUnscored(cloudQ as { type: 'wordcloud' })).toBe(true);
    expect(isUnscored({ type: 'single' })).toBe(false);
    expect(valid(questionSchema, pollQ)).toBe(true);
    expect(valid(questionSchema, cloudQ)).toBe(true);
    expect(qIssues({ ...pollQ, points: 100 })).toContain('vote_points');
    expect(qIssues({ ...cloudQ, points: 100 })).toContain('vote_points');
    expect(valid(questionSchema, { ...cloudQ, words: 4 })).toBe(false);
    expect(qIssues({ ...pollQ, options: [{ id: 'a', text: 'x' }, { id: 'a', text: 'y' }] })).toContain('duplicate_ids');
    expect(questionPrice(pollQ as unknown as Question)).toBe(0);
  });
  it('cloudKey ignores case, spaces and apostrophe variants; cloudWords dedupes and caps', () => {
    expect(cloudKey('  КИЇВ ')).toBe('київ');
    expect(cloudKey('Нью   Йорк')).toBe('нью йорк');
    expect(cloudKey('м’ята')).toBe(cloudKey("М'ята"));
    expect(cloudWords([' Каштани ', 'каштани', '', 'Дніпро', 'Лавра'], 3)).toEqual(['Каштани', 'Дніпро', 'Лавра']);
    expect(cloudWords(['a', 'b', 'c', 'd'], 2)).toEqual(['a', 'b']);
    expect(cloudWords(['Нью   Йорк'], 3)).toEqual(['Нью Йорк']);
  });
  it('the answers: a poll option and one to three short words', () => {
    expect(valid(answerSchema, { type: 'poll', optionId: 'a' })).toBe(true);
    expect(valid(answerSchema, { type: 'wordcloud', words: ['каштани'] })).toBe(true);
    expect(valid(answerSchema, { type: 'wordcloud', words: [] })).toBe(false);
    expect(valid(answerSchema, { type: 'wordcloud', words: ['а', 'б', 'в', 'г'] })).toBe(false);
    expect(valid(answerSchema, { type: 'wordcloud', words: ['x'.repeat(LIMITS.cloudWord + 1)] })).toBe(false);
    expect(valid(answerSchema, { type: 'wordcloud', words: ['  '] })).toBe(false);
  });
});

describe('where walls, polls and clouds live (10d)', () => {
  const tiles = (prefix: string, ...texts: string[]) => texts.map((text, i) => ({ id: `${prefix}${i + 1}`, text }));
  const wallQ = { id: 'w1', type: 'wall', text: 'Стіна', imageUrl: null, video: null, timeLimit: 90, points: 1000, mistakes: 3,
    groups: ['a', 'b', 'c', 'd'].map((g) => ({ id: `g${g}`, name: `Група ${g}`, tiles: tiles(g, `${g}1`, `${g}2`, `${g}3`, `${g}4`) })) };
  const pollQ = { id: 'p1', type: 'poll', text: 'Опитування', imageUrl: null, video: null, timeLimit: 20, points: 0,
    options: [{ id: 'a', text: 'Так' }, { id: 'b', text: 'Ні' }] };
  const cloudQ = { id: 'k1', type: 'wordcloud', text: 'Хмара', imageUrl: null, video: null, timeLimit: 30, points: 0, words: 3 };
  const issues = (value: unknown) => {
    const result = quizSchema.safeParse(value);
    return result.success ? [] : result.error.issues.map((i) => i.message);
  };
  const quizOf = (rounds: object[], patch: object = {}) => ({ title: 'T', description: '', settings: DEFAULT_SETTINGS, rounds, ...patch });
  const blitz = (q: object) => ({ id: 'bl', type: 'blitz', title: '', shuffleOptions: false, answerWindow: DEFAULT_ANSWER_WINDOW, attempts: 1,
    check: 'auto', rules: { ...DEFAULT_RULES, partial: null }, questions: [q] });
  const finalR = (q: object) => ({ id: 'f', type: 'final', title: '', shuffleOptions: false, check: 'auto', questions: [q] });
  const board = (q: object, patch: object = {}) => ({
    id: 'b', type: 'board', title: '', shuffleOptions: false, answerMode: 'phone', check: 'auto', rules: DEFAULT_RULES, ...patch,
    categories: [1, 2, 3].map((n) => ({ id: `c${n}`, title: `К${n}`, cells: [1, 2, 3].map((m) => ({ mark: 'none',
      question: n === 1 && m === 1 ? q : { ...single, id: `q${n}${m}` } })) })),
  });
  const withCell = (q: object, cellPatch: object) => {
    const b = board(q);
    Object.assign(b.categories[0]!.cells[0]!, cellPatch);
    return quizOf([b]);
  };

  it('wall: classic and a normal phone cell; not blitz, final, a blitz cell or a voice cell', () => {
    expect(issues(quizOf([round('r', [wallQ])]))).toEqual([]);
    expect(issues(quizOf([board(wallQ)]))).toEqual([]);
    expect(issues(quizOf([blitz(wallQ)]))).toContain('wall_place');
    expect(issues(quizOf([finalR(wallQ)]))).toContain('wall_place');
    expect(issues(withCell(wallQ, { kind: 'blitz' }))).toContain('wall_place');
    expect(issues(withCell(wallQ, { answerMode: 'voice' }))).toContain('wall_place');
    expect(issues(quizOf([board(wallQ, { answerMode: 'voice' })]))).toContain('wall_place');
  });
  it('poll and word cloud: classic only', () => {
    for (const q of [pollQ, cloudQ]) {
      expect(issues(quizOf([round('r', [q])]))).toEqual([]);
      expect(issues(quizOf([blitz(q)]))).toContain('vote_place');
      expect(issues(quizOf([finalR(q)]))).toContain('vote_place');
      expect(issues(quizOf([board(q)]))).toContain('vote_place');
      expect(issues(withCell(q, { answerMode: 'voice' }))).toContain('vote_place');
    }
  });
  it('spares cannot be walls, polls or clouds', () => {
    const base = quizOf([round('r', [single])]);
    for (const q of [wallQ, pollQ, cloudQ]) expect(issues({ ...base, spares: [{ ...q, id: 's1' }] })).toContain('spare_type');
  });
});

describe('survey (10e)', () => {
  const row = (id: string, text: string, popularity: number, accepted: string[] = []) => ({ id, text, popularity, accepted });
  const surveyQ = { id: 's1', type: 'survey', text: 'Назвіть фрукт, який люблять діти', imageUrl: null, video: null, timeLimit: 45, points: 1000, answers: 3,
    rows: [row('a', 'Яблуко', 32, ['яблучко']), row('b', 'Банан', 25), row('c', 'Полуниця', 15), row('d', 'Кавун', 10), row('e', 'Груша', 8)] } as const;
  const issues = (value: unknown) => {
    const result = questionSchema.safeParse(value);
    return result.success ? [] : result.error.issues.map((i) => i.message);
  };
  it('a survey is a scored, not simple question type with 4–8 rows', () => {
    expect(QUESTION_TYPES).toContain('survey');
    expect(SIMPLE_TYPES).not.toContain('survey');
    expect(isUnscored(surveyQ)).toBe(false);
    expect(valid(questionSchema, surveyQ)).toBe(true);
    expect(issues({ ...surveyQ, rows: surveyQ.rows.slice(0, 3) })).toContain('survey_rows');
    expect(valid(questionSchema, { ...surveyQ, rows: [...surveyQ.rows, ...['f', 'g', 'h', 'i'].map((id) => row(id, id, 1))] })).toBe(false);
    expect(valid(questionSchema, { ...surveyQ, answers: 0 })).toBe(false);
    expect(valid(questionSchema, { ...surveyQ, answers: 6 })).toBe(false);
  });
  it('checks the total, duplicate spellings, popularity and ids', () => {
    expect(issues({ ...surveyQ, rows: [row('a', 'Яблуко', 60), ...surveyQ.rows.slice(1)] })).toContain('survey_total');
    expect(issues({ ...surveyQ, rows: [surveyQ.rows[0], row('b', 'Банан', 25, [' ЯБЛУЧКО ']), ...surveyQ.rows.slice(2)] })).toContain('survey_duplicate');
    expect(valid(questionSchema, { ...surveyQ, rows: [row('a', 'Яблуко', 0), ...surveyQ.rows.slice(1)] })).toBe(false);
    expect(issues({ ...surveyQ, rows: [row('b', 'Яблуко', 32), ...surveyQ.rows.slice(1)] })).toContain('duplicate_ids');
  });
  it('duplicate spellings use the answer key: quote variants clash, a row repeating its own text does not', () => {
    const kobzar = [row('a', '«Кобзар»', 32), row('b', 'Банан', 25, ['“Кобзар”']), ...surveyQ.rows.slice(2)];
    expect(issues({ ...surveyQ, rows: kobzar })).toContain('survey_duplicate');
    expect(issues({ ...surveyQ, rows: [row('a', 'Яблуко', 32, [' яблуко ', 'ЯБЛУКО', 'яблучко']), ...surveyQ.rows.slice(1)] })).not.toContain('survey_duplicate');
    expect(answerKey('  «Кам’янець»   Поділь ')).toBe(`"кам'янець" поділь`);
  });
  it('multiple: optional flag; with it the total may pass 100, rows stay 1..100', () => {
    const over = [row('a', 'Яблуко', 60), ...surveyQ.rows.slice(1)];
    expect(valid(questionSchema, { ...surveyQ, multiple: true, rows: over })).toBe(true);
    expect(issues({ ...surveyQ, multiple: false, rows: over })).toContain('survey_total');
    expect(valid(questionSchema, { ...surveyQ, multiple: 'так' })).toBe(false);
    expect(valid(questionSchema, { ...surveyQ, multiple: true, rows: [row('a', 'Яблуко', 101), ...surveyQ.rows.slice(1)] })).toBe(false);
    const parsed = questionSchema.parse(surveyQ);
    expect('multiple' in parsed).toBe(false);
  });
  it('surveyShare with multiple divides by max(100, total of all rows)', () => {
    const rows = [row('a', 'A', 60), row('b', 'B', 50), row('c', 'C', 40), row('d', 'D', 50)]; // разом 200
    expect(surveyShare({ rows, multiple: true }, ['a', 'b'])).toBeCloseTo(110 / 200);
    expect(surveyShare({ rows, multiple: true }, ['a', 'b', 'c', 'd'])).toBe(1);
    expect(surveyShare({ rows }, ['a', 'b'])).toBe(1);
    // Сума до 100 — ділиться на 100, як без прапорця.
    expect(surveyShare({ ...surveyQ, multiple: true }, ['a', 'b'])).toBeCloseTo(0.57);
    expect(surveyShare({ ...surveyQ, multiple: false }, ['a', 'b'])).toBeCloseTo(0.57);
  });
  it('a cloud board may have no rows or 4–8 spare rows', () => {
    expect(valid(questionSchema, { ...surveyQ, rows: [], cloudId: 'k1' })).toBe(true);
    expect(valid(questionSchema, { ...surveyQ, cloudId: 'k1' })).toBe(true);
    expect(issues({ ...surveyQ, rows: surveyQ.rows.slice(0, 2), cloudId: 'k1' })).toContain('survey_rows');
  });
  it('surveyOrder and surveyShare', () => {
    expect(surveyOrder([row('x', 'X', 5), row('y', 'Y', 9), row('z', 'Z', 5)]).map((r) => r.id)).toEqual(['y', 'x', 'z']);
    expect(surveyShare(surveyQ, ['a', 'b', null])).toBeCloseTo(0.57);
    expect(surveyShare(surveyQ, ['a', 'a'])).toBeCloseTo(0.32);
    expect(surveyShare({ rows: [row('a', 'A', 100), row('b', 'B', 50)] }, ['a', 'b'])).toBe(1);
    expect(surveyShare(surveyQ, ['zzz'])).toBe(0);
    expect(proximityPartial(surveyQ as unknown as Question)).toBe(true);
  });
  it('the answer: one to five short values, empty ones allowed; surveyHitsOf', () => {
    expect(valid(answerSchema, { type: 'survey', values: ['Яблуко', ''] })).toBe(true);
    expect(valid(answerSchema, { type: 'survey', values: [] })).toBe(false);
    expect(valid(answerSchema, { type: 'survey', values: ['a', 'b', 'c', 'd', 'e', 'f'] })).toBe(false);
    expect(valid(answerSchema, { type: 'survey', values: ['x'.repeat(LIMITS.surveyAnswer + 1)] })).toBe(false);
    expect(surveyHitsOf({ type: 'survey', values: ['a'] } as unknown as Answer)).toBeNull();
    expect(surveyHitsOf({ type: 'survey', values: ['a'], rows: ['x'] })).toEqual(['x']);
    expect(surveyHitsOf({ type: 'text', value: 'a' })).toBeNull();
    expect(surveyHitsOf(null)).toBeNull();
  });
});

describe('where surveys live (10e)', () => {
  const row = (id: string, text: string, popularity: number) => ({ id, text, popularity, accepted: [] });
  const rows = [row('a', 'Яблуко', 32), row('b', 'Банан', 25), row('c', 'Полуниця', 15), row('d', 'Кавун', 10)];
  const surveyQ = { id: 's1', type: 'survey', text: 'Фрукт', imageUrl: null, video: null, timeLimit: 45, points: 1000, answers: 3, rows };
  const cloudQ = { id: 'k1', type: 'wordcloud', text: 'Хмара', imageUrl: null, video: null, timeLimit: 30, points: 0, words: 3 };
  const issues = (value: unknown) => {
    const result = quizSchema.safeParse(value);
    return result.success ? [] : result.error.issues.map((i) => i.message);
  };
  const quizOf = (rounds: object[], patch: object = {}) => ({ title: 'T', description: '', settings: DEFAULT_SETTINGS, rounds, ...patch });
  const blitz = (q: object) => ({ id: 'bl', type: 'blitz', title: '', shuffleOptions: false, answerWindow: DEFAULT_ANSWER_WINDOW, attempts: 1,
    check: 'auto', rules: { ...DEFAULT_RULES, partial: null }, questions: [q] });
  const finalR = (q: object) => ({ id: 'f', type: 'final', title: '', shuffleOptions: false, check: 'auto', questions: [q] });
  const board = (q: object, patch: object = {}) => ({
    id: 'b', type: 'board', title: '', shuffleOptions: false, answerMode: 'phone', check: 'auto', rules: DEFAULT_RULES, ...patch,
    categories: [1, 2, 3].map((n) => ({ id: `c${n}`, title: `К${n}`, cells: [1, 2, 3].map((m) => ({ mark: 'none',
      question: n === 1 && m === 1 ? q : { ...single, id: `q${n}${m}` } })) })),
  });
  const withCell = (q: object, cellPatch: object) => {
    const b = board(q);
    Object.assign(b.categories[0]!.cells[0]!, cellPatch);
    return quizOf([b]);
  };

  it('survey: classic and a normal phone cell; not blitz, final, a blitz cell or a voice cell', () => {
    expect(issues(quizOf([round('r', [surveyQ])]))).toEqual([]);
    expect(issues(quizOf([board(surveyQ)]))).toEqual([]);
    expect(issues(quizOf([blitz(surveyQ)]))).toContain('survey_place');
    expect(issues(quizOf([finalR(surveyQ)]))).toContain('survey_place');
    expect(issues(withCell(surveyQ, { kind: 'blitz' }))).toContain('survey_place');
    expect(issues(withCell(surveyQ, { answerMode: 'voice' }))).toContain('survey_place');
    expect(issues(quizOf([board(surveyQ, { answerMode: 'voice' })]))).toContain('survey_place');
  });
  it('a cloud board needs an earlier word cloud, in the same classic round or an earlier round', () => {
    const fromCloud = { ...surveyQ, id: 's2', cloudId: 'k1', rows: [] };
    expect(issues(quizOf([round('r', [cloudQ, fromCloud])]))).toEqual([]);
    expect(issues(quizOf([round('r1', [cloudQ]), round('r2', [fromCloud])]))).toEqual([]);
    expect(issues(quizOf([round('r', [fromCloud, cloudQ])]))).toContain('survey_cloud');
    expect(issues(quizOf([round('r1', [fromCloud]), round('r2', [cloudQ])]))).toContain('survey_cloud');
    expect(issues(quizOf([round('r', [{ ...cloudQ, id: 'k2' }, fromCloud])]))).toContain('survey_cloud');
    expect(issues(quizOf([round('r', [{ ...surveyQ, id: 'k1' }, fromCloud])]))).toContain('survey_cloud');
  });
  it('a cloud board cannot sit on the board', () => {
    const fromCloud = { ...surveyQ, id: 's2', cloudId: 'k1', rows: [] };
    expect(issues(quizOf([round('r1', [cloudQ]), board(fromCloud)]))).toContain('survey_cloud_place');
  });
  it('spares cannot be surveys', () => {
    const base = quizOf([round('r', [single])]);
    expect(issues({ ...base, spares: [{ ...surveyQ, id: 's9' }] })).toContain('spare_type');
  });
});

describe('bluff (10f)', () => {
  const bluffQ = { id: 'b1', type: 'bluff', text: 'Ейфелеву вежу спершу пропонували поставити в …, але місто відмовилося.', imageUrl: null, video: null,
    timeLimit: 60, choiceTime: 30, points: 1000, accepted: ['Барселона', 'Барселоні'], lies: ['Мадрид', 'Лондон', 'Брюссель'] } as const;
  const issues = (value: unknown) => {
    const result = questionSchema.safeParse(value);
    return result.success ? [] : result.error.issues.map((i) => i.message);
  };
  it('a bluff is a scored, not simple question type with a truth, 2–3 spare lies and a choice time', () => {
    expect(QUESTION_TYPES).toContain('bluff');
    expect(SIMPLE_TYPES).not.toContain('bluff');
    expect(isUnscored(bluffQ as unknown as Question)).toBe(false);
    expect(proximityPartial(bluffQ as unknown as Question)).toBe(false);
    expect(valid(questionSchema, bluffQ)).toBe(true);
    expect(valid(questionSchema, { ...bluffQ, lies: ['Мадрид'] })).toBe(false);
    expect(valid(questionSchema, { ...bluffQ, lies: ['a', 'b', 'c', 'd'] })).toBe(false);
    expect(valid(questionSchema, { ...bluffQ, choiceTime: 4 })).toBe(false);
    expect(valid(questionSchema, { ...bluffQ, accepted: [] })).toBe(false);
  });
  it('checks the truth length, spare duplicates, spares equal to the truth and video', () => {
    expect(issues({ ...bluffQ, accepted: ['Б'.repeat(61)] })).toContain('bluff_truth_long');
    expect(issues({ ...bluffQ, lies: ['Мадрид', ' мадрид '] })).toContain('bluff_spare_duplicate');
    expect(issues({ ...bluffQ, lies: ['Мадрид', 'БАРСЕЛОНІ'] })).toContain('bluff_spare_truth');
    expect(issues({ ...bluffQ, video: { id: 'dQw4w9WgXcQ', start: 0 } })).toContain('bluff_video');
  });
});

describe('where bluffs live (10f)', () => {
  const bluffQ = { id: 'b1', type: 'bluff', text: 'Факт з …', imageUrl: null, video: null, timeLimit: 60, choiceTime: 30, points: 1000,
    accepted: ['Барселона'], lies: ['Мадрид', 'Лондон'] };
  const issues = (value: unknown) => {
    const result = quizSchema.safeParse(value);
    return result.success ? [] : result.error.issues.map((i) => i.message);
  };
  const quizOf = (rounds: object[], patch: object = {}) => ({ title: 'T', description: '', settings: DEFAULT_SETTINGS, rounds, ...patch });
  const blitz = (q: object) => ({ id: 'bl', type: 'blitz', title: '', shuffleOptions: false, answerWindow: DEFAULT_ANSWER_WINDOW, attempts: 1,
    check: 'auto', rules: { ...DEFAULT_RULES, partial: null }, questions: [q] });
  const finalR = (q: object) => ({ id: 'f', type: 'final', title: '', shuffleOptions: false, check: 'auto', questions: [q] });
  const board = (q: object) => ({
    id: 'b', type: 'board', title: '', shuffleOptions: false, answerMode: 'phone', check: 'auto', rules: DEFAULT_RULES,
    categories: [1, 2, 3].map((n) => ({ id: `c${n}`, title: `К${n}`, cells: [1, 2, 3].map((m) => ({ mark: 'none',
      question: n === 1 && m === 1 ? q : { ...single, id: `q${n}${m}` } })) })),
  });
  it('bluff: classic only; not blitz, final or any board cell', () => {
    expect(issues(quizOf([round('r', [bluffQ])]))).toEqual([]);
    expect(issues(quizOf([blitz(bluffQ)]))).toContain('bluff_place');
    expect(issues(quizOf([finalR(bluffQ)]))).toContain('bluff_place');
    expect(issues(quizOf([board(bluffQ)]))).toContain('bluff_place');
  });
  it('spares cannot be bluffs', () => {
    const base = quizOf([round('r', [single])]);
    expect(issues({ ...base, spares: [{ ...bluffQ, id: 'b9' }] })).toContain('spare_type');
  });
});

describe('wipeout round (10g)', () => {
  const ladder = [100, 200, 300, 400, 500].map((points, i) => ({ ...single, id: `w${i + 1}`, points }));
  const wipeout = { id: 'rw', type: 'wipeout', title: '', shuffleOptions: false, questions: ladder } as const;
  const issues = (value: unknown) => {
    const result = quizSchema.safeParse(value);
    return result.success ? [] : result.error.issues.map((i) => i.message);
  };
  const quizOf = (questions: object[]) => ({ title: 'T', description: '', settings: DEFAULT_SETTINGS, rounds: [{ ...wipeout, questions }] });
  it('a wipeout round has 5–15 questions of simple types and no rules', () => {
    expect(ROUND_TYPES).toContain('wipeout');
    expect(valid(roundSchema, wipeout)).toBe(true);
    expect(valid(roundSchema, { ...wipeout, questions: ladder.slice(0, 4) })).toBe(false);
    expect(valid(roundSchema, { ...wipeout, questions: Array.from({ length: 16 }, (_, i) => ({ ...single, id: `x${i}` })) })).toBe(false);
    expect(rulesOf(roundSchema.parse(wipeout))).toEqual(DEFAULT_RULES);
    expect(WIPEOUT_TYPES).toEqual(['single', 'boolean', 'numeric', 'text', 'slider']);
    expect(LIMITS.wipeoutDecideSeconds).toBe(10);
  });
  it('refuses other question types in a wipeout round', () => {
    const multi = { ...single, id: 'm1', type: 'multi', correctIds: ['b'], correctId: undefined };
    const poll = { id: 'p1', type: 'poll', text: 'Що?', imageUrl: null, video: null, timeLimit: 20, points: 0,
      options: [{ id: 'a', text: 'А' }, { id: 'b', text: 'Б' }] };
    const bluff = { id: 'b1', type: 'bluff', text: 'Факт з …', imageUrl: null, video: null, timeLimit: 60, choiceTime: 30, points: 1000,
      accepted: ['Барселона'], lies: ['Мадрид', 'Лондон'] };
    for (const odd of [multi, poll, bluff]) expect(issues(quizOf([...ladder.slice(0, 4), odd]))).toContain('wipeout_type');
    expect(issues(quizOf(ladder))).toEqual([]);
  });
});

describe('survival round (10h)', () => {
  const boolQ = { id: 'b1', type: 'boolean', text: 'Говерла найвища гора України', imageUrl: null, video: null, timeLimit: 20, points: 100, correct: true };
  const qs = [1, 2, 3].map((i) => ({ ...single, id: `s${i}`, points: 100 }));
  const trials = [{ ...boolQ, id: 't1' }];
  const survival = { id: 'rs', type: 'survival', title: '', speedBonus: false, shuffleOptions: false, rules: DEFAULT_RULES,
    questions: qs, trials, trial: 'question', survivors: 1, bonus: 500 } as const;
  const issues = (value: unknown) => {
    const result = quizSchema.safeParse(value);
    return result.success ? [] : result.error.issues.map((i) => i.message);
  };
  const quizOf = (patch: object) => ({ title: 'T', description: '', settings: DEFAULT_SETTINGS, rounds: [{ ...survival, ...patch }] });
  it('a survival round has 3–30 simple questions, trials, an end condition and a bonus', () => {
    expect(ROUND_TYPES).toContain('survival');
    expect(valid(roundSchema, survival)).toBe(true);
    expect(valid(roundSchema, { ...survival, questions: qs.slice(0, 2) })).toBe(false);
    expect(valid(roundSchema, { ...survival, survivors: 0 })).toBe(false);
    expect(valid(roundSchema, { ...survival, survivors: 11 })).toBe(false);
    expect(valid(roundSchema, { ...survival, bonus: 2001 })).toBe(false);
    expect(valid(roundSchema, { ...survival, trial: 'luck', trials: [] })).toBe(true);
    expect(SURVIVAL_TYPES).toEqual(['single', 'boolean', 'numeric', 'text', 'slider']);
    expect(rulesOf(roundSchema.parse(survival))).toEqual(DEFAULT_RULES);
    expect(LIMITS.survivalLuckSeconds).toBe(10);
    expect(roundQuestions(roundSchema.parse(survival))).toHaveLength(3);
    expect(roundTrials(roundSchema.parse(survival))).toHaveLength(1);
    expect(roundTrials(roundSchema.parse(round('r', [single])))).toEqual([]);
  });
  it('refuses other types, a question trial without trials and trials with media', () => {
    const multi = { ...single, id: 'm1', type: 'multi', correctIds: ['b'], correctId: undefined };
    const order = { id: 'o1', type: 'order', text: 'Порядок', imageUrl: null, video: null, timeLimit: 20, points: 100,
      items: [{ id: 'a', text: 'А' }, { id: 'b', text: 'Б' }] };
    expect(issues(quizOf({ questions: [...qs.slice(0, 2), multi] }))).toContain('survival_type');
    expect(issues(quizOf({ trials: [order] }))).toContain('survival_type');
    expect(issues(quizOf({ trials: [] }))).toContain('survival_trials');
    expect(issues(quizOf({ trial: 'luck', trials: [] }))).toEqual([]);
    expect(issues(quizOf({}))).toEqual([]);
    const video = { id: 'dQw4w9WgXcQ', start: 0 };
    const audio = { source: 'youtube', id: 'dQw4w9WgXcQ', start: 0, duration: 15 };
    for (const patch of [{ video }, { audio }, { reveal: 'blur', imageUrl: '/uploads/abcdefabcdefabcdef.png' }]) {
      expect(issues(quizOf({ trials: [{ ...boolQ, id: 't1', ...patch }] }))).toContain('survival_trial_media');
    }
  });
  it('trials count toward the quiz limit and must not reuse question ids', () => {
    expect(issues(quizOf({ trials: [{ ...boolQ, id: 's1' }] }))).toContain('duplicate_question_ids');
    expect(issues({ ...quizOf({}), spares: [{ ...single, id: 't1' }] })).toContain('duplicate_spare_ids');
    const filler = (n: number) => [
      round('r1', Array.from({ length: Math.min(n, 100) }, (_, i) => ({ ...single, id: `f${i}` }))),
      ...(n > 100 ? [round('r2', Array.from({ length: n - 100 }, (_, i) => ({ ...single, id: `g${i}` })))] : []),
    ];
    const full = { ...quizOf({}), rounds: [...filler(LIMITS.maxQuizQuestions - 3), survival] };
    expect(issues(full)).toContain('too_many_questions');
    const fits = { ...quizOf({}), rounds: [...filler(LIMITS.maxQuizQuestions - 4), survival] };
    expect(issues(fits)).toEqual([]);
  });
});

describe('ladder round (10i)', () => {
  const four = (id: string) => ({ ...single, id, options: ['a', 'b', 'c', 'd'].map((o) => ({ id: o, text: o.toUpperCase() })), correctId: 'b' });
  const qs = [1, 2, 3, 4, 5].map((i) => four(`l${i}`));
  const ladder = { id: 'rl', type: 'ladder', title: '', shuffleOptions: false, questions: qs,
    levels: [100, 300, 1000, 3000, 10000], safe: [2], pick: 'host', lifelines: ['fifty', 'audience', 'hint'], timer: false } as const;
  const issues = (patch: object) => {
    const result = quizSchema.safeParse({ title: 'T', description: '', settings: DEFAULT_SETTINGS, rounds: [{ ...ladder, ...patch }] });
    return result.success ? [] : result.error.issues.map((i) => i.message);
  };
  it('a ladder round has 5–15 four-option questions, rising levels up to 10 000, safe steps, a pick mode, lifelines and a timer flag', () => {
    expect(ROUND_TYPES).toContain('ladder');
    expect(valid(roundSchema, ladder)).toBe(true);
    expect(valid(roundSchema, { ...ladder, questions: qs.slice(0, 4), levels: [100, 300, 1000, 3000] })).toBe(false);
    expect(valid(roundSchema, { ...ladder, levels: [100, 300, 1000, 3000, 10001] })).toBe(false);
    expect(valid(roundSchema, { ...ladder, pick: 'oldest' })).toBe(false);
    expect(valid(roundSchema, { ...ladder, lifelines: ['double'] })).toBe(false);
    expect(rulesOf(roundSchema.parse(ladder))).toEqual(DEFAULT_RULES);
    expect(issues({})).toEqual([]);
  });
  it('refuses other types, other option counts, broken levels, safe steps and repeated lifelines', () => {
    const multi = { ...single, id: 'm1', type: 'multi', correctIds: ['b'], correctId: undefined };
    const bool = { id: 'b1', type: 'boolean', text: 'Говерла найвища гора України', imageUrl: null, video: null, timeLimit: 20, points: 0, correct: true };
    expect(issues({ questions: [...qs.slice(0, 4), multi] })).toContain('ladder_type');
    expect(issues({ questions: [...qs.slice(0, 4), bool] })).toContain('ladder_type');
    expect(issues({ questions: [...qs.slice(0, 4), { ...single, id: 'three' }] })).toContain('ladder_type');
    expect(issues({ levels: [100, 300, 300, 3000, 10000] })).toContain('ladder_levels');
    expect(issues({ levels: [100, 300, 1000, 3000, 5000, 10000] })).toContain('ladder_levels');
    expect(issues({ safe: [4] })).toContain('ladder_safe');
    expect(issues({ safe: [1, 1] })).toContain('ladder_safe');
    expect(issues({ lifelines: ['fifty', 'fifty'] })).toContain('ladder_lifelines');
  });
});

describe('type lists', () => {
  it('ROUND_TYPES and QUESTION_TYPES list every schema discriminator in editor order', () => {
    expect(roundSchema.options.map((o) => o.shape.type.value)).toEqual([...ROUND_TYPES]);
    expect(questionSchema.options.map((o) => o.shape.type.value)).toEqual([...QUESTION_TYPES]);
  });
});

describe('review fixes (10d)', () => {
  const tiles = (prefix: string, ...texts: string[]) => texts.map((text, i) => ({ id: `${prefix}${i + 1}`, text }));
  const wall = (texts: string[][]) => ({ id: 'w1', type: 'wall', text: 'Стіна', imageUrl: null, video: null, timeLimit: 90, points: 1000, mistakes: 3,
    groups: texts.map((row, g) => ({ id: `g${g}`, name: `Група ${g}`, tiles: tiles(`t${g}`, ...row) })) });
  const issuesOf = (q: object) => {
    const result = questionSchema.safeParse(q);
    return result.success ? [] : result.error.issues.map((i) => i.message);
  };

  it('wall duplicate tiles compare case-insensitively across groups, with collapsed spaces', () => {
    const base = [['Дніпро', 'Десна', 'Рось', 'Псел'], ['Київ', 'Львів', 'Харків', 'Одеса'], ['Говерла', 'Петрос', 'Піп Іван', 'Бребенескул'], ['Світязь', 'Синевир', 'Несамовите', 'Пісочне']];
    expect(issuesOf(wall(base))).toEqual([]);
    const cross = base.map((row) => [...row]);
    cross[1]![0] = 'ДНІПРО';
    expect(issuesOf(wall(cross))).toContain('wall_duplicate_tiles');
    const spaced = base.map((row) => [...row]);
    spaced[3]![0] = 'піп   іван';
    expect(issuesOf(wall(spaced))).toContain('wall_duplicate_tiles');
  });

  it('duel thresholds do not count polls and clouds', () => {
    const q = (id: string, type: string) => (type === 'single'
      ? { id, type, text: 'Т', imageUrl: null, video: null, timeLimit: 20, points: 1000, options: [{ id: 'a', text: 'a' }, { id: 'b', text: 'b' }], correctId: 'a' }
      : { id, type, text: 'Т', imageUrl: null, video: null, timeLimit: 20, points: 0, options: [{ id: 'a', text: 'a' }, { id: 'b', text: 'b' }] });
    const duels = { categories: [{ id: 'c', title: 'К', questions: [{ id: 'd', text: 'Т?', accepted: ['так'] }] }], questionsPerDuel: 1, timeLimit: 30, stake: 0 };
    const quiz = quizSchema.parse({
      title: 'T', description: '', settings: DEFAULT_SETTINGS, duels,
      rounds: [round('r1', [q('a', 'single'), q('b', 'single'), q('c', 'single'), q('d', 'poll'), q('e', 'poll'), q('f', 'poll')]), round('r2', [q('g', 'single')])],
    });
    expect(duelThreshold(quiz)).toBe(2);
    expect(duelShortfall(quiz)).toBeNull();
    const onlyPolls = quizSchema.parse({ title: 'T', description: '', settings: DEFAULT_SETTINGS, duels, rounds: [round('r1', [q('d', 'poll')]), round('r2', [q('e', 'poll')])] });
    expect(duelThreshold(onlyPolls)).toBeNull();
    expect(duelShortfall(onlyPolls)).toBe(1);
  });

  it('cloudHideSchema refuses keys with control characters', () => {
    expect(valid(cloudHideSchema, { key: 'київ', hidden: true })).toBe(true);
    expect(valid(cloudHideSchema, { key: 'ки\u0000їв', hidden: true })).toBe(false);
  });
});

describe('team settings (10j)', () => {
  const base = { title: 'Т', description: '', settings: DEFAULT_SETTINGS, rounds: [round('r1', [single])] };
  const withTeams = (teams: unknown) => ({ ...base, settings: { leaderboard: 'each', teams } });
  const issues = (value: unknown) => {
    const result = quizSchema.safeParse(value);
    return result.success ? [] : result.error.issues.map((i) => i.message);
  };

  it('an optional teams block with 2–6 teams and as many names', () => {
    expect(valid(quizSchema, withTeams({ count: 2, names: ['Червоні', 'Сині'] }))).toBe(true);
    expect(valid(quizSchema, base)).toBe(true);
    expect(valid(quizSchema, withTeams({ count: 1, names: ['А'] }))).toBe(false);
    expect(valid(quizSchema, withTeams({ count: 7, names: [...'абвгдеє'] }))).toBe(false);
    expect(valid(quizSchema, withTeams({ count: 2, names: ['А', ' '] }))).toBe(false);
    expect(valid(quizSchema, withTeams({ count: 2, names: ['А', 'Б'.repeat(21)] }))).toBe(false);
  });
  it('refuses a name count that differs from the team count and repeated names', () => {
    expect(issues(withTeams({ count: 3, names: ['А', 'Б'] }))).toContain('team_names');
    expect(issues(withTeams({ count: 2, names: ['Сині', ' сині '] }))).toContain('team_names');
  });
  it('an optional answerer mode (12g): a known mode passes, an unknown one fails, no field leaves no key', () => {
    expect(valid(quizSchema, withTeams({ count: 2, names: ['Червоні', 'Сині'], answerer: 'chosen' }))).toBe(true);
    expect(valid(quizSchema, withTeams({ count: 2, names: ['Червоні', 'Сині'], answerer: 'host' }))).toBe(false);
    const parsed = quizSchema.safeParse(withTeams({ count: 2, names: ['Червоні', 'Сині'] }));
    expect(parsed.success && 'answerer' in (parsed.data.settings.teams ?? {})).toBe(false);
    expect(pickAnswererSchema.safeParse({ memberId: null, scope: 'round' }).success).toBe(true);
    expect(pickAnswererSchema.safeParse({ memberId: 'x', scope: 'game' }).success).toBe(false);
    expect(pickAnswererSchema.safeParse({ memberId: '', scope: 'question' }).success).toBe(false);
    expect(pickAnswererSchema.safeParse({ memberId: 'x'.repeat(64), scope: 'question' }).success).toBe(true);
    expect(pickAnswererSchema.safeParse({ memberId: 'x'.repeat(65), scope: 'question' }).success).toBe(false);
  });
});

describe('question ids (17a)', () => {
  const single = (id: string) => ({
    id, type: 'single', text: 'Т', imageUrl: null, video: null, timeLimit: 20, points: 1000,
    options: [{ id: 'a', text: 'a' }, { id: 'b', text: 'b' }], correctId: 'a',
  });
  const quizOf = (rounds: object[], spares?: object[]) =>
    ({ title: 'T', description: '', settings: DEFAULT_SETTINGS, rounds, ...(spares ? { spares } : {}) }) as unknown as Quiz;
  const classic = (id: string, questions: object[]) => ({ id, type: 'classic', title: '', speedBonus: true, shuffleOptions: false, rules: DEFAULT_RULES, questions });
  const board = (id: string, cells: object[], spares?: object[]) => ({
    id, type: 'board', title: '', shuffleOptions: false, answerMode: 'phone', check: 'auto', rules: DEFAULT_RULES,
    categories: [{ id: 'cat', title: 'К', cells: cells.map((question) => ({ question })), ...(spares ? { spares } : {}) }],
  });
  const survival = (id: string, questions: object[], trials: object[]) => ({
    id, type: 'survival', title: '', shuffleOptions: false, rules: DEFAULT_RULES, trial: 'question', questions, trials,
  });

  it('questionIdsOf lists questions, cells and all spares, without survival trials', () => {
    const quiz = quizOf(
      [classic('r1', [single('q1'), single('q2')]), board('r2', [single('c1')], [single('cs1')]), survival('r3', [single('p1')], [single('t1')])],
      [single('s1')],
    );
    expect(questionIdsOf(quiz)).toEqual(new Set(['q1', 'q2', 'c1', 'p1', 's1', 'cs1']));
  });

  it('withUniqueQuestionIds renames the second and later repeats only', () => {
    let n = 0;
    const quiz = quizOf(
      [classic('r1', [single('q1')]), classic('r2', [single('q1')]), board('r3', [single('q1')], [single('q1')]), survival('r4', [single('x')], [single('q1')])],
      [single('q1')],
    );
    const fixed = withUniqueQuestionIds(quiz, () => `fresh-${++n}`);
    const ids = [...(fixed.rounds[0] as { questions: { id: string }[] }).questions, ...(fixed.rounds[1] as { questions: { id: string }[] }).questions].map((q) => q.id);
    expect(ids).toEqual(['q1', 'fresh-1']);
    const all = [
      ...fixed.rounds.flatMap(roundQuestions),
      ...fixed.rounds.flatMap((r) => (r.type === 'survival' ? r.trials : [])),
      ...allSpares(fixed),
    ].map((q) => q.id);
    expect(new Set(all).size).toBe(all.length);
    expect(n).toBe(5);
    const renamed = (fixed.rounds[1] as { questions: { id: string; options: unknown; correctId: string }[] }).questions[0]!;
    expect(renamed.options).toEqual([{ id: 'a', text: 'a' }, { id: 'b', text: 'b' }]);
    expect(renamed.correctId).toBe('a');
  });

  it('withUniqueQuestionIds leaves a truth round as it is and still renames repeats around it (28b)', () => {
    let n = 0;
    const truth = { id: 'r2', type: 'truth', title: '', points: 300, timeLimit: 30 };
    const quiz = quizOf([classic('r1', [single('q1')]), truth, classic('r3', [single('q1')])]);
    const fixed = withUniqueQuestionIds(quiz, () => `fresh-${++n}`);
    expect(fixed.rounds[1]).toBe(quiz.rounds[1]);
    expect((fixed.rounds[2] as { questions: { id: string }[] }).questions.map((q) => q.id)).toEqual(['fresh-1']);
    const lone = quizOf([truth, classic('r3', [single('q1')])]);
    expect(withUniqueQuestionIds(lone, () => 'never')).toBe(lone);
  });

  it('withUniqueQuestionIds returns the same quiz when nothing repeats', () => {
    const quiz = quizOf([classic('r1', [single('q1'), single('q2')])], [single('s1')]);
    expect(withUniqueQuestionIds(quiz, () => 'never')).toBe(quiz);
  });
});

describe('bets round (27a)', () => {
  const quizOf = (rounds: object[], patch: object = {}) => ({ title: 'T', description: '', settings: DEFAULT_SETTINGS, rounds, ...patch });
  const issues = (value: unknown) => {
    const result = quizSchema.safeParse(value);
    return result.success ? [] : result.error.issues.map((i) => i.message);
  };
  const withCut = (q: object, betsCut = 2) => ({ ...q, betsCut });
  const bool = { ...single, id: 'qb', type: 'boolean', correct: true };
  delete (bool as { options?: unknown }).options;
  delete (bool as { correctId?: unknown }).correctId;
  const numeric = { ...single, id: 'qn', type: 'numeric', correct: 5, tolerance: 0 };
  delete (numeric as { options?: unknown }).options;
  delete (numeric as { correctId?: unknown }).correctId;
  const betsRound = (questions: object[], patch: object = {}) => ({
    id: 'b', type: 'bets', title: '', shuffleOptions: false, check: 'auto', betStart: 200, betStep: 100, betMax: 600,
    questions: questions.map((q) => withCut(q)), ...patch,
  });
  const three = [{ ...single, id: 'q1' }, bool, numeric];

  it('accepts a bets round', () => {
    expect(issues(quizOf([betsRound(three)]))).toEqual([]);
  });

  it('refuses a last minimum over the maximum', () => {
    expect(issues(quizOf([betsRound(three, { betMax: 300 })]))).toContain('bets_max');
    expect(issues(quizOf([betsRound(three, { betMax: null })]))).toEqual([]);
  });

  it('a bets question needs a cut and only there', () => {
    expect(issues(quizOf([betsRound(three, { questions: three })]))).toContain('bets_cut_missing');
    const cut = withCut({ ...single, id: 'c1' });
    expect(issues(quizOf([round('r', [cut])]))).toContain('bets_cut_place');
    const cell = (q: object, id: string) => ({ id, title: id, cells: [1, 2, 3].map((n) => ({ mark: 'none', question: n === 1 ? q : { ...single, id: `${id}${n}` } })) });
    const board = { id: 'bd', type: 'board', title: '', shuffleOptions: false, answerMode: 'phone', check: 'auto', rules: DEFAULT_RULES,
      categories: [cell(cut, 'a'), cell({ ...single, id: 'b1' }, 'b'), cell({ ...single, id: 'c1x' }, 'c')] };
    expect(issues(quizOf([board]))).toContain('bets_cut_place');
    expect(issues(quizOf([round('r', [single])], { spares: [withCut({ ...single, id: 'sp' })] }))).toContain('bets_cut_place');
    // «Вибування»: зріз не дозволено ні в запитаннях, ні у випробуваннях.
    const survival = (questions: object[], trials: object[]) => ({ id: 'rs', type: 'survival', title: '', speedBonus: false, shuffleOptions: false, rules: DEFAULT_RULES,
      questions, trials, trial: 'question', survivors: 1, bonus: 500 });
    const plain = [1, 2, 3].map((i) => ({ ...single, id: `s${i}` }));
    expect(issues(quizOf([survival(plain, [{ ...bool, id: 't1' }])]))).toEqual([]);
    expect(issues(quizOf([survival(plain, [withCut({ ...bool, id: 't1' })])]))).toContain('bets_cut_place');
    expect(issues(quizOf([survival([withCut(plain[0]!), ...plain.slice(1)], [{ ...bool, id: 't1' }])]))).toContain('bets_cut_place');
  });

  it('roundBrief(bets) carries the start, step, maximum and count; emptyBrief has no bets', () => {
    expect(emptyBrief('bets').bets).toBeNull();
    expect(emptyBrief('final').bets).toBeNull();
    const parsed = quizSchema.parse(quizOf([betsRound(three, { betStep: 0, betMax: null })]));
    expect(roundBrief(parsed.rounds[0]!)).toEqual({ ...emptyBrief('bets'), bets: { betStart: 200, betStep: 0, betMax: null, count: 3 } });
    const capped = quizSchema.parse(quizOf([betsRound(three)]));
    expect(roundBrief(capped.rounds[0]!).bets).toEqual({ betStart: 200, betStep: 100, betMax: 600, count: 3 });
  });

  it('bets takes the final question types', () => {
    const base = { imageUrl: null, video: null, timeLimit: 30, points: 1000 };
    const tiles = (p: string) => ['а', 'б', 'в', 'г'].map((text, i) => ({ id: `${p}${i}`, text }));
    const row = (id: string, text: string, popularity: number) => ({ id, text, popularity, accepted: [] });
    const rejected: [object, string][] = [
      [{ ...base, id: 'x1', type: 'clues', text: 'Хто я?', clues: ['а', 'б', 'в'], accepted: ['Х'], interval: 5 }, 'clues_place'],
      [{ ...base, id: 'x2', type: 'pin', text: 'Де?', map: 'world', aspect: 2, target: { x: 0.5, y: 0.5 }, fullRadius: 3, zeroRadius: 15 }, 'pin_place'],
      [{ ...base, id: 'x3', type: 'wall', text: 'Стіна', mistakes: 3, groups: ['a', 'b', 'c', 'd'].map((g) => ({ id: g, name: g, tiles: tiles(g) })) }, 'wall_place'],
      [{ ...base, id: 'x4', type: 'survey', text: 'Фрукт', answers: 3, rows: [row('a', 'Яблуко', 32), row('b', 'Банан', 25), row('c', 'Груша', 15), row('d', 'Кавун', 10)] }, 'survey_place'],
      [{ ...base, id: 'x5', type: 'bluff', text: 'Факт з …', choiceTime: 30, timeLimit: 60, accepted: ['Барселона'], lies: ['Мадрид', 'Лондон', 'Брюссель'] }, 'bluff_place'],
      [{ ...base, id: 'x6', type: 'poll', text: 'Пора року?', points: 0, options: [{ id: 'a', text: 'Весна' }, { id: 'b', text: 'Літо' }] }, 'vote_place'],
      [{ ...base, id: 'x7', type: 'wordcloud', text: 'Київ?', points: 0, words: 3 }, 'vote_place'],
    ];
    for (const [q, message] of rejected) expect(issues(quizOf([betsRound([q])]))).toContain(message);
    const chain = { ...base, id: 'c1', type: 'chain', text: 'Ланцюжок', timeLimit: 60, words: ['Форель', 'Риба', 'Океан'], hintSeconds: 5 };
    const ladder = { ...base, id: 'wl', type: 'wordladder', text: 'Від ПОЛЕ до ТАРА', timeLimit: 90, path: ['ПОЛЕ', 'ПОЛА', 'ПОРА', 'ПАРА', 'ТАРА'], maxSteps: 8 };
    expect(issues(quizOf([betsRound([chain, ladder], { betMax: null })]))).toEqual([]);
  });

  it('old quizzes still parse', () => {
    const parsed = quizSchema.safeParse(quizOf([round('r', [single])]));
    expect(parsed.success).toBe(true);
    expect(JSON.stringify(parsed.data)).not.toContain('betsCut');
  });

  it('rulesOf(bets) is the default rules, and the type is listed after final', () => {
    const parsed = quizSchema.parse(quizOf([betsRound(three)]));
    expect(rulesOf(parsed.rounds[0]!)).toBe(DEFAULT_RULES);
    expect(ROUND_TYPES.indexOf('bets')).toBe(ROUND_TYPES.indexOf('final') + 1);
    expect(roundQuestions(parsed.rounds[0]!)).toHaveLength(3);
  });
});

describe('auction round (27b)', () => {
  const quizOf = (rounds: object[]) => ({ title: 'T', description: '', settings: DEFAULT_SETTINGS, rounds });
  const issues = (value: unknown) => {
    const result = quizSchema.safeParse(value);
    return result.success ? [] : result.error.issues.map((i) => i.message);
  };
  const strip = (q: object) => {
    const copy = { ...q } as { options?: unknown; correctId?: unknown };
    delete copy.options;
    delete copy.correctId;
    return copy;
  };
  const bool = { ...strip(single), id: 'qb', type: 'boolean', correct: true };
  const numeric = { ...strip(single), id: 'qn', type: 'numeric', correct: 5, tolerance: 0 };
  const cut = (q: object) => ({ ...q, betsCut: 2 });
  const auctionRound = (questions: object[], patch: object = {}) => ({
    id: 'au', type: 'auction', title: '', shuffleOptions: false, check: 'auto', bidMode: 'step', bidStep: 50, loss: 'bid',
    questions: questions.map(cut), ...patch,
  });
  const three = [{ ...single, id: 'q1' }, bool, numeric];

  it('accepts an auction round', () => {
    expect(issues(quizOf([auctionRound(three)]))).toEqual([]);
    for (const bidMode of ['step', 'free']) for (const loss of ['bid', 'bid_price']) expect(issues(quizOf([auctionRound(three, { bidMode, loss })]))).toEqual([]);
  });

  it('an auction question needs a cut', () => {
    expect(issues(quizOf([auctionRound(three, { questions: three })]))).toContain('bets_cut_missing');
    expect(issues(quizOf([round('r', [cut({ ...single, id: 'c1' })])]))).toContain('bets_cut_place');
  });

  it('auction takes the final question types', () => {
    const base = { imageUrl: null, video: null, timeLimit: 30, points: 1000 };
    const tiles = (p: string) => ['а', 'б', 'в', 'г'].map((text, i) => ({ id: `${p}${i}`, text }));
    const row = (id: string, text: string, popularity: number) => ({ id, text, popularity, accepted: [] });
    const rejected: [object, string][] = [
      [{ ...base, id: 'x1', type: 'clues', text: 'Хто я?', clues: ['а', 'б', 'в'], accepted: ['Х'], interval: 5 }, 'clues_place'],
      [{ ...base, id: 'x2', type: 'pin', text: 'Де?', map: 'world', aspect: 2, target: { x: 0.5, y: 0.5 }, fullRadius: 3, zeroRadius: 15 }, 'pin_place'],
      [{ ...base, id: 'x3', type: 'wall', text: 'Стіна', mistakes: 3, groups: ['a', 'b', 'c', 'd'].map((g) => ({ id: g, name: g, tiles: tiles(g) })) }, 'wall_place'],
      [{ ...base, id: 'x4', type: 'survey', text: 'Фрукт', answers: 3, rows: [row('a', 'Яблуко', 32), row('b', 'Банан', 25), row('c', 'Груша', 15), row('d', 'Кавун', 10)] }, 'survey_place'],
      [{ ...base, id: 'x5', type: 'bluff', text: 'Факт з …', choiceTime: 30, timeLimit: 60, accepted: ['Барселона'], lies: ['Мадрид', 'Лондон', 'Брюссель'] }, 'bluff_place'],
      [{ ...base, id: 'x6', type: 'poll', text: 'Пора року?', points: 0, options: [{ id: 'a', text: 'Весна' }, { id: 'b', text: 'Літо' }] }, 'vote_place'],
      [{ ...base, id: 'x7', type: 'wordcloud', text: 'Київ?', points: 0, words: 3 }, 'vote_place'],
    ];
    for (const [q, message] of rejected) expect(issues(quizOf([auctionRound([q])]))).toContain(message);
    const chain = { ...base, id: 'c1', type: 'chain', text: 'Ланцюжок', timeLimit: 60, words: ['Форель', 'Риба', 'Океан'], hintSeconds: 5 };
    const ladder = { ...base, id: 'wl', type: 'wordladder', text: 'Від ПОЛЕ до ТАРА', timeLimit: 90, path: ['ПОЛЕ', 'ПОЛА', 'ПОРА', 'ПАРА', 'ТАРА'], maxSteps: 8 };
    expect(issues(quizOf([auctionRound([chain, ladder])]))).toEqual([]);
  });

  it('refuses a zero or fractional step', () => {
    expect(issues(quizOf([auctionRound(three, { bidStep: 0 })]))).not.toEqual([]);
    expect(issues(quizOf([auctionRound(three, { bidStep: 2.5 })]))).not.toEqual([]);
  });

  it('old quizzes still parse; rulesOf(auction) is the default rules and the type follows bets', () => {
    expect(quizSchema.safeParse(quizOf([round('r', [single])])).success).toBe(true);
    const parsed = quizSchema.parse(quizOf([auctionRound(three)]));
    expect(rulesOf(parsed.rounds[0]!)).toBe(DEFAULT_RULES);
    expect(ROUND_TYPES.indexOf('auction')).toBe(ROUND_TYPES.indexOf('bets') + 1);
    expect(roundQuestions(parsed.rounds[0]!)).toHaveLength(3);
  });

  it('roundBrief(auction) carries the mode, step, loss and count; others have none', () => {
    expect(emptyBrief('auction').auction).toBeNull();
    const parsed = quizSchema.parse(quizOf([auctionRound(three), round('r', [{ ...single, id: 'other' }])]));
    expect(roundBrief(parsed.rounds[0]!)).toEqual({ ...emptyBrief('auction'), auction: { mode: 'step', step: 50, loss: 'bid', count: 3 } });
    expect(roundBrief(parsed.rounds[1]!).auction).toBeNull();
  });
});

describe('truth round (28b)', () => {
  const quizOf = (rounds: object[]) => ({ title: 'T', description: '', settings: DEFAULT_SETTINGS, rounds });
  const issues = (value: unknown) => {
    const result = quizSchema.safeParse(value);
    return result.success ? [] : result.error.issues.map((i) => i.message);
  };
  const truthRound = (patch: object = {}, id = 'tr') => ({ id, type: 'truth', title: '', points: 300, timeLimit: 30, ...patch });

  it('accepts a truth round', () => {
    expect(issues(quizOf([truthRound()]))).toEqual([]);
    expect(issues(quizOf([round('r', [single]), truthRound({ description: 'Хто є хто' })]))).toEqual([]);
  });

  it('refuses a second truth round', () => {
    expect(issues(quizOf([truthRound({}, 'a'), truthRound({}, 'b')]))).toContain('truth_once');
  });

  it('refuses broken price or timer', () => {
    for (const patch of [{ points: -1 }, { timeLimit: 4 }, { timeLimit: 2.5 }, { points: 2.5 }]) {
      expect(issues(quizOf([truthRound(patch)]))).not.toEqual([]);
    }
  });

  it('a truth round has no questions and plays by the default rules', () => {
    const parsed = quizSchema.parse(quizOf([truthRound()]));
    expect(roundQuestions(parsed.rounds[0]!)).toEqual([]);
    expect(rulesOf(parsed.rounds[0]!)).toBe(DEFAULT_RULES);
    expect(ROUND_TYPES.indexOf('truth')).toBe(ROUND_TYPES.indexOf('auction') + 1);
  });

  it('old quizzes still parse', () => {
    expect(quizSchema.safeParse(quizOf([round('r', [single])])).success).toBe(true);
  });

  it('roundBrief(truth) carries the price and the timer; others have none', () => {
    expect(emptyBrief('truth').truth).toBeNull();
    const parsed = quizSchema.parse(quizOf([truthRound(), round('r', [{ ...single, id: 'other' }])]));
    expect(roundBrief(parsed.rounds[0]!)).toEqual({ ...emptyBrief('truth'), truth: { points: 300, time: 30 } });
    expect(roundBrief(parsed.rounds[1]!).truth).toBeNull();
  });
});

describe('timed list question (27c)', () => {
  const item = (id: string, text: string, accepted: string[] = []) => ({ id, text, accepted });
  const listQ = (patch: object = {}) => ({ id: 'tl', type: 'timedlist', text: 'Назвіть планети Сонячної системи', imageUrl: null, video: null,
    timeLimit: 90, points: 100, minus: 50,
    items: [item('i1', 'Меркурій'), item('i2', 'Венера'), item('i3', 'Земля'), item('i4', 'Марс', ['Червона планета']), item('i5', 'Юпітер')], ...patch });
  const quizOf = (rounds: object[]) => ({ title: 'T', description: '', settings: DEFAULT_SETTINGS, rounds });
  const issues = (value: unknown) => {
    const parsed = quizSchema.safeParse(value);
    return parsed.success ? [] : parsed.error.issues.map((i) => i.message);
  };
  const qIssues = (value: unknown) => {
    const parsed = questionSchema.safeParse(value);
    return parsed.success ? [] : parsed.error.issues.map((i) => i.message);
  };
  const board = (q: object, patch: object = {}) => ({
    id: 'b', type: 'board', title: '', shuffleOptions: false, answerMode: 'phone', check: 'auto', rules: DEFAULT_RULES, ...patch,
    categories: [1, 2, 3].map((n) => ({ id: `c${n}`, title: `К${n}`, cells: [1, 2, 3].map((m) => ({ mark: 'none',
      question: n === 1 && m === 1 ? q : { ...single, id: `q${n}${m}` } })) })),
  });
  const withCell = (q: object, cellPatch: object) => {
    const b = board(q);
    Object.assign(b.categories[0]!.cells[0]!, cellPatch);
    return quizOf([b]);
  };

  it('accepts a timed list with spellings and an optional minus', () => {
    expect(QUESTION_TYPES.indexOf('timedlist')).toBe(QUESTION_TYPES.indexOf('survey') + 1);
    expect(qIssues(listQ())).toEqual([]);
    expect(qIssues(listQ({ minus: null }))).toEqual([]);
    expect(issues(quizOf([round('r', [listQ()])]))).toEqual([]);
  });

  it('refuses duplicate spellings across items, a video, too few items and too many points', () => {
    const dup = listQ({ items: [item('i1', 'Меркурій'), item('i2', 'Венера'), item('i3', 'Земля'), item('i4', 'Марс'), item('i5', 'Юпітер', ['марс'])] });
    expect(qIssues(dup)).toContain('timedlist_duplicate');
    const same = listQ({ items: [item('i1', 'Меркурій'), item('i2', 'Венера'), item('i3', 'Марс', ['марс'])] });
    expect(qIssues(same)).toEqual([]);
    expect(qIssues(listQ({ video: { id: 'dQw4w9WgXcQ', start: 0 } }))).toContain('timedlist_video');
    expect(valid(questionSchema, listQ({ items: [item('i1', 'Меркурій'), item('i2', 'Венера')] }))).toBe(false);
    const many = Array.from({ length: 30 }, (_, i) => item(`n${i}`, `Пункт ${i}`));
    expect(qIssues(listQ({ items: many }))).toContain('timedlist_points');
    expect(qIssues(listQ({ items: many, points: 30 }))).toEqual([]);
    expect(valid(questionSchema, listQ({ minus: 0 }))).toBe(false);
    expect(qIssues(listQ({ items: [item('i1', 'Меркурій'), item('i1', 'Венера'), item('i3', 'Земля')] }))).toContain('duplicate_ids');
  });

  it('a timed list plays in classic rounds and normal phone cells only', () => {
    const blitzRound = { id: 'bl', type: 'blitz', title: '', shuffleOptions: false, answerWindow: 15, attempts: 1, check: 'auto',
      rules: { ...DEFAULT_RULES, partial: null }, questions: [listQ({ id: 'lb' })] };
    const final = { id: 'f', type: 'final', title: '', shuffleOptions: false, check: 'auto', questions: [listQ({ id: 'lf' })] };
    const bets = { id: 'bt', type: 'bets', title: '', shuffleOptions: false, check: 'auto', betStart: 200, betStep: 100, betMax: 600,
      questions: [{ ...listQ({ id: 'lbt' }), betsCut: 2 }] };
    const auction = { id: 'au', type: 'auction', title: '', shuffleOptions: false, check: 'auto', bidMode: 'step', bidStep: 50, loss: 'bid',
      questions: [{ ...listQ({ id: 'lau' }), betsCut: 2 }] };
    const wipeout = { id: 'rw', type: 'wipeout', title: '', shuffleOptions: false,
      questions: [listQ({ id: 'lw' }), ...[1, 2, 3, 4].map((n) => ({ ...single, id: `w${n}` }))] };
    expect(issues(quizOf([round('r', [listQ()])]))).toEqual([]);
    expect(issues(quizOf([board(listQ())]))).toEqual([]);
    for (const bad of [blitzRound, final, bets, auction, wipeout]) {
      expect(issues(quizOf([round('r', [single]), bad]))).toContain('timedlist_place');
    }
    expect(issues(withCell(listQ(), { kind: 'blitz' }))).toContain('timedlist_place');
    expect(issues(withCell(listQ(), { answerMode: 'voice' }))).toContain('timedlist_place');
    expect(issues(quizOf([board(listQ(), { answerMode: 'voice' })]))).toContain('timedlist_place');
  });

  it('old quizzes still parse', () => {
    const parsed = quizSchema.safeParse(quizOf([round('r', [single, orderSpare])]));
    expect(parsed.success).toBe(true);
    expect(JSON.stringify(parsed.data)).not.toContain('timedlist');
  });

  it('answerSchema never accepts a list summary; the list event is limited', () => {
    expect(valid(answerSchema, { type: 'timedlist', found: ['i1'], total: 5, wrong: 0 })).toBe(false);
    expect(valid(timedListWordSchema, { word: 'Марс', enter: false })).toBe(true);
    expect(valid(timedListWordSchema, { word: 'я'.repeat(61), enter: true })).toBe(false);
    expect(valid(timedListWordSchema, { word: 'Марс' })).toBe(false);
    expect(valid(timedListWordSchema, { word: 'Марс', enter: 'yes' })).toBe(false);
  });

  it('questionPrice of a timed list is the price of every item', () => {
    expect(questionPrice(questionSchema.parse(listQ()))).toBe(500);
  });
});

describe('letter words question (27d)', () => {
  const lettersQ = (patch: object = {}) => ({ id: 'lw', type: 'letterwords', text: 'Складіть слова', imageUrl: null, video: null,
    timeLimit: 90, points: 20, set: { kind: 'fixed', letters: 'морквасті' }, goal: 'most', per: 'word', ...patch });
  const quizOf = (rounds: object[]) => ({ title: 'T', description: '', settings: DEFAULT_SETTINGS, rounds });
  const issues = (value: unknown) => {
    const parsed = quizSchema.safeParse(value);
    return parsed.success ? [] : parsed.error.issues.map((i) => i.message);
  };
  const qIssues = (value: unknown) => {
    const parsed = questionSchema.safeParse(value);
    return parsed.success ? [] : parsed.error.issues.map((i) => i.message);
  };
  const board = (q: object, patch: object = {}) => ({
    id: 'b', type: 'board', title: '', shuffleOptions: false, answerMode: 'phone', check: 'auto', rules: DEFAULT_RULES, ...patch,
    categories: [1, 2, 3].map((n) => ({ id: `c${n}`, title: `К${n}`, cells: [1, 2, 3].map((m) => ({ mark: 'none',
      question: n === 1 && m === 1 ? q : { ...single, id: `q${n}${m}` } })) })),
  });
  const withCell = (q: object, cellPatch: object) => {
    const b = board(q);
    Object.assign(b.categories[0]!.cells[0]!, cellPatch);
    return quizOf([b]);
  };

  it('accepts a letters question with a fixed or a random set', () => {
    expect(QUESTION_TYPES.indexOf('letterwords')).toBe(QUESTION_TYPES.indexOf('timedlist') + 1);
    expect(qIssues(lettersQ())).toEqual([]);
    expect(qIssues(lettersQ({ set: { kind: 'random', count: 9 } }))).toEqual([]);
    expect(qIssues(lettersQ({ goal: 'longest', per: 'letter' }))).toEqual([]);
    expect(issues(quizOf([round('r', [lettersQ()])]))).toEqual([]);
  });

  it('refuses bad letters, a longest goal per word, a video and too many points', () => {
    expect(qIssues(lettersQ({ set: { kind: 'fixed', letters: 'abc' } }))).toContain('letterwords_letters');
    expect(qIssues(lettersQ({ set: { kind: 'fixed', letters: 'кіт' } }))).toContain('letterwords_letters');
    expect(qIssues(lettersQ({ goal: 'longest', per: 'word' }))).toContain('letterwords_per');
    expect(qIssues(lettersQ({ video: { id: 'dQw4w9WgXcQ', start: 0 } }))).toContain('letterwords_video');
    expect(qIssues(lettersQ({ points: 1000, per: 'letter' }))).toContain('letterwords_points');
    expect(valid(questionSchema, lettersQ({ set: { kind: 'random', count: 3 } }))).toBe(false);
    expect(valid(questionSchema, lettersQ({ set: { kind: 'random', count: 13 } }))).toBe(false);
  });

  it('letters questions play in classic rounds and normal phone cells only', () => {
    const blitzRound = { id: 'bl', type: 'blitz', title: '', shuffleOptions: false, answerWindow: 15, attempts: 1, check: 'auto',
      rules: { ...DEFAULT_RULES, partial: null }, questions: [lettersQ({ id: 'lb' })] };
    const final = { id: 'f', type: 'final', title: '', shuffleOptions: false, check: 'auto', questions: [lettersQ({ id: 'lf' })] };
    const bets = { id: 'bt', type: 'bets', title: '', shuffleOptions: false, check: 'auto', betStart: 200, betStep: 100, betMax: 600,
      questions: [{ ...lettersQ({ id: 'lbt' }), betsCut: 2 }] };
    const auction = { id: 'au', type: 'auction', title: '', shuffleOptions: false, check: 'auto', bidMode: 'step', bidStep: 50, loss: 'bid',
      questions: [{ ...lettersQ({ id: 'lau' }), betsCut: 2 }] };
    const wipeout = { id: 'rw', type: 'wipeout', title: '', shuffleOptions: false,
      questions: [lettersQ({ id: 'lw2' }), ...[1, 2, 3, 4].map((n) => ({ ...single, id: `w${n}` }))] };
    expect(issues(quizOf([round('r', [lettersQ()])]))).toEqual([]);
    expect(issues(quizOf([board(lettersQ())]))).toEqual([]);
    for (const bad of [blitzRound, final, bets, auction, wipeout]) {
      expect(issues(quizOf([round('r', [single]), bad]))).toContain('letterwords_place');
    }
    expect(issues(withCell(lettersQ(), { kind: 'blitz' }))).toContain('letterwords_place');
    expect(issues(withCell(lettersQ(), { answerMode: 'voice' }))).toContain('letterwords_place');
    expect(issues(quizOf([board(lettersQ(), { answerMode: 'voice' })]))).toContain('letterwords_place');
  });

  it('old quizzes still parse', () => {
    const parsed = quizSchema.safeParse(quizOf([round('r', [single, orderSpare])]));
    expect(parsed.success).toBe(true);
    expect(JSON.stringify(parsed.data)).not.toContain('letterwords');
  });

  it('answerSchema never accepts a letters summary; the event is limited', () => {
    expect(valid(answerSchema, { type: 'letterwords', words: ['морква'], longest: 6 })).toBe(false);
    expect(valid(letterWordSchema, { word: 'морква' })).toBe(true);
    expect(valid(letterWordSchema, { word: 'я'.repeat(31) })).toBe(false);
    expect(valid(letterWordSchema, {})).toBe(false);
    expect(valid(letterCheckSchema, { letters: 'морквасті' })).toBe(true);
    expect(valid(letterCheckSchema, { letters: 'я'.repeat(41) })).toBe(false);
  });

  it('questionPrice of letters is a guide for the board', () => {
    expect(questionPrice(questionSchema.parse(lettersQ({ goal: 'longest', per: 'letter', points: 10 })))).toBe(70);
    expect(questionPrice(questionSchema.parse(lettersQ()))).toBe(200);
    expect(questionPrice(questionSchema.parse(lettersQ({ per: 'letter', points: 10 })))).toBe(400);
  });
});

describe('more or less question (28a)', () => {
  const pairA = { id: 'p1', prompt: 'Що вище?', a: { text: 'Говерла', value: '2061 м' }, b: { text: 'Ейфелева вежа', value: '330 м' }, correct: 'a', points: 100 };
  const pairB = { id: 'p2', prompt: 'Що довше?', a: { text: 'Рейн', value: '1233 км' }, b: { text: 'Дунай', value: '2850 км' }, correct: 'b', points: 100 };
  const pairC = { id: 'p3', prompt: 'Що глибше?', a: { text: 'Світязь', value: '58 м' }, b: { text: 'Синевир', value: '22 м' }, correct: 'a', points: 200 };
  const moreLessQ = (patch: object = {}) => ({ id: 'ml', type: 'moreless', text: 'Порівняйте', imageUrl: null, video: null,
    timeLimit: 60, points: 400, pairs: [pairA, pairB, pairC], ...patch });
  const quizOf = (rounds: object[]) => ({ title: 'T', description: '', settings: DEFAULT_SETTINGS, rounds });
  const issues = (value: unknown) => {
    const parsed = quizSchema.safeParse(value);
    return parsed.success ? [] : parsed.error.issues.map((i) => i.message);
  };
  const qIssues = (value: unknown) => {
    const parsed = questionSchema.safeParse(value);
    return parsed.success ? [] : parsed.error.issues.map((i) => i.message);
  };
  const board = (q: object, patch: object = {}) => ({
    id: 'b', type: 'board', title: '', shuffleOptions: false, answerMode: 'phone', check: 'auto', rules: DEFAULT_RULES, ...patch,
    categories: [1, 2, 3].map((n) => ({ id: `c${n}`, title: `К${n}`, cells: [1, 2, 3].map((m) => ({ mark: 'none',
      question: n === 1 && m === 1 ? q : { ...single, id: `q${n}${m}` } })) })),
  });
  const withCell = (q: object, cellPatch: object) => {
    const b = board(q);
    Object.assign(b.categories[0]!.cells[0]!, cellPatch);
    return quizOf([b]);
  };
  const manyPairs = (count: number, points: number) => Array.from({ length: count }, (_, i) => ({ ...pairA, id: `p${i}`, points }));

  it('accepts a more or less question', () => {
    expect(QUESTION_TYPES.indexOf('moreless')).toBe(QUESTION_TYPES.indexOf('letterwords') + 1);
    expect(qIssues(moreLessQ())).toEqual([]);
    expect(issues(quizOf([round('r', [moreLessQ()])]))).toEqual([]);
    expect(issues(quizOf([board(moreLessQ())]))).toEqual([]);
  });

  it('refuses a bad row', () => {
    expect(valid(questionSchema, moreLessQ({ pairs: [pairA], points: 100 }))).toBe(false);
    expect(valid(questionSchema, moreLessQ({ pairs: manyPairs(21, 10), points: 210 }))).toBe(false);
    expect(valid(questionSchema, moreLessQ({ pairs: manyPairs(20, 10), points: 200 }))).toBe(true);
    expect(valid(questionSchema, moreLessQ({ pairs: [{ ...pairA, a: { text: 'Говерла', value: 'я'.repeat(41) } }, pairB, pairC] }))).toBe(false);
    expect(valid(questionSchema, moreLessQ({ pairs: [{ ...pairA, prompt: '' }, pairB, pairC] }))).toBe(false);
    expect(qIssues(moreLessQ({ pairs: [{ ...pairA, b: { text: 'говерла', value: '1 м' } }, pairB, pairC] }))).toContain('moreless_same');
    expect(qIssues(moreLessQ({ points: 300 }))).toContain('moreless_sum');
    expect(qIssues(moreLessQ({ pairs: manyPairs(11, 200), points: 2200 }))).toContain('moreless_points');
    expect(qIssues(moreLessQ({ pairs: manyPairs(10, 200), points: 2000 }))).not.toContain('moreless_points');
    expect(qIssues(moreLessQ({ video: { id: 'dQw4w9WgXcQ', start: 0 } }))).toContain('moreless_video');
    expect(qIssues(moreLessQ({ pairs: [pairA, { ...pairB, id: 'p1' }, pairC] }))).toContain('duplicate_ids');
    // Однакові значення — не помилка: «рівно» вирішує позначка ведучого.
    expect(qIssues(moreLessQ({ pairs: [{ ...pairA, b: { text: 'Бескид', value: '2061 м' } }, pairB, pairC] }))).toEqual([]);
  });

  it('more or less plays in classic rounds and normal phone cells only', () => {
    const blitzRound = { id: 'bl', type: 'blitz', title: '', shuffleOptions: false, answerWindow: 15, attempts: 1, check: 'auto',
      rules: { ...DEFAULT_RULES, partial: null }, questions: [moreLessQ({ id: 'mb' })] };
    const final = { id: 'f', type: 'final', title: '', shuffleOptions: false, check: 'auto', questions: [moreLessQ({ id: 'mf' })] };
    const bets = { id: 'bt', type: 'bets', title: '', shuffleOptions: false, check: 'auto', betStart: 200, betStep: 100, betMax: 600,
      questions: [{ ...moreLessQ({ id: 'mbt' }), betsCut: 2 }] };
    const auction = { id: 'au', type: 'auction', title: '', shuffleOptions: false, check: 'auto', bidMode: 'step', bidStep: 50, loss: 'bid',
      questions: [{ ...moreLessQ({ id: 'mau' }), betsCut: 2 }] };
    const wipeout = { id: 'rw', type: 'wipeout', title: '', shuffleOptions: false,
      questions: [moreLessQ({ id: 'mw2' }), ...[1, 2, 3, 4].map((n) => ({ ...single, id: `w${n}` }))] };
    for (const bad of [blitzRound, final, bets, auction, wipeout]) {
      expect(issues(quizOf([round('r', [single]), bad]))).toContain('moreless_place');
    }
    expect(issues(withCell(moreLessQ(), { kind: 'blitz' }))).toContain('moreless_place');
    expect(issues(withCell(moreLessQ(), { answerMode: 'voice' }))).toContain('moreless_place');
    expect(issues(quizOf([board(moreLessQ(), { answerMode: 'voice' })]))).toContain('moreless_place');
    expect(issues({ ...quizOf([round('r', [single])]), spares: [moreLessQ({ id: 'ms' })] })).toContain('spare_type');
  });

  it('old quizzes still parse', () => {
    const parsed = quizSchema.safeParse(quizOf([round('r', [single, orderSpare])]));
    expect(parsed.success).toBe(true);
    expect(JSON.stringify(parsed.data)).not.toContain('moreless');
  });

  it('questionPrice of more or less is the sum of its comparisons', () => {
    expect(questionPrice(questionSchema.parse(moreLessQ()))).toBe(400);
  });

  it('answerSchema never accepts a more or less summary; the pick event is limited', () => {
    expect(valid(answerSchema, { type: 'moreless', picks: ['a'], right: 1, total: 3 })).toBe(false);
    expect(valid(moreLessPickSchema, { index: 0, pick: 'a' })).toBe(true);
    expect(valid(moreLessPickSchema, { index: 19, pick: 'b' })).toBe(true);
    expect(valid(moreLessPickSchema, { index: 20, pick: 'a' })).toBe(false);
    expect(valid(moreLessPickSchema, { index: 0, pick: 'c' })).toBe(false);
    expect(valid(moreLessPickSchema, { index: 1.5, pick: 'a' })).toBe(false);
  });
});

describe('drawing question (28c)', () => {
  const drawingQ = (patch: object = {}) => ({ id: 'dr', type: 'drawing', text: 'Намалюйте рослину', imageUrl: null, video: null,
    timeLimit: 60, points: 100, accepted: ['соняшник', 'соняшник однорічний'], ...patch });
  const quizOf = (rounds: object[], patch: object = {}) => ({ title: 'T', description: '', settings: DEFAULT_SETTINGS, rounds, ...patch });
  const issues = (value: unknown) => {
    const parsed = quizSchema.safeParse(value);
    return parsed.success ? [] : parsed.error.issues.map((i) => i.message);
  };
  const qIssues = (value: unknown) => {
    const parsed = questionSchema.safeParse(value);
    return parsed.success ? [] : parsed.error.issues.map((i) => i.message);
  };
  const board = (q: object, patch: object = {}) => ({
    id: 'b', type: 'board', title: '', shuffleOptions: false, answerMode: 'phone', check: 'auto', rules: DEFAULT_RULES, ...patch,
    categories: [1, 2, 3].map((n) => ({ id: `c${n}`, title: `К${n}`, cells: [1, 2, 3].map((m) => ({ mark: 'none',
      question: n === 1 && m === 1 ? q : { ...single, id: `q${n}${m}` } })) })),
  });
  const withCell = (q: object, cellPatch: object, patch: object = {}) => {
    const b = board(q, patch);
    Object.assign(b.categories[0]!.cells[0]!, cellPatch);
    return quizOf([b]);
  };

  it('accepts a drawing question', () => {
    expect(QUESTION_TYPES.indexOf('drawing')).toBe(QUESTION_TYPES.indexOf('moreless') + 1);
    expect(LIMITS.defaultDrawingTime).toBe(60);
    expect(qIssues(drawingQ())).toEqual([]);
    expect(issues(quizOf([round('r', [drawingQ()])]))).toEqual([]);
  });

  it('refuses a drawing without a word', () => {
    expect(valid(questionSchema, drawingQ({ accepted: [] }))).toBe(false);
    expect(valid(questionSchema, drawingQ({ accepted: Array.from({ length: 11 }, (_, i) => `слово${i}`) }))).toBe(false);
  });

  it('refuses video, reveal and audio on a drawing', () => {
    expect(qIssues(drawingQ({ video: { id: 'dQw4w9WgXcQ', start: 0 } }))).toContain('drawing_video');
    expect(qIssues(drawingQ({ imageUrl: '/media/a.png', reveal: 'blur' }))).toContain('drawing_video');
    expect(qIssues(drawingQ({ audio: { source: 'youtube', id: 'dQw4w9WgXcQ', start: 0, duration: 15 } }))).toContain('drawing_video');
    // підказка недосяжна (баф вимкнено), тож і не зберігається
    expect(qIssues(drawingQ({ hint: 'Жовта квітка' }))).toContain('drawing_hint');
  });

  it('refuses a word or a spelling longer than the guess field', () => {
    expect(LIMITS.drawGuess).toBe(60);
    expect(qIssues(drawingQ({ accepted: ['я'.repeat(60)] }))).toEqual([]);
    expect(qIssues(drawingQ({ accepted: ['я'.repeat(61)] }))).toContain('drawing_long');
    expect(qIssues(drawingQ({ accepted: ['соняшник', 'я'.repeat(61)] }))).toContain('drawing_long');
  });

  it('drawing plays in classic rounds only', () => {
    const blitzRound = { id: 'bl', type: 'blitz', title: '', shuffleOptions: false, answerWindow: 15, attempts: 1, check: 'auto',
      rules: { ...DEFAULT_RULES, partial: null }, questions: [drawingQ({ id: 'db' })] };
    const final = { id: 'f', type: 'final', title: '', shuffleOptions: false, check: 'auto', questions: [drawingQ({ id: 'df' })] };
    const bets = { id: 'bt', type: 'bets', title: '', shuffleOptions: false, check: 'auto', betStart: 200, betStep: 100, betMax: 600,
      questions: [{ ...drawingQ({ id: 'dbt' }), betsCut: 2 }] };
    const auction = { id: 'au', type: 'auction', title: '', shuffleOptions: false, check: 'auto', bidMode: 'step', bidStep: 50, loss: 'bid',
      questions: [{ ...drawingQ({ id: 'dau' }), betsCut: 2 }] };
    const wipeout = { id: 'rw', type: 'wipeout', title: '', shuffleOptions: false,
      questions: [drawingQ({ id: 'dw2' }), ...[1, 2, 3, 4].map((n) => ({ ...single, id: `w${n}` }))] };
    for (const bad of [blitzRound, final, bets, auction]) {
      expect(issues(quizOf([round('r', [single]), bad]))).toContain('drawing_place');
    }
    expect(issues(quizOf([round('r', [single]), wipeout])).length).toBeGreaterThan(0);
    const survival = { id: 'rs', type: 'survival', title: '', speedBonus: false, shuffleOptions: false, rules: DEFAULT_RULES,
      questions: [drawingQ({ id: 'dsv' }), { ...single, id: 's2' }, { ...single, id: 's3' }], trials: [], trial: 'luck', survivors: 1, bonus: 500 };
    expect(issues(quizOf([round('r', [single]), survival]))).toContain('drawing_place');
    const four = (id: string) => ({ ...single, id, options: ['a', 'b', 'c', 'd'].map((o) => ({ id: o, text: o.toUpperCase() })), correctId: 'b' });
    const ladder = { id: 'rl', type: 'ladder', title: '', shuffleOptions: false, questions: [drawingQ({ id: 'dl' }), ...[2, 3, 4, 5].map((n) => four(`l${n}`))],
      levels: [100, 300, 1000, 3000, 10000], safe: [2], pick: 'host', lifelines: ['fifty'], timer: false };
    expect(issues(quizOf([round('r', [single]), ladder]))).toContain('drawing_place');
    // «Правда про гравця» запитань не має: чуже поле questions відкидається, малюнок туди не потрапить
    const truth = quizSchema.safeParse(quizOf([round('r', [single]), { id: 'tr', type: 'truth', title: '', points: 300, timeLimit: 30, questions: [drawingQ({ id: 'dt' })] }]));
    expect(truth.success).toBe(true);
    expect(JSON.stringify(truth.data?.rounds[1])).not.toContain('drawing');
    for (const kind of ['normal', 'blitz']) {
      expect(issues(withCell(drawingQ(), { kind }))).toContain('drawing_place');
    }
    expect(issues(withCell(drawingQ(), { kind: 'normal' }, { answerMode: 'voice' }))).toContain('drawing_place');
    expect(issues(quizOf([board(drawingQ())]))).toContain('drawing_place');
    expect(issues(quizOf([round('r', [drawingQ(), single])]))).toEqual([]);
    expect(issues({ ...quizOf([round('r', [single])]), spares: [drawingQ({ id: 'ds' })] })).toContain('spare_type');
  });

  it('old quizzes still parse', () => {
    const parsed = quizSchema.safeParse(quizOf([round('r', [single, orderSpare])]));
    expect(parsed.success).toBe(true);
    expect(JSON.stringify(parsed.data)).not.toContain('drawing');
  });

  it('the draw events are limited', () => {
    const pts = (n: number) => Array.from({ length: n * 2 }, (_, i) => i % 1000);
    expect(valid(drawOpSchema, { op: 'begin', c: 8, w: 2, p: pts(64) })).toBe(true);
    expect(valid(drawOpSchema, { op: 'begin', c: 0, w: 0, p: [0, 1000] })).toBe(true);
    expect(valid(drawOpSchema, { op: 'more', index: 299, p: [1, 2] })).toBe(true);
    expect(valid(drawOpSchema, { op: 'undo' })).toBe(true);
    expect(valid(drawOpSchema, { op: 'clear' })).toBe(true);
    expect(valid(drawOpSchema, { op: 'begin', c: 0, w: 0, p: pts(65) })).toBe(false);
    expect(valid(drawOpSchema, { op: 'begin', c: 0, w: 0, p: [1, 2, 3] })).toBe(false);
    expect(valid(drawOpSchema, { op: 'begin', c: 0, w: 0, p: [1001, 2] })).toBe(false);
    expect(valid(drawOpSchema, { op: 'begin', c: 0, w: 0, p: [0.5, 2] })).toBe(false);
    expect(valid(drawOpSchema, { op: 'begin', c: 0, w: 0, p: [] })).toBe(false);
    expect(valid(drawOpSchema, { op: 'begin', c: 9, w: 0, p: [1, 2] })).toBe(false);
    expect(valid(drawOpSchema, { op: 'begin', c: 0, w: 3, p: [1, 2] })).toBe(false);
    expect(valid(drawOpSchema, { op: 'more', index: 300, p: [1, 2] })).toBe(false);
    expect(valid(drawOpSchema, { op: 'undo', extra: 1 })).toBe(false);
    expect(valid(drawGuessSchema, { text: 'я'.repeat(60) })).toBe(true);
    expect(valid(drawGuessSchema, { text: 'я'.repeat(61) })).toBe(false);
    expect(valid(answerSchema, { type: 'drawing', guess: 'соняшник', drew: null })).toBe(false);
  });
});

describe('puzzles round (28d)', () => {
  const sudokuQ = (patch: object = {}) => ({ id: 'su', type: 'sudoku', text: 'Розв’яжіть судоку', imageUrl: null, video: null,
    timeLimit: 180, points: 300, level: 'medium', seed: 3, ...generateSudoku(3, 'medium'), ...patch });
  const WORDS = ['калина', 'лелека', 'вишня', 'соняшник', 'мак', 'криниця'];
  const entries = WORDS.map((answer, i) => ({ id: `w${i}`, answer, clue: `Підказка ${i}` }));
  const laid = () => {
    const result = layoutCrossword(entries);
    if (!result.ok) throw new Error('not laid out');
    return result.layout;
  };
  const crosswordQ = (patch: object = {}) => ({ id: 'cr', type: 'crossword', text: 'Розгадайте кросворд', imageUrl: null, video: null,
    timeLimit: 240, points: 300, mode: 'full', entries, key: null, layout: laid(), ...patch });
  const keyQ = (key = 'лис') => {
    const keyCells = pickKeyCells(laid(), entries, key);
    if (!Array.isArray(keyCells)) throw new Error('no key cells');
    return crosswordQ({ mode: 'key', key, layout: { ...laid(), keyCells } });
  };
  const puzzles = (questions: object[], patch: object = {}) => ({ id: 'pz', type: 'puzzles', title: 'Головоломки', questions, ...patch });
  const quizOf = (rounds: object[], patch: object = {}) => ({ title: 'T', description: '', settings: DEFAULT_SETTINGS, rounds, ...patch });
  const issues = (value: unknown) => {
    const parsed = quizSchema.safeParse(value);
    return parsed.success ? [] : parsed.error.issues.map((i) => i.message);
  };
  const qIssues = (value: unknown) => {
    const parsed = questionSchema.safeParse(value);
    return parsed.success ? [] : parsed.error.issues.map((i) => i.message);
  };
  const board = (q: object, patch: object = {}) => ({
    id: 'b', type: 'board', title: '', shuffleOptions: false, answerMode: 'phone', check: 'auto', rules: DEFAULT_RULES, ...patch,
    categories: [1, 2, 3].map((n) => ({ id: `c${n}`, title: `К${n}`, cells: [1, 2, 3].map((m) => ({ mark: 'none',
      question: n === 1 && m === 1 ? q : { ...single, id: `q${n}${m}` } })) })),
  });

  it('accepts a generated and a custom sudoku', () => {
    expect(QUESTION_TYPES.indexOf('sudoku')).toBe(QUESTION_TYPES.indexOf('drawing') + 1);
    expect(QUESTION_TYPES.indexOf('crossword')).toBe(QUESTION_TYPES.indexOf('sudoku') + 1);
    expect(ROUND_TYPES.indexOf('puzzles')).toBe(ROUND_TYPES.indexOf('truth') + 1);
    expect(qIssues(sudokuQ())).toEqual([]);
    const { givens, solution } = generateSudoku(11, 'easy');
    expect(qIssues(sudokuQ({ level: 'custom', seed: null, givens, solution }))).toEqual([]);
    expect(issues(quizOf([puzzles([sudokuQ(), crosswordQ()])]))).toEqual([]);
  });

  it('refuses a sudoku without one solution', () => {
    const { givens, solution } = generateSudoku(3, 'medium');
    // менше заданих: розв'язків багато
    expect(qIssues(sudokuQ({ givens: '0'.repeat(30) + givens.slice(30) }))).toContain('sudoku_many');
    expect(qIssues(sudokuQ({ givens: '0'.repeat(36) }))).toContain('sudoku_many');
    // два однакових у рядку: конфлікт
    expect(qIssues(sudokuQ({ givens: '110000'.padEnd(36, '0') }))).toContain('sudoku_conflict');
    // без конфлікту, але без розв'язку: у клітинці 5 першого рядка жодного кандидата
    expect(qIssues(sudokuQ({ givens: '123400' + '000056' + '0'.repeat(24) }))).toContain('sudoku_none');
    // розв'язок не той
    const other = solution.replace(/[12]/g, (d) => (d === '1' ? '2' : '1'));
    expect(qIssues(sudokuQ({ solution: other }))).toContain('sudoku_solution');
    // задані не є підмножиною розв'язку
    expect(qIssues(sudokuQ({ solution: solution.split('').reverse().join('') }))).toContain('sudoku_solution');
    // формат: помилка розбору
    expect(valid(questionSchema, sudokuQ({ givens: '12' }))).toBe(false);
    expect(valid(questionSchema, sudokuQ({ solution: '7'.repeat(36) }))).toBe(false);
    expect(valid(questionSchema, sudokuQ({ level: 'insane' }))).toBe(false);
    expect(valid(questionSchema, sudokuQ({ seed: -1 }))).toBe(false);
  });

  it('accepts a crossword in both modes', () => {
    expect(qIssues(crosswordQ())).toEqual([]);
    expect(qIssues(keyQ())).toEqual([]);
  });

  it('refuses a broken crossword', () => {
    expect(qIssues(crosswordQ({ layout: null }))).toContain('crossword_layout');
    const english = entries.map((e, i) => (i === 0 ? { ...e, answer: 'apple' } : e));
    expect(qIssues(crosswordQ({ entries: english }))).toContain('crossword_word');
    const long = entries.map((e, i) => (i === 0 ? { ...e, answer: 'а'.repeat(13) } : e));
    expect(qIssues(crosswordQ({ entries: long }))).toContain('crossword_word');
    const twin = entries.map((e, i) => (i === 1 ? { ...e, answer: 'Калина' } : e));
    expect(qIssues(crosswordQ({ entries: twin }))).toContain('crossword_duplicate');
    expect(qIssues(crosswordQ({ mode: 'key', key: null }))).toContain('crossword_key');
    expect(qIssues(crosswordQ({ mode: 'key', key: 'ab', layout: { ...laid(), keyCells: [0, 1] } }))).toContain('crossword_key');
    expect(qIssues(crosswordQ({ mode: 'key', key: 'ск' }))).toContain('crossword_key');
    expect(qIssues(crosswordQ({ key: 'лис' }))).toContain('crossword_key_mode');
    expect(qIssues(crosswordQ({ layout: { ...laid(), keyCells: [0, 1, 2] } }))).toContain('crossword_key_mode');
    const good = keyQ();
    expect(qIssues({ ...good, layout: { ...good.layout, keyCells: [...good.layout.keyCells].reverse() } })).toContain('crossword_key_letters');
    expect(qIssues({ ...good, layout: { ...good.layout, keyCells: [0, 1, 999] } })).toContain('crossword_key_letters');
    // розкладка не збігається зі словами
    const shifted = { ...laid(), words: laid().words.map((w, i) => (i === 0 ? { ...w, col: w.col + 1 } : w)) };
    expect(qIssues(crosswordQ({ layout: shifted }))).toContain('crossword_layout');
    expect(qIssues(crosswordQ({ layout: { ...laid(), words: laid().words.slice(1) } }))).toContain('crossword_layout');
    // кількість слів і порожня підказка
    expect(valid(questionSchema, crosswordQ({ entries: entries.slice(0, 3), layout: null }))).toBe(false);
    const nine = Array.from({ length: 9 }, (_, i) => ({ id: `n${i}`, answer: 'слово', clue: 'х' }));
    expect(valid(questionSchema, crosswordQ({ entries: nine, layout: null }))).toBe(false);
    expect(valid(questionSchema, crosswordQ({ entries: entries.map((e, i) => (i === 0 ? { ...e, clue: '' } : e)) }))).toBe(false);
  });

  it('refuses video on a puzzle', () => {
    const video = { id: 'dQw4w9WgXcQ', start: 0 };
    expect(qIssues(sudokuQ({ video }))).toContain('puzzle_video');
    expect(qIssues(crosswordQ({ video }))).toContain('puzzle_video');
  });

  it('refuses a hint, audio and a reveal on a puzzle, like a drawing', () => {
    const audio = { source: 'youtube', id: 'dQw4w9WgXcQ', start: 0, duration: 15 };
    for (const q of [sudokuQ, crosswordQ]) {
      expect(qIssues(q({ hint: 'Почніть з кута' }))).toContain('puzzle_hint');
      expect(qIssues(q({ audio }))).toContain('puzzle_video');
      expect(qIssues(q({ imageUrl: '/media/a.png', reveal: 'blur' }))).toContain('puzzle_video');
    }
  });

  it('a puzzle timer goes to 600 s, other types stay within 120', () => {
    expect(qIssues(sudokuQ({ timeLimit: 600 }))).toEqual([]);
    expect(qIssues(crosswordQ({ timeLimit: 600 }))).toEqual([]);
    expect(valid(questionSchema, sudokuQ({ timeLimit: 601 }))).toBe(false);
    expect(valid(questionSchema, crosswordQ({ timeLimit: 601 }))).toBe(false);
    expect(valid(questionSchema, { ...single, timeLimit: 120 })).toBe(true);
    expect(valid(questionSchema, { ...single, timeLimit: 180 })).toBe(false);
  });

  it('puzzles play only in the puzzles round', () => {
    const blitzRound = { id: 'bl', type: 'blitz', title: '', shuffleOptions: false, answerWindow: 15, attempts: 1, check: 'auto',
      rules: { ...DEFAULT_RULES, partial: null }, questions: [sudokuQ({ id: 'sb' })] };
    const final = { id: 'f', type: 'final', title: '', shuffleOptions: false, check: 'auto', questions: [sudokuQ({ id: 'sf' })] };
    const bets = { id: 'bt', type: 'bets', title: '', shuffleOptions: false, check: 'auto', betStart: 200, betStep: 100, betMax: 600,
      questions: [{ ...sudokuQ({ id: 'sbt' }), betsCut: 2 }] };
    const auction = { id: 'au', type: 'auction', title: '', shuffleOptions: false, check: 'auto', bidMode: 'step', bidStep: 50, loss: 'bid',
      questions: [{ ...sudokuQ({ id: 'sau' }), betsCut: 2 }] };
    const wipeout = { id: 'rw', type: 'wipeout', title: '', shuffleOptions: false,
      questions: [sudokuQ({ id: 'sw' }), ...[1, 2, 3, 4].map((n) => ({ ...single, id: `w${n}` }))] };
    const survival = { id: 'rs', type: 'survival', title: '', speedBonus: false, shuffleOptions: false, rules: DEFAULT_RULES,
      questions: [sudokuQ({ id: 'ssv' }), { ...single, id: 's2' }, { ...single, id: 's3' }], trials: [], trial: 'luck', survivors: 1, bonus: 500 };
    const four = (id: string) => ({ ...single, id, options: ['a', 'b', 'c', 'd'].map((o) => ({ id: o, text: o.toUpperCase() })), correctId: 'b' });
    const ladder = { id: 'rl', type: 'ladder', title: '', shuffleOptions: false, questions: [sudokuQ({ id: 'sl' }), ...[2, 3, 4, 5].map((n) => four(`l${n}`))],
      levels: [100, 300, 1000, 3000, 10000], safe: [2], pick: 'host', lifelines: ['fifty'], timer: false };
    for (const bad of [round('c', [sudokuQ({ id: 'sc' })]), round('c', [crosswordQ({ id: 'cc' })]), blitzRound, final, bets, auction, wipeout, survival, ladder]) {
      expect(issues(quizOf([round('r', [single]), bad]))).toContain('puzzle_place');
    }
    expect(issues(quizOf([board(sudokuQ())]))).toContain('puzzle_place');
    expect(issues(quizOf([board(crosswordQ({ id: 'cb' }))]))).toContain('puzzle_place');
    const trial = { ...survival, questions: [single, { ...single, id: 's2' }, { ...single, id: 's3' }], trial: 'question', trials: [sudokuQ({ id: 'st' })] };
    expect(issues(quizOf([round('r', [single]), trial]))).toContain('puzzle_place');
    expect(issues({ ...quizOf([round('r', [single])]), spares: [sudokuQ({ id: 'ss' })] })).toContain('spare_type');
    expect(valid(duelQuestionSchema, sudokuQ())).toBe(false);
    // а puzzles приймає лише головоломки
    expect(issues(quizOf([puzzles([single])]))).toContain('puzzles_type');
    expect(issues(quizOf([puzzles([sudokuQ(), { ...single, id: 'q2' }])]))).toContain('puzzles_type');
    expect(issues(quizOf([puzzles([sudokuQ({ id: 'a' }), crosswordQ({ id: 'b' })])]))).toEqual([]);
    // до 10 запитань
    const ten = Array.from({ length: 10 }, (_, i) => sudokuQ({ id: `t${i}` }));
    expect(issues(quizOf([puzzles(ten)]))).toEqual([]);
    expect(issues(quizOf([puzzles([...ten, sudokuQ({ id: 't10' })])]))).not.toEqual([]);
    expect(valid(roundSchema, puzzles([]))).toBe(false);
  });

  it('a puzzles round has no rules', () => {
    const parsed = roundSchema.parse(puzzles([sudokuQ()]));
    expect(rulesOf(parsed)).toBe(DEFAULT_RULES);
    expect(roundQuestions(parsed)).toHaveLength(1);
    expect(questionPrice(questionSchema.parse(sudokuQ({ points: 450 })))).toBe(450);
    expect(questionPrice(questionSchema.parse(crosswordQ()))).toBe(300);
    expect(questionsOf(quizSchema.parse(quizOf([puzzles([sudokuQ(), crosswordQ()])])))).toHaveLength(2);
  });

  it('old quizzes still parse', () => {
    const parsed = quizSchema.safeParse(quizOf([round('r', [single, orderSpare])]));
    expect(parsed.success).toBe(true);
    expect(JSON.stringify(parsed.data)).not.toContain('sudoku');
    expect(JSON.stringify(parsed.data)).not.toContain('crossword');
  });

  it('the puzzle events are limited', () => {
    const cells = (n: number) => Array.from({ length: n }, (_, i) => ({ i, v: '1' }));
    expect(valid(puzzleFillSchema, { questionIndex: 0, cells: cells(12) })).toBe(true);
    expect(valid(puzzleFillSchema, { questionIndex: 0, cells: cells(13) })).toBe(false);
    expect(valid(puzzleFillSchema, { questionIndex: 0, cells: [] })).toBe(false);
    expect(valid(puzzleFillSchema, { questionIndex: 0, cells: [{ i: 143, v: 'я' }] })).toBe(true);
    expect(valid(puzzleFillSchema, { questionIndex: 0, cells: [{ i: 144, v: '1' }] })).toBe(false);
    expect(valid(puzzleFillSchema, { questionIndex: 0, cells: [{ i: 0, v: 'abc' }] })).toBe(false);
    expect(valid(puzzleFillSchema, { questionIndex: 0, cells: [{ i: 0, v: '1', x: 1 }] })).toBe(false);
    expect(valid(puzzleFillSchema, { questionIndex: 0, cells: cells(1), extra: 1 })).toBe(false);
    expect(valid(puzzleDoneSchema, { questionIndex: 2 })).toBe(true);
    // Записів у plays буває більше, ніж запитань вікторини (факти «Правди про гравця», випробування): застаріле відсікає рушій.
    expect(valid(puzzleDoneSchema, { questionIndex: 5000 })).toBe(true);
    expect(valid(puzzleFillSchema, { questionIndex: 5000, cells: cells(1) })).toBe(true);
    expect(valid(puzzleDoneSchema, { questionIndex: 1.5 })).toBe(false);
    expect(valid(puzzleDoneSchema, { questionIndex: -1 })).toBe(false);
    expect(valid(puzzleDoneSchema, { questionIndex: 0, extra: 1 })).toBe(false);
    expect(PUZZLE_BATCHES_PER_SECOND).toBe(6);
    expect(valid(answerSchema, { type: 'puzzle', kind: 'sudoku', grid: '0'.repeat(36), filled: 0, total: 36, solved: false })).toBe(false);
  });

  it('the round brief of puzzles counts the questions', () => {
    const parsed = roundSchema.parse(puzzles([sudokuQ({ id: 'a' }), crosswordQ({ id: 'b' }), sudokuQ({ id: 'c' })]));
    expect(roundBrief(parsed).puzzles).toEqual({ sudoku: 2, crossword: 1, jigsaw: 0, spotdiff: 0, time: 180 + 240 + 180 });
    expect(roundBrief(roundSchema.parse(round('r', [single]))).puzzles).toBeNull();
    expect(emptyBrief('puzzles').puzzles).toBeNull();
  });
});

describe('jigsaw question (29c)', () => {
  const grid = jigsawGrid(12, '4:3');
  const jigsawQ = (patch: object = {}) => ({ id: 'jg', type: 'jigsaw', text: 'Складіть пазл', imageUrl: null, video: null,
    timeLimit: 120, points: 300, photo: '/uploads/' + 'a'.repeat(32) + '.jpg', aspect: '4:3', focus: { x: 0.5, y: 0.5 },
    ...grid, seed: 1, tabs: jigsawTabs(grid.rows, grid.cols, 1), preview: true, ...patch });
  const puzzles = (questions: object[]) => ({ id: 'pz', type: 'puzzles', title: 'Головоломки', questions });
  const quizOf = (rounds: object[]) => ({ title: 'T', description: '', settings: DEFAULT_SETTINGS, rounds });
  const issues = (value: unknown) => {
    const parsed = quizSchema.safeParse(value);
    return parsed.success ? [] : parsed.error.issues.map((i) => i.message);
  };
  const qIssues = (value: unknown) => {
    const parsed = questionSchema.safeParse(value);
    return parsed.success ? [] : parsed.error.issues.map((i) => i.message);
  };

  it('accepts a jigsaw', () => {
    expect(QUESTION_TYPES.indexOf('jigsaw')).toBe(QUESTION_TYPES.indexOf('crossword') + 1);
    expect(qIssues(jigsawQ())).toEqual([]);
    const six = jigsawGrid(36, '1:1');
    expect(qIssues(jigsawQ({ aspect: '1:1', ...six, tabs: jigsawTabs(six.rows, six.cols, 1) }))).toEqual([]);
    expect(qIssues(jigsawQ({ timeLimit: 25 }))).toEqual([]);
  });

  it('refuses a broken jigsaw', () => {
    expect(qIssues(jigsawQ({ imageUrl: '/uploads/' + 'b'.repeat(32) + '.jpg' }))).toContain('jigsaw_image');
    const video = { id: 'dQw4w9WgXcQ', start: 0 };
    const audio = { source: 'youtube', id: 'dQw4w9WgXcQ', start: 0, duration: 15 };
    expect(qIssues(jigsawQ({ video }))).toContain('jigsaw_video');
    expect(qIssues(jigsawQ({ audio }))).toContain('jigsaw_video');
    expect(qIssues(jigsawQ({ imageUrl: '/uploads/' + 'b'.repeat(32) + '.jpg', reveal: 'blur' }))).toContain('jigsaw_video');
    expect(qIssues(jigsawQ({ hint: 'Почніть з кута' }))).toContain('jigsaw_hint');
    expect(qIssues(jigsawQ({ rows: 2, cols: 2, tabs: '0000' }))).toContain('jigsaw_grid');
    expect(qIssues(jigsawQ({ rows: 6, cols: 7, tabs: jigsawTabs(6, 7, 1) }))).toContain('jigsaw_grid');
    expect(qIssues(jigsawQ({ aspect: '1:1', rows: 2, cols: 12, tabs: jigsawTabs(2, 12, 1) }))).toContain('jigsaw_grid');
    expect(qIssues(jigsawQ({ tabs: jigsawTabs(3, 4, 1).slice(1) }))).toContain('jigsaw_tabs');
    expect(valid(questionSchema, jigsawQ({ timeLimit: 24 }))).toBe(false);
    expect(valid(questionSchema, jigsawQ({ timeLimit: 601 }))).toBe(false);
    expect(valid(questionSchema, jigsawQ({ photo: 'https://x/y.jpg' }))).toBe(false);
    expect(valid(questionSchema, jigsawQ({ tabs: '12' }))).toBe(false);
  });

  it('a jigsaw plays only in classic and puzzles rounds', () => {
    const blitzRound = { id: 'bl', type: 'blitz', title: '', shuffleOptions: false, answerWindow: 15, attempts: 1, check: 'auto',
      rules: { ...DEFAULT_RULES, partial: null }, questions: [jigsawQ({ id: 'jb' })] };
    const final = { id: 'f', type: 'final', title: '', shuffleOptions: false, check: 'auto', questions: [jigsawQ({ id: 'jf' })] };
    const bets = { id: 'bt', type: 'bets', title: '', shuffleOptions: false, check: 'auto', betStart: 200, betStep: 100, betMax: 600,
      questions: [{ ...jigsawQ({ id: 'jbt' }), betsCut: 2 }] };
    const auction = { id: 'au', type: 'auction', title: '', shuffleOptions: false, check: 'auto', bidMode: 'step', bidStep: 50, loss: 'bid',
      questions: [{ ...jigsawQ({ id: 'jau' }), betsCut: 2 }] };
    const wipeout = { id: 'rw', type: 'wipeout', title: '', shuffleOptions: false,
      questions: [jigsawQ({ id: 'jw' }), ...[1, 2, 3, 4].map((n) => ({ ...single, id: `w${n}` }))] };
    const survival = { id: 'rs', type: 'survival', title: '', speedBonus: false, shuffleOptions: false, rules: DEFAULT_RULES,
      questions: [jigsawQ({ id: 'jsv' }), { ...single, id: 's2' }, { ...single, id: 's3' }], trials: [], trial: 'luck', survivors: 1, bonus: 500 };
    const four = (id: string) => ({ ...single, id, options: ['a', 'b', 'c', 'd'].map((o) => ({ id: o, text: o.toUpperCase() })), correctId: 'b' });
    const ladder = { id: 'rl', type: 'ladder', title: '', shuffleOptions: false, questions: [jigsawQ({ id: 'jl' }), ...[2, 3, 4, 5].map((n) => four(`l${n}`))],
      levels: [100, 300, 1000, 3000, 10000], safe: [2], pick: 'host', lifelines: ['fifty'], timer: false };
    for (const bad of [blitzRound, final, bets, auction, wipeout, survival, ladder]) {
      expect(issues(quizOf([round('r', [single]), bad]))).toContain('jigsaw_place');
    }
    const board = { id: 'b', type: 'board', title: '', shuffleOptions: false, answerMode: 'phone', check: 'auto', rules: DEFAULT_RULES,
      categories: [1, 2, 3].map((n) => ({ id: `c${n}`, title: `К${n}`, cells: [1, 2, 3].map((m) => ({ mark: 'none',
        question: n === 1 && m === 1 ? jigsawQ({ id: 'jc' }) : { ...single, id: `q${n}${m}` } })) })) };
    expect(issues(quizOf([board]))).toContain('jigsaw_place');
    const trial = { ...survival, questions: [single, { ...single, id: 's2' }, { ...single, id: 's3' }], trial: 'question', trials: [jigsawQ({ id: 'jt' })] };
    expect(issues(quizOf([round('r', [single]), trial]))).toContain('jigsaw_place');
    expect(issues({ ...quizOf([round('r', [single])]), spares: [jigsawQ({ id: 'js' })] })).toContain('spare_type');
    expect(valid(duelQuestionSchema, jigsawQ())).toBe(false);
    // класика й «Головоломки» приймають
    expect(issues(quizOf([round('c', [jigsawQ({ id: 'jc2' })])]))).toEqual([]);
    expect(issues(quizOf([puzzles([jigsawQ({ id: 'ja' })])]))).toEqual([]);
    const sudoku = { id: 'su', type: 'sudoku', text: 'Судоку', imageUrl: null, video: null, timeLimit: 180, points: 300, level: 'medium', seed: 3, ...generateSudoku(3, 'medium') };
    expect(issues(quizOf([puzzles([sudoku, jigsawQ({ id: 'jb2' })])]))).toEqual([]);
    // а puzzles з одиночним — як і раніше
    expect(issues(quizOf([puzzles([single])]))).toContain('puzzles_type');
    expect(issues(quizOf([puzzles([jigsawQ({ id: 'jx' }), { ...single, id: 'q2' }])]))).toContain('puzzles_type');
    expect(fitsPuzzlesRound(jigsawQ() as never)).toBe(true);
    expect(isPuzzle(jigsawQ() as never)).toBe(false);
  });

  it('old quizzes still parse', () => {
    const parsed = quizSchema.safeParse(quizOf([round('r', [single])]));
    expect(parsed.success).toBe(true);
    expect(JSON.stringify(parsed.data)).not.toContain('jigsaw');
  });

  it('the jigsaw events are limited', () => {
    const move = { questionIndex: 7, piece: 3, x: 1.5, y: -0.5, rot: 2 };
    expect(valid(jigsawPlaceSchema, move)).toBe(true);
    expect(valid(jigsawPlaceSchema, { ...move, piece: 36 })).toBe(false);
    expect(valid(jigsawPlaceSchema, { ...move, rot: 4 })).toBe(false);
    expect(valid(jigsawPlaceSchema, { ...move, x: Infinity })).toBe(false);
    expect(valid(jigsawPlaceSchema, { ...move, extra: 1 })).toBe(false);
    expect(valid(jigsawHoldSchema, { questionIndex: 7, piece: 3 })).toBe(true);
    expect(valid(jigsawHoldSchema, { questionIndex: 7, piece: 36 })).toBe(false);
    expect(valid(jigsawHoldSchema, { questionIndex: 7, piece: 3, x: 1 })).toBe(false);
    expect(valid(answerSchema, { type: 'jigsaw', placed: 3, total: 12, done: false, timeMs: null })).toBe(false);
  });
});

describe('spotdiff question (29d)', () => {
  const spotQ = (patch: object = {}) => ({ id: 'sd', type: 'spotdiff', text: 'Знайдіть відмінності', imageUrl: null, video: null,
    timeLimit: 90, points: 300, original: '/uploads/' + 'a'.repeat(32) + '.jpg', changed: '/uploads/' + 'b'.repeat(32) + '.jpg', aspect: 4 / 3,
    spots: [{ x: 0.2, y: 0.2, r: 0.05 }, { x: 0.5, y: 0.5, r: 0.05 }, { x: 0.8, y: 0.8, r: 0.05 }], ...patch });
  const puzzles = (questions: object[]) => ({ id: 'pz', type: 'puzzles', title: 'Головоломки', questions });
  const quizOf = (rounds: object[]) => ({ title: 'T', description: '', settings: DEFAULT_SETTINGS, rounds });
  const issues = (value: unknown) => {
    const parsed = quizSchema.safeParse(value);
    return parsed.success ? [] : parsed.error.issues.map((i) => i.message);
  };
  const qIssues = (value: unknown) => {
    const parsed = questionSchema.safeParse(value);
    return parsed.success ? [] : parsed.error.issues.map((i) => i.message);
  };
  const circles = (n: number) => Array.from({ length: n }, (_, i) => ({ x: 0.05 + i * 0.09, y: 0.5, r: 0.03 }));

  it('accepts a spotdiff', () => {
    expect(QUESTION_TYPES.indexOf('spotdiff')).toBe(QUESTION_TYPES.indexOf('jigsaw') + 1);
    expect(qIssues(spotQ())).toEqual([]);
    expect(qIssues(spotQ({ spots: circles(1) }))).toEqual([]);
    expect(qIssues(spotQ({ spots: circles(10) }))).toEqual([]);
    expect(qIssues(spotQ({ timeLimit: 25 }))).toEqual([]);
    expect(LIMITS.minSpotdiffTime).toBe(25);
    expect(LIMITS.defaultSpotdiffTime).toBe(90);
    expect(LIMITS.defaultSpotdiffPoints).toBe(300);
  });

  it('refuses a broken spotdiff', () => {
    expect(qIssues(spotQ({ imageUrl: '/uploads/' + 'c'.repeat(32) + '.jpg' }))).toContain('spotdiff_image');
    const video = { id: 'dQw4w9WgXcQ', start: 0 };
    const audio = { source: 'youtube', id: 'dQw4w9WgXcQ', start: 0, duration: 15 };
    expect(qIssues(spotQ({ video }))).toContain('spotdiff_video');
    expect(qIssues(spotQ({ audio }))).toContain('spotdiff_video');
    expect(qIssues(spotQ({ imageUrl: '/uploads/' + 'c'.repeat(32) + '.jpg', reveal: 'blur' }))).toContain('spotdiff_video');
    expect(qIssues(spotQ({ hint: 'Дивіться в кутах' }))).toContain('spotdiff_hint');
    expect(qIssues(spotQ({ changed: '/uploads/' + 'a'.repeat(32) + '.jpg' }))).toContain('spotdiff_same');
    expect(valid(questionSchema, spotQ({ spots: [] }))).toBe(false);
    expect(valid(questionSchema, spotQ({ spots: circles(11) }))).toBe(false);
    expect(valid(questionSchema, spotQ({ spots: [{ x: 0.5, y: 0.5, r: 0.3 }] }))).toBe(false);
    expect(valid(questionSchema, spotQ({ spots: [{ x: 0.5, y: 0.5, r: 0.01 }] }))).toBe(false);
    expect(valid(questionSchema, spotQ({ spots: [{ x: 1.1, y: 0.5, r: 0.05 }] }))).toBe(false);
    expect(valid(questionSchema, spotQ({ timeLimit: 24 }))).toBe(false);
    expect(valid(questionSchema, spotQ({ timeLimit: 601 }))).toBe(false);
    expect(valid(questionSchema, spotQ({ original: 'https://x/y.jpg' }))).toBe(false);
    expect(valid(questionSchema, spotQ({ aspect: 0.1 }))).toBe(false);
    expect(valid(questionSchema, spotQ({ aspect: 0.49 }))).toBe(false);
    expect(valid(questionSchema, spotQ({ aspect: 3.01 }))).toBe(false);
    expect(valid(questionSchema, spotQ({ aspect: 4 }))).toBe(false);
  });

  it('a spotdiff aspect on the edges 0.5 and 3 parses', () => {
    expect(SPOT_MIN_ASPECT).toBe(0.5);
    expect(SPOT_MAX_ASPECT).toBe(3);
    expect(qIssues(spotQ({ aspect: 0.5 }))).toEqual([]);
    expect(qIssues(spotQ({ aspect: 3 }))).toEqual([]);
  });

  it('a spotdiff plays only in classic and puzzles rounds', () => {
    const blitzRound = { id: 'bl', type: 'blitz', title: '', shuffleOptions: false, answerWindow: 15, attempts: 1, check: 'auto',
      rules: { ...DEFAULT_RULES, partial: null }, questions: [spotQ({ id: 'sb' })] };
    const final = { id: 'f', type: 'final', title: '', shuffleOptions: false, check: 'auto', questions: [spotQ({ id: 'sf' })] };
    const bets = { id: 'bt', type: 'bets', title: '', shuffleOptions: false, check: 'auto', betStart: 200, betStep: 100, betMax: 600,
      questions: [{ ...spotQ({ id: 'sbt' }), betsCut: 2 }] };
    const auction = { id: 'au', type: 'auction', title: '', shuffleOptions: false, check: 'auto', bidMode: 'step', bidStep: 50, loss: 'bid',
      questions: [{ ...spotQ({ id: 'sau' }), betsCut: 2 }] };
    const wipeout = { id: 'rw', type: 'wipeout', title: '', shuffleOptions: false,
      questions: [spotQ({ id: 'sw' }), ...[1, 2, 3, 4].map((n) => ({ ...single, id: `w${n}` }))] };
    const survival = { id: 'rs', type: 'survival', title: '', speedBonus: false, shuffleOptions: false, rules: DEFAULT_RULES,
      questions: [spotQ({ id: 'ssv' }), { ...single, id: 's2' }, { ...single, id: 's3' }], trials: [], trial: 'luck', survivors: 1, bonus: 500 };
    const four = (id: string) => ({ ...single, id, options: ['a', 'b', 'c', 'd'].map((o) => ({ id: o, text: o.toUpperCase() })), correctId: 'b' });
    const ladder = { id: 'rl', type: 'ladder', title: '', shuffleOptions: false, questions: [spotQ({ id: 'sl' }), ...[2, 3, 4, 5].map((n) => four(`l${n}`))],
      levels: [100, 300, 1000, 3000, 10000], safe: [2], pick: 'host', lifelines: ['fifty'], timer: false };
    for (const bad of [blitzRound, final, bets, auction, wipeout, survival, ladder]) {
      expect(issues(quizOf([round('r', [single]), bad]))).toContain('spotdiff_place');
    }
    const board = { id: 'b', type: 'board', title: '', shuffleOptions: false, answerMode: 'phone', check: 'auto', rules: DEFAULT_RULES,
      categories: [1, 2, 3].map((n) => ({ id: `c${n}`, title: `К${n}`, cells: [1, 2, 3].map((m) => ({ mark: 'none',
        question: n === 1 && m === 1 ? spotQ({ id: 'sc' }) : { ...single, id: `q${n}${m}` } })) })) };
    expect(issues(quizOf([board]))).toContain('spotdiff_place');
    const trial = { ...survival, questions: [single, { ...single, id: 's2' }, { ...single, id: 's3' }], trial: 'question', trials: [spotQ({ id: 'st' })] };
    expect(issues(quizOf([round('r', [single]), trial]))).toContain('spotdiff_place');
    expect(issues({ ...quizOf([round('r', [single])]), spares: [spotQ({ id: 'ss' })] })).toContain('spare_type');
    expect(valid(duelQuestionSchema, spotQ())).toBe(false);
    // класика й «Головоломки» приймають
    expect(issues(quizOf([round('c', [spotQ({ id: 'sc2' })])]))).toEqual([]);
    expect(issues(quizOf([puzzles([spotQ({ id: 'sa' })])]))).toEqual([]);
    const sudoku = { id: 'su', type: 'sudoku', text: 'Судоку', imageUrl: null, video: null, timeLimit: 180, points: 300, level: 'medium', seed: 3, ...generateSudoku(3, 'medium') };
    expect(issues(quizOf([puzzles([sudoku, spotQ({ id: 'sb2' })])]))).toEqual([]);
    expect(fitsPuzzlesRound(spotQ() as never)).toBe(true);
    expect(isPuzzle(spotQ() as never)).toBe(false);
  });

  it('the round brief of puzzles counts spotdiffs', () => {
    const parsed = roundSchema.parse(puzzles([spotQ({ id: 'a' }), spotQ({ id: 'b' })]));
    expect(roundBrief(parsed).puzzles).toEqual({ sudoku: 0, crossword: 0, jigsaw: 0, spotdiff: 2, time: 180 });
  });

  it('old quizzes still parse', () => {
    const parsed = quizSchema.safeParse(quizOf([round('r', [single])]));
    expect(parsed.success).toBe(true);
    expect(JSON.stringify(parsed.data)).not.toContain('spotdiff');
  });

  it('the spotdiff event is limited', () => {
    const tap = { questionIndex: 7, x: 0.5, y: 0.5, width: 320 };
    expect(valid(spotdiffTapSchema, tap)).toBe(true);
    expect(valid(spotdiffTapSchema, { ...tap, width: 59 })).toBe(false);
    expect(valid(spotdiffTapSchema, { ...tap, width: 4001 })).toBe(false);
    expect(valid(spotdiffTapSchema, { ...tap, width: 60 })).toBe(true);
    expect(valid(spotdiffTapSchema, { ...tap, width: 4000 })).toBe(true);
    expect(valid(spotdiffTapSchema, { ...tap, x: -0.1 })).toBe(false);
    expect(valid(spotdiffTapSchema, { ...tap, y: 1.1 })).toBe(false);
    expect(valid(spotdiffTapSchema, { ...tap, extra: 1 })).toBe(false);
    expect(valid(spotdiffTapSchema, { ...tap, questionIndex: -1 })).toBe(false);
    expect(SPOTDIFF_TAPS_PER_SECOND).toBe(6);
    expect(SPOTDIFF_MISSES).toBe(3);
    expect(SPOTDIFF_FREEZE_MS).toBe(1000);
    expect(SPOTDIFF_MAX_FREEZE_MS).toBe(5000);
    expect([0, 1, 2, 3, 4, 5, 6, 7, 10].map(spotdiffFreezeMs)).toEqual([0, 0, 0, 1000, 2000, 3000, 4000, 5000, 5000]);
    expect(valid(answerSchema, { type: 'spotdiff', found: 1, total: 3, done: false, timeMs: null })).toBe(false);
  });
});
