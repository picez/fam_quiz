import { describe, expect, it } from 'vitest';
import { quizSchema, type Question, type Quiz } from '@quiz/shared';
import { QUESTION_TYPES, changeType, cleaned, duplicateQuestion, moveItem, newQuestion, newQuiz, problemsOf } from './draft';

/** Заповнює порожні поля нового запитання так, як це зробив би користувач. */
function filled(question: Question): Question {
  const text = 'Запитання?';
  switch (question.type) {
    case 'single':
    case 'multi':
      return { ...question, text, options: question.options.map((o, i) => ({ ...o, text: `Варіант ${i + 1}` })) };
    case 'order':
      return { ...question, text, items: question.items.map((o, i) => ({ ...o, text: `Елемент ${i + 1}` })) };
    case 'text':
      return { ...question, text, accepted: ['Відповідь'] };
    default:
      return { ...question, text };
  }
}

const quizWith = (...questions: Question[]): Quiz => ({ ...newQuiz(), title: 'Гра', questions });

describe('newQuestion', () => {
  it('creates a question of every type that becomes valid once its texts are filled in', () => {
    for (const type of QUESTION_TYPES) {
      const quiz = quizWith(filled(newQuestion(type)));
      expect(problemsOf(quiz), type).toEqual([]);
      expect(quizSchema.safeParse(cleaned(quiz)).success, type).toBe(true);
    }
  });

  it('uses the default time and points and unique ids', () => {
    const first = newQuestion('single');
    const second = newQuestion('single');
    expect(first.timeLimit).toBe(20);
    expect(first.points).toBe(1000);
    expect(first.id).not.toBe(second.id);
    if (first.type === 'single') expect(new Set(first.options.map((o) => o.id)).size).toBe(first.options.length);
  });
});

describe('changeType', () => {
  it('keeps the question text, time and points', () => {
    const source = { ...newQuestion('single'), text: 'Скільки?', timeLimit: 45, points: 500 };
    for (const type of QUESTION_TYPES) {
      const changed = changeType(source, type);
      expect(changed.type).toBe(type);
      expect([changed.id, changed.text, changed.timeLimit, changed.points]).toEqual([source.id, 'Скільки?', 45, 500]);
    }
  });

  it('keeps the options and the correct one between single and multi choice', () => {
    const single = filled(newQuestion('single'));
    if (single.type !== 'single') throw new Error('unexpected type');
    const picked = { ...single, correctId: single.options[1].id };

    const multi = changeType(picked, 'multi');
    if (multi.type !== 'multi') throw new Error('unexpected type');
    expect(multi.options).toEqual(picked.options);
    expect(multi.correctIds).toEqual([picked.options[1].id]);

    const back = changeType({ ...multi, correctIds: [multi.options[1].id, multi.options[0].id] }, 'single');
    if (back.type !== 'single') throw new Error('unexpected type');
    expect(back.options).toEqual(picked.options);
    expect(back.correctId).toBe(multi.options[0].id);
  });

  it('returns the same question when the type does not change', () => {
    const question = filled(newQuestion('text'));
    expect(changeType(question, 'text')).toBe(question);
  });
});

