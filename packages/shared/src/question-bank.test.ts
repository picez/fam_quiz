import { describe, expect, it } from 'vitest';
import { QUESTION_TYPES, matchesBankQuery, questionBankQuerySchema, questionSchema, questionSearchText, type Question } from './index';

const parse = (raw: unknown): Question => questionSchema.parse({ imageUrl: null, video: null, timeLimit: 30, points: 1000, ...(raw as object) });

const river = parse({
  id: 'q1',
  type: 'single',
  text: 'Яка річка найдовша в Україні?',
  hint: 'Тече через Київ',
  imageUrl: `/uploads/${'a'.repeat(32)}.png`,
  video: { id: 'dQw4w9WgXcQ', start: 0 },
  options: [
    { id: 'opt-dnipro', text: 'Дніпро' },
    { id: 'opt-dniester', text: 'Дністер' },
  ],
  correctId: 'opt-dnipro',
});

describe('question bank search', () => {
  it('search text covers the question, options, answers and the hint', () => {
    const single = questionSearchText(river);
    for (const part of ['Яка річка найдовша в Україні?', 'Дніпро', 'Дністер', 'Тече через Київ']) expect(single).toContain(part);
    expect(questionSearchText(parse({ id: 'q2', type: 'text', text: 'Найвища гора?', accepted: ['Говерла'] }))).toContain('Говерла');
    expect(questionSearchText(parse({ id: 'q3', type: 'numeric', text: 'Висота Говерли?', correct: 2061, tolerance: 100 }))).toContain('2061');
    const order = questionSearchText(
      parse({
        id: 'q4',
        type: 'order',
        text: 'Із заходу на схід',
        items: [
          { id: 'u', text: 'Ужгород' },
          { id: 'l', text: 'Львів' },
          { id: 'k', text: 'Київ' },
          { id: 'h', text: 'Харків' },
        ],
      }),
    );
    for (const part of ['Ужгород', 'Львів', 'Київ', 'Харків']) expect(order).toContain(part);
    const match = questionSearchText(
      parse({
        id: 'q5',
        type: 'match',
        text: 'Місто і річка',
        pairs: [
          { left: { id: 'a', text: 'Київ' }, right: { id: 'x', text: 'Дніпро' } },
          { left: { id: 'b', text: 'Львів' }, right: { id: 'y', text: 'Полтва' } },
          { left: { id: 'c', text: 'Ужгород' }, right: { id: 'z', text: 'Уж' } },
        ],
      }),
    );
    for (const part of ['Дніпро', 'Полтва', 'Ужгород']) expect(match).toContain(part);
  });

  it('search text skips ids and media', () => {
    const found = questionSearchText(river);
    for (const part of ['/uploads/', 'dQw4w9WgXcQ', 'opt-dnipro', 'q1']) expect(found).not.toContain(part);
  });

  it('matches every word in any case and apostrophe', () => {
    const q = parse({ id: 'q6', type: 'boolean', text: 'Кам’янець-Подільський — місто над Смотричем?', correct: true });
    expect(matchesBankQuery(q, "кам'янець")).toBe(true);
    expect(matchesBankQuery(q, 'СМОТРИЧ місто')).toBe(true);
    expect(matchesBankQuery(q, 'смотрич львів')).toBe(false);
    expect(matchesBankQuery(q, '')).toBe(true);
    expect(matchesBankQuery(q, '   ')).toBe(true);
  });

  it('query schema', () => {
    expect(questionBankQuerySchema.parse({})).toEqual({ q: '', types: [...QUESTION_TYPES], page: 1 });
    expect(questionBankQuerySchema.parse({ q: '  Дніпро ', types: 'single,boolean', page: '2' })).toEqual({ q: 'Дніпро', types: ['single', 'boolean'], page: 2 });
    const bad: unknown[] = [
      { types: 'single,nope' },
      { types: 'single,single' },
      { types: '' },
      { page: '0' },
      { page: 'abc' },
      { q: 'a'.repeat(101) },
      { ownerId: 'x' },
    ];
    for (const raw of bad) expect(questionBankQuerySchema.safeParse(raw).success, JSON.stringify(raw)).toBe(false);
  });
});

describe('question bank search, lists of objects', () => {
  it('finds sort words and think words with their synonyms, not their ids', () => {
    const sort = parse({
      id: 's1',
      type: 'sort',
      text: 'Овочі й фрукти',
      points: 100,
      lockSeconds: 3,
      categories: [
        { id: 'cat-veg', text: 'Овочі' },
        { id: 'cat-fruit', text: 'Фрукти' },
      ],
      words: [
        { id: 'w1', text: 'Морква', categoryId: 'cat-veg' },
        { id: 'w2', text: 'Яблуко', categoryId: 'cat-fruit' },
        { id: 'w3', text: 'Буряк', categoryId: 'cat-veg' },
        { id: 'w4', text: 'Груша', categoryId: 'cat-fruit' },
      ],
    });
    const found = questionSearchText(sort);
    for (const part of ['Морква', 'Яблуко', 'Овочі', 'Фрукти']) expect(found).toContain(part);
    expect(found).not.toContain('cat-veg');
    expect(matchesBankQuery(sort, 'морква')).toBe(true);
    const think = parse({ id: 't1', type: 'think', text: 'Море', points: 0, words: [{ word: 'Хвиля', synonyms: ['Прибій', 'Вал'] }] });
    for (const part of ['Хвиля', 'Прибій', 'Вал']) expect(questionSearchText(think)).toContain(part);
  });
});
