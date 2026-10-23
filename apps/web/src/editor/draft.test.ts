// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { loadDraft, saveDraft } from './draft-storage';
import { DEFAULT_RULES, duelShortfall, duelThreshold, rulesOf, boardCells, quizSchema, roundSchema, questionsOf, roundQuestions, type BoardRound, type ClassicRound, type Question, type Quiz, type Duels } from '@quiz/shared';
import { t } from '../i18n';
import { QUESTION_TYPES, questionTypesFor, applyRoundTime, changeType, cleaned, duplicateQuestion, firstProblem, moveItem, newBlitzRound, newBoardCategory, newBoardQuestion, newBoardRound, withDefaultMode, newClassicRound, newFinalRound, newQuestion, newQuiz, problemsOf, newDuels } from './draft';

/** Заповнює порожні поля нового запитання так, як це зробив би користувач. */
function filled(question: Question): Question {
  const text = 'Запитання?';
  switch (question.type) {
    case 'single':
    case 'multi':
      return { ...question, text, options: question.options.map((o, i) => ({ ...o, text: `Варіант ${i + 1}` })) };
    case 'order':
      return { ...question, text, items: question.items.map((o, i) => ({ ...o, text: `Елемент ${i + 1}` })) };
    case 'match':
      return {
        ...question,
        text,
        pairs: question.pairs.map((pair, i) => ({
          left: { ...pair.left, text: `Ліве ${i + 1}` },
          right: { ...pair.right, text: `Праве ${i + 1}` },
        })),
      };
    case 'text':
      return { ...question, text, accepted: ['Відповідь'] };
    case 'chain':
      return { ...question, text, words: ['Форель', 'Риба', 'Океан'] };
    case 'sort':
      return {
        ...question,
        text,
        categories: question.categories.map((c, i) => ({ ...c, text: `Категорія ${i + 1}` })),
        words: question.words.map((w, i) => ({ ...w, text: `Слово ${i + 1}` })),
      };
    default:
      return { ...question, text };
  }
}

const quizWith = (...questions: Question[]): Quiz => {
  const quiz = newQuiz();
  return { ...quiz, title: 'Гра', rounds: [{ ...newClassicRound(), questions }] };
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
    expect(first.timeLimit).toBe(30);
    expect(first.points).toBe(1000);
    expect(first.id).not.toBe(second.id);
    if (first.type === 'single') expect(new Set(first.options.map((o) => o.id)).size).toBe(first.options.length);
  });
});

