import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ANSWER_WINDOW,
  DEFAULT_RULES,
  DEFAULT_SETTINGS,
  IMAGE_LIMITS,
  answerSchema,
  joinSchema,
  questionSchema,
  questionsOf,
  quizSchema,
  boardRoundIssues,
  cellAnswerMode,
  roundQuestions,
  roundSchema,
  rulesOf,
  type BoardRound,
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

  it('roundQuestions of a final round is its one question', () => {
    const f = roundSchema.parse(finalR('f', [single]));
    expect(roundQuestions(f).map((q) => q.id)).toEqual(['q1']);
  });
});
