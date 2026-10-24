import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ANSWER_WINDOW,
  DEFAULT_RULES,
  DEFAULT_SETTINGS,
  BUFF_KINDS,
  DEBUFF_KINDS,
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
  revealShare,
  sliderShare,
  allSpares,
  boardSpareSource,
  categorySparesOf,
  quizSchema,
  boardRoundIssues,
  cellAnswerMode,
  roundQuestions,
  roundSchema,
  rulesOf,
  type BoardRound,
  type Question,
  type Quiz,
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
    expect(valid(quizSchema, quiz({ description: 'а'.repeat(200) }))).toBe(true);
    expect(valid(quizSchema, quiz({ description: 'а'.repeat(201) }))).toBe(false);
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

  it('a quiz without power settings allows every debuff and no buff', () => {
    const parsed = quizSchema.parse(baseQuiz);
    expect(parsed.settings.debuffs).toBeUndefined();
    expect(parsed.settings.buffs).toBeUndefined();
    expect(allowedDebuffs(parsed)).toEqual([...DEBUFF_KINDS]);
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
  it('all eight buff kinds are known and ready', () => {
    expect(BUFF_KINDS).toHaveLength(8);
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

describe('type lists', () => {
  it('ROUND_TYPES and QUESTION_TYPES list every schema discriminator in editor order', () => {
    expect(roundSchema.options.map((o) => o.shape.type.value)).toEqual([...ROUND_TYPES]);
    expect(questionSchema.options.map((o) => o.shape.type.value)).toEqual([...QUESTION_TYPES]);
  });
});