describe('changeType', () => {
  it('keeps the question text, time and points', () => {
    const source = { ...newQuestion('single'), text: 'Скільки?', timeLimit: 45, points: 500 };
    // Сортування має власні час і бали за слово: його перевіряє окремий тест нижче.
    for (const type of QUESTION_TYPES.filter((candidate) => candidate !== 'sort')) {
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
      expect({ ...copy, id: '', options: undefined, items: undefined, pairs: undefined, categories: undefined, words: undefined, correctId: undefined, correctIds: undefined }, type).toEqual({
        ...source,
        id: '',
        options: undefined,
        items: undefined,
        pairs: undefined,
        categories: undefined,
        words: undefined,
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
    return quizWith({ id: 'q1', type: 'single', text: 'Питання?', imageUrl: null, video: null, timeLimit: 20, points: 1000, options, correctId: `o${correct}` });
  };

  it('drops an empty option left after the last Enter instead of refusing to save', () => {
    const quiz = single(['Львів', 'Київ', '  '], 1);
    expect(problemsOf(quiz)).toEqual([]);
    const [question] = questionsOf(cleaned(quiz));
    expect(question.type === 'single' && question.options.map((option) => option.text)).toEqual(['Львів', 'Київ']);
  });

  it('cleaned keeps a picture-only option and drops an empty spare', () => {
    const pic = '/uploads/abcdefabcdefabcd.png';
    const quiz = single(['Львів', '', '', ''], 0);
    const [first] = questionsOf(quiz);
    if (first.type !== 'single') throw new Error('single');
    first.options[1] = { ...first.options[1], imageUrl: pic };
    first.options[2] = { ...first.options[2], text: '  ', imageUrl: pic };
    expect(problemsOf(quiz)).toEqual([]);
    const [question] = questionsOf(cleaned(quiz));
    expect(question.type === 'single' && question.options).toEqual([
      { id: 'o0', text: 'Львів' },
      { id: 'o1', text: '', imageUrl: pic },
      { id: 'o2', text: '', imageUrl: pic },
    ]);
    expect(quizSchema.safeParse(cleaned(quiz)).success).toBe(true);
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
          video: null,
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
          video: null,
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
    const quiz: Quiz = quizWith({ id: 'q1', type: 'order', text: 'Порядок?', imageUrl: null, video: null, timeLimit: 20, points: 1000, items });
    expect(problemsOf(quiz)).toEqual(['Запитання 1: заповніть усі варіанти або приберіть порожні.']);
  });

  it('drops empty items at the end of an order question while at least three remain', () => {
    const items = ['Один', 'Два', 'Три', ''].map((text, index) => ({ id: `i${index}`, text }));
    const quiz: Quiz = quizWith({ id: 'q1', type: 'order', text: 'Порядок?', imageUrl: null, video: null, timeLimit: 20, points: 1000, items });
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
    expect(roundQuestions(quiz.rounds[0])).toHaveLength(1);
    expect(roundQuestions(quiz.rounds[0])[0].type).toBe('single');
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
    expect(firstProblem(withTwo)).toEqual({ round: 1, question: 0, cell: null });
  });

  it('rejects rules outside the allowed ranges', () => {
    const quiz = quizWith(filled(newQuestion('boolean')));
    const bad: Quiz = {
      ...quiz,
      rounds: [{ ...newClassicRound(), questions: roundQuestions(quiz.rounds[0]), rules: { ...DEFAULT_RULES, partial: Number.NaN } }],
    };
    expect(problemsOf(bad)).toHaveLength(1);
  });
});

describe('draft storage', () => {
  it('a draft without a wager mode loads as classic', () => {
    const final = { id: 'f1', type: 'final', title: '', shuffleOptions: false, check: 'auto', questions: [{ ...filled(newQuestion('boolean')), id: 'q1' }] };
    sessionStorage.setItem('quiz:draft:nomode', JSON.stringify({ title: 'Т', description: '', settings: { leaderboard: 'end' }, rounds: [final] }));
    expect(loadDraft('nomode')?.rounds[0]).toMatchObject({ type: 'final', wagerMode: 'classic' });
  });

  it('a draft keeps power settings and drops unknown kinds', () => {
    const round = { id: 'r1', type: 'classic', title: '', rules: DEFAULT_RULES, questions: [{ ...filled(newQuestion('boolean')), id: 'q1' }] };
    const load = (id: string, settings: unknown) => {
      sessionStorage.setItem(`quiz:draft:${id}`, JSON.stringify({ title: 'Т', description: '', settings, rounds: [round] }));
      return loadDraft(id)!.settings;
    };
    expect(load('p1', { leaderboard: 'end', debuffs: ['fog', 'rain'], buffs: ['double', 'magic'] })).toEqual({
      leaderboard: 'end',
      debuffs: ['fog'],
      buffs: ['double'],
    });
    expect(load('p2', { leaderboard: 'end' })).toEqual({ leaderboard: 'end' });
    expect(load('p3', { leaderboard: 'end', debuffs: 'fog', buffs: 5 })).toEqual({ leaderboard: 'end' });
  });

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
    expect(roundQuestions(quiz!.rounds[0])[0].id).toBe('q1');
  });

  it('does not put the shared DEFAULT_RULES into editor state', () => {
    sessionStorage.setItem(
      'quiz:draft:shared',
      JSON.stringify({ title: 'Стара', description: '', settings: {}, questions: [filled(newQuestion('boolean'))] }),
    );
    const rules = rulesOf(loadDraft('shared')!.rounds[0]);
    expect(rules).toEqual(DEFAULT_RULES);
    expect(rules).not.toBe(DEFAULT_RULES);
  });

  it('fills in fields that an old draft lacks', () => {
    sessionStorage.setItem(
      'quiz:draft:bare',
      JSON.stringify({ title: 'Стара', description: '', settings: {}, questions: [filled(newQuestion('boolean'))] }),
    );
    const quiz = loadDraft('bare');
    expect(quiz?.settings.leaderboard).toBe('each');
    expect(quiz?.rounds[0]).toMatchObject({ speedBonus: true, shuffleOptions: false });
  });

  it('round-trips a draft with rounds and keeps NaN fields editable', () => {
    const quiz = quizWith({ ...(newQuestion('numeric') as Extract<Question, { type: 'numeric' }>), correct: Number.NaN });
    saveDraft('new-format', quiz);
    const back = loadDraft('new-format');
    expect(roundQuestions(back!.rounds[0])[0]).toMatchObject({ type: 'numeric' });
    const question = roundQuestions(back!.rounds[0])[0];
    expect(question?.type === 'numeric' && Number.isNaN(question.correct)).toBe(true);
  });

  it('ignores garbage', () => {
    sessionStorage.setItem('quiz:draft:junk', JSON.stringify({ title: 1 }));
    expect(loadDraft('junk')).toBeNull();
  });
});

describe('blitz drafts', () => {
  it('newBlitzRound passes the round schema', () => {
    // Як і в класичного, порожні тексти запитання мають бути заповнені.
    const round = newBlitzRound();
    expect(roundSchema.safeParse({ ...round, questions: round.questions.map(filled) }).success).toBe(true);
  });

  it('a new blitz round is automatic, without a window, with one attempt', () => {
    expect(newBlitzRound()).toMatchObject({ check: 'auto', answerWindow: null, attempts: 1 });
  });

  it('a saved blitz draft comes back unchanged', () => {
    const quiz: Quiz = { ...newQuiz(), title: 'Гра', rounds: [newClassicRound(), newBlitzRound()] };
    saveDraft(undefined, quiz);
    expect(loadDraft(undefined)).toEqual(quiz);
  });
});

/** Заповнює порожнє поле так, як це зробив би користувач. */
const filledBoard = (round: BoardRound = newBoardRound()): BoardRound => ({
  ...round,
  categories: round.categories.map((category, ci) => ({
    ...category,
    title: `Категорія ${ci + 1}`,
    cells: category.cells.map((cell) => ({ ...cell, question: filled(cell.question) })),
  })),
});
const boardQuiz = (round: BoardRound): Quiz => ({ ...newQuiz(), title: 'Гра', rounds: [round] });

describe('board rounds', () => {
  it('newBoardRound is a 3 by 3 board that passes the schema once filled', () => {
    const round = newBoardRound();
    expect(round.categories).toHaveLength(3);
    for (const category of round.categories) {
      expect(category.cells.map((cell) => cell.question.points)).toEqual([100, 200, 300]);
      expect(category.cells.every((cell) => cell.mark === 'none' && cell.question.type === 'single')).toBe(true);
    }
    expect(round).toMatchObject({ answerMode: 'phone', check: 'auto', shuffleOptions: false });
    expect(round.rules).toEqual(DEFAULT_RULES);
    expect(roundSchema.safeParse(round).success).toBe(false);
    expect(roundSchema.safeParse(filledBoard(round)).success).toBe(true);
  });

  it('newBoardQuestion continues the points and stops at the maximum', () => {
    const at = (points: number): Question => ({ ...newQuestion('single'), points });
    expect(newBoardQuestion(at(300)).points).toBe(400);
    expect(newBoardQuestion(at(2000)).points).toBe(2000);
    expect(newBoardQuestion(at(1950)).points).toBe(2000);
    expect(newBoardQuestion(undefined).points).toBe(100);
  });

  it('a saved board draft comes back unchanged', () => {
    const round = filledBoard();
    round.categories[0].cells[1].mark = 'x3';
    const quiz = boardQuiz(round);
    saveDraft('board', quiz);
    expect(loadDraft('board')).toEqual(quiz);
  });

  it('a board draft with a bad mark or a blank number is repaired on load', () => {
    const round = filledBoard();
    const quiz = boardQuiz(round);
    const raw = JSON.parse(JSON.stringify(quiz));
    raw.rounds[0].categories[0].cells[0].mark = 'x9';
    raw.rounds[0].categories[0].cells[0].question.points = null;
    sessionStorage.setItem('quiz:draft:broken', JSON.stringify(raw));
    const loaded = loadDraft('broken');
    const [cell] = (loaded?.rounds[0] as BoardRound).categories[0].cells;
    expect(cell.mark).toBe('none');
    expect(cell.question.points).toBeNaN();
    expect(loaded?.rounds[0]).not.toHaveProperty('questions');
  });

  it('problemsOf names the category and question of a broken board cell', () => {
    const round = filledBoard();
    round.categories[1].cells[2].question = { ...round.categories[1].cells[2].question, text: '' };
    const problems = problemsOf(boardQuiz(round));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('Категорія 2');
    expect(problems[0]).toContain('запитання 3');
  });

  it('problemsOf reports a category without a name', () => {
    const round = filledBoard();
    round.categories[0].title = '  ';
    expect(problemsOf(boardQuiz(round))).toEqual(['Категорія 1: немає назви.']);
  });

  it('cleaned trims category titles', () => {
    const round = filledBoard();
    round.categories[0].title = '  Історія ';
    const [round0] = cleaned(boardQuiz(round)).rounds;
    expect((round0 as BoardRound).categories[0].title).toBe('Історія');
  });

  it('firstProblem points at the board cell', () => {
    const round = filledBoard();
    round.categories[1].cells[2].question = { ...round.categories[1].cells[2].question, text: '' };
    const quiz: Quiz = { ...newQuiz(), title: 'Гра', rounds: [filled0(), round] };
    expect(firstProblem(quiz)).toEqual({ round: 1, question: 5, cell: { category: 1, index: 2 } });
    expect(roundQuestions(round)[5].text).toBe('');
  });

  it('firstProblem on a classic round has no cell', () => {
    expect(firstProblem(newQuiz())).toEqual({ round: 0, question: 0, cell: null });
  });
});

function filled0() {
  const round = newClassicRound();
  return { ...round, questions: round.questions.map(filled) };
}

describe('applyRoundTime', () => {
  it('sets the time of every question in a classic round and every board cell', () => {
    const base = newClassicRound();
    const classic = { ...base, questions: [{ ...newQuestion('single'), timeLimit: 10 }, { ...newQuestion('boolean'), timeLimit: 60 }] };
    const applied = applyRoundTime(classic, 45);
    expect(applied).toEqual({ ...classic, questions: classic.questions.map((q) => ({ ...q, timeLimit: 45 })) });

    const board = newBoardRound();
    const after = applyRoundTime(board, 90);
    if (after.type !== 'board') throw new Error('unexpected type');
    expect(boardCells(after).every((c) => c.cell.question.timeLimit === 90)).toBe(true);
    expect(boardCells(after).map((c) => [c.cell.mark, c.cell.question.points])).toEqual(
      boardCells(board).map((c) => [c.cell.mark, c.cell.question.points]),
    );
  });
});

describe('video questions in the draft', () => {
  const v = { id: 'dQw4w9WgXcQ', start: 30 };

  it('the same time for the round skips video questions', () => {
    const a = { ...newQuestion('single'), timeLimit: 20 };
    const b = { ...newQuestion('boolean'), timeLimit: 25, video: v };
    const classic = { ...newClassicRound(), questions: [a, b] };
    const applied = applyRoundTime(classic, 40);
    expect(applied).toEqual({ ...classic, questions: [{ ...a, timeLimit: 40 }, b] });

    const board = newBoardRound();
    const first = boardCells(board)[0].cell.question;
    const marked = {
      ...board,
      categories: board.categories.map((category, ci) => ({
        ...category,
        cells: category.cells.map((cell, i) => (ci === 0 && i === 0 ? { ...cell, question: { ...cell.question, video: v, timeLimit: 33 } } : cell)),
      })),
    };
    const after = applyRoundTime(marked, 90);
    if (after.type !== 'board') throw new Error('unexpected type');
    const cells = boardCells(after);
    expect(cells[0].cell.question.timeLimit).toBe(33);
    expect(cells.slice(1).every((c) => c.cell.question.timeLimit === 90)).toBe(true);
    expect(first.video).toBeNull();
  });

  it('a new question has no video and changing its type keeps the video', () => {
    expect(newQuestion('single').video).toBeNull();
    expect(changeType({ ...newQuestion('single'), video: v }, 'text').video).toEqual(v);
  });

  it('a stored draft keeps a valid video and drops anything else', () => {
    const load = (video: unknown) => {
      const quiz = quizWith({ ...newQuestion('boolean'), text: 'Так?', ...(video === undefined ? {} : { video }) } as Question);
      if (video === undefined) delete (quiz.rounds[0] as { questions: Record<string, unknown>[] }).questions[0].video;
      sessionStorage.setItem('quiz:draft:vid', JSON.stringify(quiz));
      return roundQuestions(loadDraft('vid')!.rounds[0])[0].video;
    };
    expect(load(v)).toEqual(v);
    expect(load({ url: 'x' })).toBeNull();
    expect(load(undefined)).toBeNull();
  });
});

describe('match questions', () => {
  const pairsOf = (question: Question) => {
    if (question.type !== 'match') throw new Error('unexpected type');
    return question.pairs;
  };
  let n = 0;
  const withPairs = (texts: [string, string][]): Question => {
    const base = newQuestion('match');
    const pairs = texts.map(([l, r]) => ({ left: { id: `l${++n}`, text: l }, right: { id: `r${++n}`, text: r } }));
    return { ...base, text: 'Запитання?', pairs } as Question;
  };

  it('a new match question has three empty pairs with distinct ids', () => {
    const pairs = pairsOf(newQuestion('match'));
    expect(pairs).toHaveLength(3);
    expect(new Set(pairs.flatMap((p) => [p.left.id, p.right.id])).size).toBe(6);
    expect(pairs.every((p) => p.left.text === '' && p.right.text === '')).toBe(true);
  });

  it('a duplicated match question gets new ids for both columns', () => {
    const source = filled(newQuestion('match'));
    const copy = duplicateQuestion(source);
    const before = pairsOf(source).flatMap((p) => [p.left.id, p.right.id]);
    const after = pairsOf(copy).flatMap((p) => [p.left.id, p.right.id]);
    expect(new Set(after).size).toBe(6);
    expect(after.filter((id) => before.includes(id))).toEqual([]);
    expect(pairsOf(copy).map((p) => [p.left.text, p.right.text])).toEqual(pairsOf(source).map((p) => [p.left.text, p.right.text]));
  });

  it('cleaned drops trailing empty pairs but keeps three', () => {
    const five = withPairs([['а', 'б'], ['в', 'г'], ['д', 'е'], ['', ''], ['', '']]);
    expect(pairsOf(questionsOf(cleaned(quizWith(five)))[0])).toHaveLength(3);
    const emptyThird = withPairs([[' а ', 'б'], ['в', 'г'], ['', '']]);
    const result = pairsOf(questionsOf(cleaned(quizWith(emptyThird)))[0]);
    expect(result).toHaveLength(3);
    expect(result[0].left.text).toBe('а');
    const halfEmpty = withPairs([['а', 'б'], ['в', 'г'], ['д', 'е'], ['ж', '']]);
    expect(pairsOf(questionsOf(cleaned(quizWith(halfEmpty)))[0])).toHaveLength(4);
  });

  it('a match pair with an empty side is a problem', () => {
    const question = withPairs([['а', 'б'], ['в', ''], ['д', 'е']]);
    expect(problemsOf(quizWith(question))).toContain(t('problemEmptyPair', { index: 1 }));
  });
});

describe('board cell kinds and modes', () => {
  it('a new category gets the given answer mode in every cell', () => {
    const category = newBoardCategory('voice');
    expect(category.cells.every((c) => c.answerMode === 'voice' && c.kind === 'normal' && c.penalty === 'none')).toBe(true);
  });

  it('changing the round default keeps the modes of existing cells', () => {
    const round = newBoardRound();
    const [a, b] = round.categories[0].cells;
    const { answerMode: _drop, ...bare } = a;
    round.categories[0].cells = [bare, { ...b, answerMode: 'voice' }, round.categories[0].cells[2]];
    const next = withDefaultMode(round, 'voice');
    expect(next.answerMode).toBe('voice');
    expect(next.categories[0].cells[0].answerMode).toBe('phone');
    expect(next.categories[0].cells[1].answerMode).toBe('voice');
  });

  it('a stored draft keeps cell kinds, modes and penalties', () => {
    const round = newBoardRound();
    const [a, b, c] = round.categories[0].cells;
    round.categories[0].cells = [
      { ...a, kind: 'blitz', answerMode: 'voice', penalty: 'all' },
      { ...b, kind: 'mega' as never, answerMode: 'loud' as never, penalty: 'huge' as never },
      c,
    ];
    saveDraft('cells', { ...newQuiz(), title: 'Гра', rounds: [round] });
    const back = loadDraft('cells')!.rounds[0] as BoardRound;
    expect(back.categories[0].cells[0]).toMatchObject({ kind: 'blitz', answerMode: 'voice', penalty: 'all' });
    expect(back.categories[0].cells[1]).toMatchObject({ kind: 'normal', penalty: 'none' });
    expect(back.categories[0].cells[1].answerMode).toBeUndefined();
  });
});

describe('final round drafts', () => {
  const withFinal = (question: Question) => {
    const quiz = newQuiz();
    return { ...quiz, title: 'Гра', rounds: [{ ...newClassicRound(), questions: [filled(newQuestion('single'))] }, { ...newFinalRound(), title: 'Космос', questions: [question] }] } as Quiz;
  };

  it('newFinalRound passes the schema once its question is filled', () => {
    const round = newFinalRound();
    expect(round).toMatchObject({ type: 'final', title: '', shuffleOptions: false, check: 'auto', wagerMode: 'classic' });
    expect(round.questions).toHaveLength(1);
    const quiz = withFinal(filled(round.questions[0]));
    expect(problemsOf(quiz)).toEqual([]);
    expect(quizSchema.safeParse(cleaned(quiz)).success).toBe(true);
  });

  it('a saved final draft comes back unchanged', () => {
    const quiz = withFinal(filled(newQuestion('single')));
    saveDraft('final-draft', quiz);
    const back = loadDraft('final-draft');
    expect(back!.rounds[1]).toEqual(quiz.rounds[1]);
    expect('rules' in back!.rounds[1]).toBe(false);
  });

  it('problemsOf names the final question problem without checking rules', () => {
    const problems = problemsOf(withFinal(newQuestion('single')));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('Раунд 2');
    expect(problems[0]).toContain('Запитання 1');
    expect(problems.join()).not.toContain(t('problemRules'));
  });
});

describe('chain questions', () => {
  const chain = (patch: object = {}) => ({ ...newQuestion('chain'), text: 'Q?', ...patch }) as Question;

  it('a new chain question has three empty words, a 5 s hint and no video', () => {
    expect(newQuestion('chain')).toMatchObject({ type: 'chain', words: ['', '', ''], hintSeconds: 5, video: null });
  });

  it('cleaned trims chain words and drops trailing empty ones but keeps three', () => {
    const words = (list: string[]) => {
      const out = cleaned(quizWith(chain({ words: list }))).rounds[0];
      const q = (out as { questions: Question[] }).questions[0];
      return q.type === 'chain' ? q.words : null;
    };
    expect(words(['Форель', ' Риба ', 'Біла   Церква', '', ''])).toEqual(['Форель', 'Риба', 'Біла Церква']);
    expect(words(['Форель', '', ''])).toEqual(['Форель', '', '']);
    expect(words(['Форель', 'Гай'.normalize('NFD'), 'Океан'])).toEqual(['Форель', 'Гай', 'Океан']);
  });

  it('chain problems: an empty word, a word with digits, a hint out of range', () => {
    const problems = (patch: object) => problemsOf(quizWith(chain({ words: ['Форель', 'Риба', 'Океан'], ...patch })));
    expect(problems({})).toEqual([]);
    expect(problems({ words: ['Форель', '', 'Океан'] })).toEqual([t('problemEmptyWord', { index: 1 })]);
    expect(problems({ words: ['Форель', 'R2D2', 'Океан'] })).toEqual([t('problemChainWord', { index: 1 })]);
    expect(problems({ hintSeconds: 0 })).toEqual([t('problemHintSeconds', { index: 1 })]);
    expect(problems({ words: ['Форель', 'Гай'.normalize('NFD'), 'Океан'] })).toEqual([]);
  });

  it('blitz and board rounds offer no chain type', () => {
    expect(questionTypesFor('classic')).toContain('chain');
    expect(questionTypesFor('final')).toContain('chain');
    expect(questionTypesFor('blitz')).not.toContain('chain');
    expect(questionTypesFor('board')).not.toContain('chain');
  });

  it('switching a question with a video to a chain drops the video', () => {
    const withVideo = { ...newQuestion('single'), video: { id: 'dQw4w9WgXcQ', start: 0 } };
    expect(changeType(withVideo, 'chain')).toMatchObject({ type: 'chain', video: null });
  });

  it('duplicating a chain copies its words', () => {
    const copy = duplicateQuestion(chain({ words: ['A1', 'B2', 'C3'] }));
    expect(copy.type === 'chain' && copy.words).toEqual(['A1', 'B2', 'C3']);
  });
});

describe('sort questions in the editor', () => {
  type Sort = Extract<Question, { type: 'sort' }>;
  const shared = newQuestion('sort') as Sort;
  const sortQ = (patch: Partial<Sort> = {}): Sort => {
    const base = shared;
    return {
      ...base,
      text: 'Розкладіть',
      categories: base.categories.map((category, i) => ({ ...category, text: `Кат ${i + 1}` })),
      words: base.words.map((word, i) => ({ ...word, text: `Слово${i + 1}` })),
      ...patch,
    };
  };
  const problemFor = (question: Question) => problemsOf(quizWith(question));

  it('sort is offered in every round type', () => {
    for (const type of ['classic', 'blitz', 'board', 'final'] as const) expect(questionTypesFor(type)).toContain('sort');
    expect(questionTypesFor('classic')).toContain('chain');
    expect(questionTypesFor('board')).not.toContain('chain');
  });

  it('a new sort question is valid once its texts are filled', () => {
    const question = newQuestion('sort') as Sort;
    expect(question.categories).toHaveLength(2);
    expect(question.words).toHaveLength(4);
    expect(question.words.map((word) => word.categoryId)).toEqual([0, 1, 0, 1].map((i) => question.categories[i].id));
    expect(question.points).toBe(100);
    expect(question.lockSeconds).toBe(3);
    expect(question.timeLimit).toBeGreaterThanOrEqual(60);
    expect(problemFor(question)).not.toEqual([]);
    expect(problemFor(sortQ())).toEqual([]);
  });

  it('cleaning a sort trims texts and drops blank trailing words above the minimum', () => {
    const base = sortQ();
    const extra = [4, 5].map((i) => ({ id: `x${i}`, text: '', categoryId: base.categories[0].id }));
    const question = sortQ({
      categories: base.categories.map((category) => ({ ...category, text: ` ${category.text} ` })),
      words: [...base.words.map((word) => ({ ...word, text: ` ${word.text} ` })), ...extra],
    });
    const [result] = questionsOf(cleaned(quizWith(question))) as Sort[];
    expect(result.words).toHaveLength(4);
    expect(result.words[0].text).toBe('Слово1');
    expect(result.categories[0].text).toBe('Кат 1');
  });

  it('sort problems name the cause', () => {
    const base = sortQ();
    const [a, b] = base.categories;
    expect(problemFor(sortQ({ words: base.words.map((w, i) => (i === 0 ? { ...w, text: '' } : w)) }))).toEqual([t('problemSortText', { index: 1 })]);
    expect(problemFor(sortQ({ categories: [{ ...a, text: '' }, b] }))).toEqual([t('problemSortText', { index: 1 })]);
    expect(problemFor(sortQ({ words: base.words.map((w) => ({ ...w, categoryId: a.id })) }))).toEqual([t('problemSortCategory', { index: 1 })]);
    expect(problemFor(sortQ({ words: base.words.map((w, i) => ({ ...w, text: i < 2 ? 'Морква' : w.text })) }))).toEqual([t('problemSortDuplicate', { index: 1 })]);
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `w${i}`, text: `С${i}`, categoryId: i % 2 === 0 ? a.id : b.id }));
    expect(problemFor(sortQ({ words: many, points: 101 }))).toEqual([t('problemSortPoints', { index: 1 })]);
    expect(problemFor(sortQ({ lockSeconds: 0 }))).toEqual([t('problemLockSeconds', { index: 1 })]);
  });

  it('a sort draft round-trips with its categories, words and blank number fields', () => {
    const base = sortQ();
    const question = { ...base, lockSeconds: Number.NaN, points: Number.NaN };
    saveDraft('sort-draft', quizWith(question));
    const back = roundQuestions(loadDraft('sort-draft')!.rounds[0])[0];
    expect(back?.type).toBe('sort');
    if (back?.type !== 'sort') return;
    expect(back.categories).toEqual(base.categories);
    expect(back.words).toEqual(base.words);
    expect(back.words.map((word) => word.categoryId)).toEqual(base.words.map((word) => word.categoryId));
    // JSON робить NaN порожнім null: поле має лишитися порожнім числом, а не null.
    expect(Number.isNaN(back.lockSeconds)).toBe(true);
    expect(Number.isNaN(back.points)).toBe(true);
  });

  it('a sort in a final has no hidden per-word price to fix: the saved points fit the limit', () => {
    const [a, b] = sortQ().categories;
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `w${i}`, text: `С${i}`, categoryId: i % 2 === 0 ? a.id : b.id }));
    const question = sortQ({ words: many, points: 150 });
    const quiz: Quiz = { ...newQuiz(), title: 'Гра', rounds: [{ ...newFinalRound(), questions: [question] }] };
    expect(problemsOf(quiz)).toEqual([]);
    const saved = cleaned(quiz);
    expect(roundQuestions(saved.rounds[0])[0]?.points).toBe(100);
    expect(quizSchema.safeParse(saved).success).toBe(true);
    // Поза фіналом ціна за слово видна й перевіряється, як і раніше.
    expect(problemFor(question)).toEqual([t('problemSortPoints', { index: 1 })]);
  });

  it('changing to sort keeps the text and time, sets points per word', () => {
    const single = { ...newQuestion('single'), text: 'Питання', timeLimit: 45, points: 1000 };
    const result = changeType(single, 'sort');
    expect(result).toMatchObject({ type: 'sort', text: 'Питання', timeLimit: 60, points: 100 });
  });
});

