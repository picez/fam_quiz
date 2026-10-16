import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  DEFAULT_SETTINGS,
  IMAGE_LIMITS,
  answerSchema,
  joinSchema,
  questionSchema,
  questionsOf,
  quizSchema,
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
