// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { loadDraft, saveDraft } from './draft-storage';
import { quizSchema, questionsOf, type Question, type Quiz } from '@quiz/shared';
import { QUESTION_TYPES, changeType, cleaned, duplicateQuestion, firstProblem, moveItem, newClassicRound, newQuestion, newQuiz, problemsOf } from './draft';

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

const quizWith = (...questions: Question[]): Quiz => {
  const quiz = newQuiz();
  return { ...quiz, title: 'Гра', rounds: [{ ...quiz.rounds[0], questions }] };
};

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
    expect(questionsOf(result)[0]).toMatchObject({ text: 'Місто?', accepted: ['Одеса'] });
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

describe('spare empty rows', () => {
  const single = (texts: string[], correct: number): Quiz => {
    const options = texts.map((text, index) => ({ id: `o${index}`, text }));
    return quizWith({ id: 'q1', type: 'single', text: 'Питання?', imageUrl: null, timeLimit: 20, points: 1000, options, correctId: `o${correct}` });
  };

  it('drops an empty option left after the last Enter instead of refusing to save', () => {
    const quiz = single(['Львів', 'Київ', '  '], 1);
    expect(problemsOf(quiz)).toEqual([]);
    const [question] = questionsOf(cleaned(quiz));
    expect(question.type === 'single' && question.options.map((option) => option.text)).toEqual(['Львів', 'Київ']);
  });

  it('still asks to fill the options when too few are left', () => {
    expect(problemsOf(single(['Львів', ''], 0))).toEqual(['Запитання 1: заповніть усі варіанти або приберіть порожні.']);
  });

  it('does not silently drop the option that is marked correct', () => {
    expect(problemsOf(single(['Львів', 'Київ', ''], 2))).toEqual(['Запитання 1: заповніть усі варіанти або приберіть порожні.']);
  });

  it('drops unmarked empty options of a multi-choice question', () => {
    const quiz: Quiz = quizWith({
          id: 'q1',
          type: 'multi',
          text: 'Питання?',
          imageUrl: null,
          timeLimit: 20,
          points: 1000,
          options: [
            { id: 'a', text: 'Київ' },
            { id: 'b', text: '' },
            { id: 'c', text: 'Запоріжжя' },
          ],
          correctIds: ['a', 'c'],
        });
    expect(problemsOf(quiz)).toEqual([]);
    const [question] = questionsOf(cleaned(quiz));
    expect(question.type === 'multi' && [question.options.map((o) => o.id), question.correctIds]).toEqual([
      ['a', 'c'],
      ['a', 'c'],
    ]);
  });

  it('does not silently drop a marked option of a multi-choice question', () => {
    const quiz: Quiz = quizWith({
          id: 'q1',
          type: 'multi',
          text: 'Питання?',
          imageUrl: null,
          timeLimit: 20,
          points: 1000,
          options: [
            { id: 'a', text: 'Київ' },
            { id: 'b', text: 'Львів' },
            { id: 'c', text: '' },
          ],
          correctIds: ['a', 'c'],
        });
    expect(problemsOf(quiz)).toEqual(['Запитання 1: заповніть усі варіанти або приберіть порожні.']);
  });

  it('does not close a gap in the middle of an order question on its own', () => {
    const items = ['Один', '', 'Два', 'Три'].map((text, index) => ({ id: `i${index}`, text }));
    const quiz: Quiz = quizWith({ id: 'q1', type: 'order', text: 'Порядок?', imageUrl: null, timeLimit: 20, points: 1000, items });
    expect(problemsOf(quiz)).toEqual(['Запитання 1: заповніть усі варіанти або приберіть порожні.']);
  });

  it('drops empty items at the end of an order question while at least three remain', () => {
    const items = ['Один', 'Два', 'Три', ''].map((text, index) => ({ id: `i${index}`, text }));
    const quiz: Quiz = quizWith({ id: 'q1', type: 'order', text: 'Порядок?', imageUrl: null, timeLimit: 20, points: 1000, items });
    expect(problemsOf(quiz)).toEqual([]);
    const [question] = questionsOf(cleaned(quiz));
    expect(question.type === 'order' && question.items.map((item) => item.text)).toEqual(['Один', 'Два', 'Три']);
  });
});

describe('rounds', () => {
  it('starts a new quiz with one classic round holding one empty single question', () => {
    const quiz = newQuiz();
    expect(quiz.rounds).toHaveLength(1);
    expect(quiz.rounds[0]).toMatchObject({
      type: 'classic',
      title: '',
      speedBonus: true,
      shuffleOptions: false,
      rules: { penalty: 'none', partial: null, streak: null, multiplier: 1 },
    });
    expect(quiz.rounds[0].questions).toHaveLength(1);
    expect(quiz.rounds[0].questions[0].type).toBe('single');
  });

  it('never shares the default rules object between rounds', () => {
    const a = newClassicRound();
    const b = newClassicRound();
    expect(a.rules).not.toBe(b.rules);
    expect(a.id).not.toBe(b.id);
    a.rules.multiplier = 3;
    expect(newClassicRound().rules.multiplier).toBe(1);
  });

  it('reports problems of later rounds with the round number', () => {
    const quiz = quizWith(filled(newQuestion('boolean')));
    const second = newClassicRound();
    const withTwo: Quiz = { ...quiz, rounds: [...quiz.rounds, second] };
    expect(problemsOf(withTwo)).toEqual(['Раунд 2: Запитання 1: впишіть текст запитання.']);
    expect(firstProblem(withTwo)).toEqual({ round: 1, question: 0 });
  });

  it('rejects rules outside the allowed ranges', () => {
    const quiz = quizWith(filled(newQuestion('boolean')));
    const bad: Quiz = {
      ...quiz,
      rounds: [{ ...quiz.rounds[0], rules: { ...quiz.rounds[0].rules, partial: Number.NaN } }],
    };
    expect(problemsOf(bad)).toHaveLength(1);
  });
});

describe('draft storage', () => {
  it('opens a draft of the old format as a quiz with one round', () => {
    sessionStorage.setItem(
      'quiz:draft:old',
      JSON.stringify({
        title: 'Стара',
        description: '',
        settings: { speedBonus: false, leaderboard: 'end', shuffleOptions: true },
        questions: [{ ...filled(newQuestion('boolean')), id: 'q1' }],
      }),
    );
    const quiz = loadDraft('old');
    expect(quiz?.rounds).toHaveLength(1);
    expect(quiz?.settings).toEqual({ leaderboard: 'end' });
    expect(quiz?.rounds[0]).toMatchObject({ speedBonus: false, shuffleOptions: true });
    expect(quiz?.rounds[0].questions[0].id).toBe('q1');
  });

  it('round-trips a draft with rounds and keeps NaN fields editable', () => {
    const quiz = quizWith({ ...(newQuestion('numeric') as Extract<Question, { type: 'numeric' }>), correct: Number.NaN });
    saveDraft('new-format', quiz);
    const back = loadDraft('new-format');
    expect(back?.rounds[0].questions[0]).toMatchObject({ type: 'numeric' });
    const question = back?.rounds[0].questions[0];
    expect(question?.type === 'numeric' && Number.isNaN(question.correct)).toBe(true);
  });

  it('ignores garbage', () => {
    sessionStorage.setItem('quiz:draft:junk', JSON.stringify({ title: 1 }));
    expect(loadDraft('junk')).toBeNull();
  });
});