const fillDuels = (duels: Duels): Duels => ({
  ...duels,
  categories: duels.categories.map((c) => ({
    ...c,
    title: 'Столиці',
    questions: c.questions.map((q, i) => ({ ...q, text: `Столиця ${i + 1}?`, accepted: ['Київ'] })),
  })),
});
// Два раунди: до останнього є запитання, тож дуель досяжна.
const withDuels = (duels: Duels): Quiz => {
  const quiz = quizWith(filled(newQuestion('boolean')));
  return { ...quiz, rounds: [...quiz.rounds, { ...newClassicRound(), questions: [filled(newQuestion('boolean'))] }], duels };
};

describe('duels in the draft', () => {
  it('new duels are valid once their texts are filled', () => {
    const duels = newDuels();
    expect(duels.categories).toHaveLength(1);
    expect(duels.categories[0].questions).toHaveLength(3);
    expect(duels).toMatchObject({ questionsPerDuel: 3, timeLimit: 30, stake: 300 });
    expect(problemsOf(withDuels(duels)).length).toBeGreaterThan(0);
    const quiz = withDuels(fillDuels(duels));
    expect(problemsOf(quiz)).toEqual([]);
    expect(quizSchema.safeParse(cleaned(quiz)).success).toBe(true);
  });

  it('cleaning duels trims texts, drops blank spellings and blank trailing questions above the need', () => {
    const filledDuels = fillDuels(newDuels());
    const base = filledDuels.categories[0];
    const extra = [
      { id: 'e1', text: '', accepted: [''] },
      { id: 'e2', text: '', accepted: [''] },
    ];
    const quiz = withDuels({
      ...filledDuels,
      categories: [
        {
          ...base,
          title: '  Столиці ',
          questions: [{ ...base.questions[0], text: ' Франція? ', accepted: [' Париж ', ''] }, ...base.questions.slice(1), ...extra],
        },
      ],
    });
    const result = cleaned(quiz).duels!.categories[0];
    expect(result.questions).toHaveLength(3);
    expect(result.title).toBe('Столиці');
    expect(result.questions[0]).toMatchObject({ text: 'Франція?', accepted: ['Париж'] });
  });

  it('duel problems name the cause', () => {
    const ok = fillDuels(newDuels());
    expect(problemsOf(withDuels({ ...ok, questionsPerDuel: 8 }))).toContain(t('problemDuelSettings'));
    expect(problemsOf(withDuels({ ...ok, categories: [{ ...ok.categories[0], title: '' }] }))).toContain(t('problemDuelTitle', { index: 1 }));
    const noSpelling = { ...ok.categories[0], questions: ok.categories[0].questions.map((q, i) => (i === 1 ? { ...q, accepted: [''] } : q)) };
    expect(problemsOf(withDuels({ ...ok, categories: [noSpelling] }))).toContain(t('problemDuelQuestion', { category: 'Столиці', index: 2 }));
    const short = { ...ok.categories[0], questions: ok.categories[0].questions.slice(0, 2) };
    expect(problemsOf(withDuels({ ...ok, categories: [short] }))).toContain('Дуелі, «Столиці»: замало запитань — потрібно щонайменше 3.');
  });

  it('duels that can never start stop saving; the threshold is the one the game uses', () => {
    const duels = fillDuels(newDuels());
    const unreachable = t('problemDuelUnreachable', { needed: 1 });
    // Один раунд без фіналу: до межі немає жодного запитання.
    const single = { ...quizWith(filled(newQuestion('boolean'))), duels };
    expect(duelShortfall(single)).toBe(1);
    expect(problemsOf(single)).toEqual([unreachable]);
    // 1 запитання до межі з 4 не-фінальних: потрібно ⌈4/3⌉ = 2.
    const few = withDuels(duels);
    const last = few.rounds[1] as ClassicRound;
    const lopsided = { ...few, rounds: [few.rounds[0], { ...last, questions: [0, 1, 2].map(() => filled(newQuestion('boolean'))) }] };
    expect(duelThreshold(lopsided)).toBe(2);
    expect(problemsOf(lopsided)).toEqual([t('problemDuelUnreachable', { needed: 2 })]);
    expect(problemsOf(lopsided)[0]).toBe('Дуелі: до останнього раунду (або фіналу) має бути зіграно щонайменше 2 запитань — інакше кнопка дуелі не з’явиться.');
    // З фіналом межа — фінал: один раунд перед ним уже досить.
    const final = { ...newFinalRound(), questions: [filled(newQuestion('single'))] };
    const withFinal = { ...single, rounds: [...single.rounds, final] };
    expect(problemsOf(withFinal)).toEqual([]);
    // Без дуелей перевірки немає.
    const { duels: _omit, ...plain } = single;
    expect(duelShortfall(plain)).toBeNull();
    expect(problemsOf(plain)).toEqual([]);
  });

  it('a quiz without duels has no duel problems', () => {
    expect(problemsOf(quizWith(filled(newQuestion('boolean'))))).toEqual([]);
  });

  it('schema issue codes of duels read as sentences', () => {
    const ok = fillDuels(newDuels());
    const dup = { ...ok.categories[0], id: 'same' };
    const problems = problemsOf(withDuels({ ...ok, categories: [dup, { ...dup, title: 'Інша' }] }));
    expect(problems).toEqual([t('problemDuelDuplicate')]);
  });
});