describe('problemsOf', () => {
  it('asks for a title', () => {
    expect(problemsOf({ ...quizWith(filled(newQuestion('boolean'))), title: '  ' })).toEqual(['Дайте вікторині назву.']);
  });

  it('names the question and the reason', () => {
    const noText = newQuestion('boolean');
    const emptyOption = { ...filled(newQuestion('single')) };
    if (emptyOption.type === 'single') emptyOption.options = [emptyOption.options[0], { ...emptyOption.options[1], text: ' ' }];
    const noCorrect = { ...filled(newQuestion('multi')), correctIds: [] };
    const noAccepted = { ...filled(newQuestion('text')), accepted: ['  ', ''] };
    const badNumber = { ...filled(newQuestion('numeric')), correct: Number.NaN };
    const badTolerance = { ...filled(newQuestion('numeric')), tolerance: -1 };
    const badLimits = { ...filled(newQuestion('boolean')), timeLimit: 3 };
    const emptyItem = filled(newQuestion('order'));
    if (emptyItem.type === 'order') emptyItem.items = emptyItem.items.map((item, i) => (i === 2 ? { ...item, text: '' } : item));

    expect(
      problemsOf(
        quizWith(...([noText, emptyOption, noCorrect, noAccepted, badNumber, badTolerance, badLimits, emptyItem] as Question[])),
      ),
    ).toEqual([
      'Запитання 1: впишіть текст запитання.',
      'Запитання 2: заповніть усі варіанти або приберіть порожні.',
      'Запитання 3: позначте хоча б один правильний варіант.',
      'Запитання 4: впишіть правильну відповідь.',
      'Запитання 5: впишіть правильне число та відхилення (не менше 0).',
      'Запитання 6: впишіть правильне число та відхилення (не менше 0).',
      'Запитання 7: час має бути від 5 до 120 секунд, бали від 0 до 2000.',
      'Запитання 8: заповніть усі варіанти або приберіть порожні.',
    ]);
  });

  it('never lets through a quiz the server would refuse', () => {
    const duplicateText = filled(newQuestion('single'));
    const tooLong = { ...filled(newQuestion('boolean')), text: 'я'.repeat(301) };
    for (const question of [duplicateText, tooLong]) {
      const quiz = quizWith(question);
      const accepted = quizSchema.safeParse(cleaned(quiz)).success;
      expect(problemsOf(quiz).length === 0).toBe(accepted);
    }
  });
});

describe('cleaned', () => {
  it('trims texts and drops blank spellings', () => {
    const question = { ...filled(newQuestion('text')), text: '  Місто?  ', accepted: [' Одеса ', '', '  '] };
    const result = cleaned({ ...quizWith(question), title: '  Гра  ', description: '  опис ' });
    expect(result.title).toBe('Гра');
    expect(result.description).toBe('опис');
    expect(result.questions[0]).toMatchObject({ text: 'Місто?', accepted: ['Одеса'] });
  });
});

describe('duplicateQuestion', () => {
  it('copies every type with fresh ids and the same correct answers', () => {
    for (const type of QUESTION_TYPES) {
      const source = filled(newQuestion(type));
      const copy = duplicateQuestion(source);
      expect(copy.id, type).not.toBe(source.id);
      expect({ ...copy, id: '', options: undefined, items: undefined, correctId: undefined, correctIds: undefined }, type).toEqual({
        ...source,
        id: '',
        options: undefined,
        items: undefined,
        correctId: undefined,
        correctIds: undefined,
      });
    }
  });

  it('points the copy at its own options', () => {
    const single = filled(newQuestion('single'));
    if (single.type !== 'single') throw new Error('unexpected type');
    const copy = duplicateQuestion({ ...single, correctId: single.options[1].id });
    if (copy.type !== 'single') throw new Error('unexpected type');
    expect(copy.options.map((o) => o.text)).toEqual(single.options.map((o) => o.text));
    expect(copy.correctId).toBe(copy.options[1].id);
    expect(single.options.map((o) => o.id)).not.toContain(copy.correctId);

    const multi = filled(newQuestion('multi'));
    if (multi.type !== 'multi') throw new Error('unexpected type');
    const multiCopy = duplicateQuestion({ ...multi, correctIds: [multi.options[1].id, multi.options[0].id] });
    if (multiCopy.type !== 'multi') throw new Error('unexpected type');
    expect(multiCopy.correctIds).toEqual([multiCopy.options[1].id, multiCopy.options[0].id]);
  });
});

describe('moveItem', () => {
  it('moves an item to a new place and leaves the list alone for impossible moves', () => {
    const list = ['а', 'б', 'в', 'г'];
    expect(moveItem(list, 3, 0)).toEqual(['г', 'а', 'б', 'в']);
    expect(moveItem(list, 0, 2)).toEqual(['б', 'в', 'а', 'г']);
    expect(moveItem(list, 1, 1)).toBe(list);
    expect(moveItem(list, -1, 2)).toBe(list);
    expect(moveItem(list, 1, 9)).toBe(list);
    expect(list).toEqual(['а', 'б', 'в', 'г']);
  });
});