describe('duel drafts in storage', () => {
  it('a draft keeps its duels; broken duels are dropped', () => {
    const quiz = withDuels(fillDuels(newDuels()));
    saveDraft('withduels', quiz);
    expect(loadDraft('withduels')?.duels).toEqual(quiz.duels);
    sessionStorage.setItem('quiz:draft:brokenduels', JSON.stringify({ ...quiz, duels: 'x' }));
    expect(loadDraft('brokenduels')).not.toBeNull();
    expect('duels' in loadDraft('brokenduels')!).toBe(false);
    saveDraft('noduels', quizWith(filled(newQuestion('boolean'))));
    expect('duels' in loadDraft('noduels')!).toBe(false);
  });

  it('broken duel categories and questions are dropped; no category left means no duels', () => {
    const quiz = withDuels(fillDuels(newDuels()));
    const good = quiz.duels!.categories[0];
    const [q1, q2] = good.questions;
    const mixed = {
      ...quiz.duels,
      categories: [
        null,
        'x',
        { id: 'c0', title: 'Без запитань' },
        { id: 'c1', title: 'Зіпсовані', questions: 'x' },
        { ...good, questions: [q1, null, { id: 'n1', text: 5, accepted: [] }, { id: 'n2', text: 'Без відповідей' }, q2] },
      ],
    };
    sessionStorage.setItem('quiz:draft:mixedduels', JSON.stringify({ ...quiz, duels: mixed }));
    expect(loadDraft('mixedduels')?.duels?.categories).toEqual([{ ...good, questions: [q1, q2] }]);
    const none = { ...quiz.duels, categories: [null, { id: 'c1', title: 'Зіпсовані', questions: {} }] };
    sessionStorage.setItem('quiz:draft:noneduels', JSON.stringify({ ...quiz, duels: none }));
    expect(loadDraft('noneduels')).not.toBeNull();
    expect('duels' in loadDraft('noneduels')!).toBe(false);
  });
});
