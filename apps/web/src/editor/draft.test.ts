// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { loadDraft, saveDraft } from './draft-storage';
import { DEFAULT_RULES, LIMITS, duelShortfall, duelThreshold, rulesOf, boardCells, quizSchema, roundSchema, questionsOf, roundQuestions, type BoardRound, type ClassicRound, type Question, type Quiz, type Duels } from '@quiz/shared';
import { t } from '../i18n';
import { QUESTION_TYPES, cloudSources, questionTypesFor, applyRoundTime, changeType, cleaned, duplicateQuestion, firstProblem, moveItem, newBlitzRound, newBoardCategory, newBoardQuestion, newBoardRound, withDefaultMode, newClassicRound, newFinalRound, newQuestion, newQuiz, problemsOf, newDuels, newSpare, swapGaps } from './draft';

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
    case 'clues':
      return { ...question, text, clues: ['Раз', 'Два', 'Три'], accepted: ['Відповідь'] };
    case 'chain':
      return { ...question, text, words: ['Форель', 'Риба', 'Океан'] };
    case 'poll':
      return { ...question, text, options: question.options.map((o, i) => ({ ...o, text: `Варіант ${i + 1}` })) };
    case 'wall':
      return {
        ...question,
        text,
        groups: question.groups.map((group, g) => ({
          ...group,
          name: `Зв'язок ${g + 1}`,
          tiles: group.tiles.map((tile, n) => ({ ...tile, text: `Плитка ${g + 1}.${n + 1}` })),
        })),
      };
    case 'survey':
      return { ...question, text, rows: question.rows.map((row, i) => ({ ...row, text: `Відповідь ${i + 1}`, popularity: 10 + i })) };
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

describe('clues and pin in the editor (10c)', () => {
  it('questionTypesFor: blitz has neither, the board has both, the final has neither', () => {
    expect(questionTypesFor('blitz')).not.toContain('clues');
    expect(questionTypesFor('blitz')).not.toContain('pin');
    expect(questionTypesFor('board')).toContain('clues');
    expect(questionTypesFor('board')).toContain('pin');
    expect(questionTypesFor('classic')).toContain('clues');
    expect(questionTypesFor('classic')).toContain('pin');
    expect(questionTypesFor('final')).not.toContain('clues');
    expect(questionTypesFor('final')).not.toContain('pin');
  });

  it('a single with a picture becomes a pin on the world map without the picture', () => {
    const source = { ...newQuestion('single'), imageUrl: '/uploads/aaaaaaaaaaaaaaaaaaaa.png' } as Question;
    const pin = changeType(source, 'pin');
    expect(pin.type === 'pin' && pin.map).toBe('world');
    expect(pin.imageUrl).toBeNull();
  });

  it('a duplicated clues or pin question shares no arrays or points', () => {
    const clues = newQuestion('clues');
    const copy = duplicateQuestion(clues);
    if (clues.type === 'clues' && copy.type === 'clues') {
      expect(copy.id).not.toBe(clues.id);
      expect(copy.clues).not.toBe(clues.clues);
      expect(copy.accepted).not.toBe(clues.accepted);
    }
    const pin = newQuestion('pin');
    const pinCopy = duplicateQuestion(pin);
    if (pin.type === 'pin' && pinCopy.type === 'pin') expect(pinCopy.target).not.toBe(pin.target);
  });
});

describe('survey in the editor (10e)', () => {
  it('a new survey is 45 seconds, three answers and five blank rows; valid once rows are filled', () => {
    const blank = newQuestion('survey');
    expect(blank.type === 'survey' && [blank.timeLimit, blank.answers, blank.rows.length]).toEqual([LIMITS.defaultSurveyTime, 3, 5]);
    expect(LIMITS.defaultSurveyTime).toBe(45);
    const filledIn = filled(blank);
    expect(filledIn.type === 'survey' && filledIn.rows.slice(0, 4).every((r) => r.text !== '' && r.popularity > 0)).toBe(true);
    expect(quizSchema.safeParse(cleaned(quizWith(filledIn))).success).toBe(true);
    expect(problemsOf(quizWith(blank))).not.toEqual([]);
  });

  it('questionTypesFor: the survey is in classic and on the board, not in blitz or the final', () => {
    expect(questionTypesFor('classic')).toContain('survey');
    expect(questionTypesFor('board')).toContain('survey');
    expect(questionTypesFor('blitz')).not.toContain('survey');
    expect(questionTypesFor('final')).not.toContain('survey');
  });

  it('a text becomes a survey with its first spelling as the first row; reveal and cloudId are dropped', () => {
    const text = { ...(newQuestion('text') as Extract<Question, { type: 'text' }>), accepted: ['Дніпро', 'Днепр'], imageUrl: '/uploads/aaaaaaaaaaaaaaaaaaaa.png', reveal: { start: 20, end: 100 } } as unknown as Question;
    const survey = changeType(text, 'survey');
    expect(survey.type === 'survey' && survey.rows[0].text).toBe('Дніпро');
    expect(survey.reveal).toBeUndefined();
    const withCloud = { ...(newQuestion('survey') as Extract<Question, { type: 'survey' }>), cloudId: 'k1' };
    expect('cloudId' in changeType(withCloud, 'text')).toBe(false);
  });

  it('a duplicated survey gets new row ids', () => {
    const source = filled(newQuestion('survey')) as Extract<Question, { type: 'survey' }>;
    const copy = duplicateQuestion(source) as Extract<Question, { type: 'survey' }>;
    expect(copy.rows.map((r) => r.id).some((id) => source.rows.some((r) => r.id === id))).toBe(false);
    expect(copy.rows.map((r) => r.text)).toEqual(source.rows.map((r) => r.text));
  });
});

describe('wall, poll and word cloud in the editor (10d)', () => {
  it('questionTypesFor: the wall is in classic and on the board; polls and clouds are classic only', () => {
    expect(questionTypesFor('classic')).toEqual(QUESTION_TYPES);
    expect(questionTypesFor('board')).toContain('wall');
    expect(questionTypesFor('board')).not.toContain('poll');
    expect(questionTypesFor('board')).not.toContain('wordcloud');
    for (const round of ['blitz', 'final'] as const) {
      for (const type of ['wall', 'poll', 'wordcloud'] as const) expect(questionTypesFor(round)).not.toContain(type);
    }
  });

  it('a new wall is 4×4 with 90 seconds and three mistakes; poll and cloud are worth nothing', () => {
    const wall = filled(newQuestion('wall'));
    expect(wall.type === 'wall' && [wall.timeLimit, wall.mistakes, wall.groups.length, wall.groups[0].tiles.length]).toEqual([LIMITS.defaultWallTime, 3, 4, 4]);
    expect(quizSchema.safeParse(cleaned(quizWith(wall))).success).toBe(true);
    expect(newQuestion('poll').points).toBe(0);
    expect(newQuestion('wordcloud').points).toBe(0);
    expect(newQuestion('wordcloud').type === 'wordcloud' && (newQuestion('wordcloud') as { words: number }).words).toBe(LIMITS.maxCloudWords);
  });

  it('a single with options becomes a poll with the same options and no price, and back with 1000', () => {
    const single = filled(newQuestion('single'));
    const poll = changeType(single, 'poll');
    expect(poll.points).toBe(0);
    if (single.type !== 'single' || poll.type !== 'poll') throw new Error('unexpected type');
    expect(poll.options).toEqual(single.options);
    const back = changeType(poll, 'single');
    expect(back.points).toBe(LIMITS.defaultPoints);
    expect(back.type === 'single' && back.correctId).toBe(poll.options[0].id);
    expect(changeType(poll, 'text').points).toBe(LIMITS.defaultPoints);
  });

  it('a wall loses the video; a duplicated wall shares no ids', () => {
    const video = { id: 'dQw4w9WgXcQ', start: 0 };
    expect(changeType({ ...newQuestion('single'), video }, 'wall').video).toBeNull();
    const wall = newQuestion('wall');
    const copy = duplicateQuestion(wall);
    if (wall.type !== 'wall' || copy.type !== 'wall') throw new Error('unexpected type');
    expect(copy.groups[0].id).not.toBe(wall.groups[0].id);
    expect(copy.groups[0].tiles[0].id).not.toBe(wall.groups[0].tiles[0].id);
  });
});

describe('wall, poll and word cloud: checks and drafts (10d)', () => {
  type Wall = Extract<Question, { type: 'wall' }>;
  const wallQ = (): Wall => filled(newQuestion('wall')) as Wall;
  const withTile = (wall: Wall, text: string, group = 0, tile = 0): Wall => ({
    ...wall,
    groups: wall.groups.map((g, i) => (i === group ? { ...g, tiles: g.tiles.map((x, k) => (k === tile ? { ...x, text } : x)) } : g)),
  });
  const ofBlitz = (question: Question): Quiz => ({ ...quizWith(question), rounds: [{ ...newBlitzRound(), questions: [question] }] });
  /** Поле, у якого перша клітинка першої категорії — це запитання з такими властивостями; решта клітинок заповнені. */
  const onCell = (question: Question, cell: Partial<BoardRound['categories'][number]['cells'][number]>): Quiz => {
    const round = newBoardRound();
    const categories = round.categories.map((category, i) => ({
      ...category,
      title: `К${i + 1}`,
      cells: category.cells.map((c) => ({ ...c, question: filled(c.question) })),
    }));
    const [first, ...rest] = categories;
    const [head, ...cells] = first.cells;
    return { ...newQuiz(), title: 'Гра', rounds: [{ ...round, categories: [{ ...first, cells: [{ ...head, ...cell, question }, ...cells] }, ...rest] }] };
  };

  it('a filled wall has no problems; an empty tile or group name does', () => {
    expect(problemsOf(quizWith(wallQ()))).toEqual([]);
    const empty = withTile(wallQ(), '  ', 1, 2);
    expect(problemsOf(quizWith(empty))).toEqual([t('problemWallEmpty', { index: 1 })]);
    const noName = { ...wallQ(), groups: wallQ().groups.map((g, i) => (i === 0 ? { ...g, name: '' } : g)) };
    expect(problemsOf(quizWith(noName))).toEqual([t('problemWallEmpty', { index: 1 })]);
  });

  it('a repeated tile is named, compared trimmed and without case', () => {
    const wall = withTile(withTile(wallQ(), 'Дніпро', 0, 0), ' дніпро ', 2, 1);
    expect(problemsOf(quizWith(wall))).toEqual([t('problemWallDuplicate', { index: 1, tile: 'дніпро' })]);
    expect(problemsOf(quizWith(withTile(withTile(wallQ(), 'Дніпро', 0, 0), 'ДНІПРО', 1, 0)))[0]).toContain('«дніпро»');
    expect(problemsOf(quizWith(withTile(withTile(wallQ(), 'Піп Іван', 0, 0), 'піп   ІВАН', 1, 0)))[0]).toContain('«піп іван»');
  });

  it('the mistake limit and the word count are checked with their own messages', () => {
    expect(problemsOf(quizWith({ ...wallQ(), mistakes: 9 }))).toEqual([t('problemWallMistakes', { index: 1, wallMin: 1, wallMax: 5 })]);
    expect(problemsOf(quizWith({ ...wallQ(), mistakes: Number.NaN }))[0]).toContain('помилок до замикання');
    const cloud = { ...newQuestion('wordcloud'), text: 'Слова?' } as Question;
    expect(problemsOf(quizWith(cloud))).toEqual([]);
    expect(problemsOf(quizWith({ ...cloud, words: 4 } as Question))).toEqual([t('problemCloudWords', { index: 1, cloudMax: 3 })]);
  });

  it('a poll with an empty option is the usual option problem', () => {
    const poll = { ...newQuestion('poll'), text: 'Що?' } as Question;
    expect(problemsOf(quizWith(poll))).toEqual([t('problemEmptyOption', { index: 1 })]);
    expect(problemsOf(quizWith(filled(poll)))).toEqual([]);
  });

  it('a wall is only for classic and a normal phone cell', () => {
    const wall = wallQ();
    const place = t('problemWallPlace', { index: 1 });
    expect(problemsOf(ofBlitz(wall))).toEqual([place]);
    expect(problemsOf({ ...quizWith(wall), rounds: [{ ...newFinalRound(), questions: [wall] }] })).toEqual([place]);
    expect(problemsOf(onCell(wall, { kind: 'normal', answerMode: 'phone' }))).toEqual([]);
    expect(problemsOf(onCell(wall, { kind: 'normal', answerMode: 'voice' }))).toEqual([t('problemCell', { category: 1, problem: place.charAt(0).toLowerCase() + place.slice(1) })]);
    expect(problemsOf(onCell(wall, { kind: 'blitz', answerMode: 'phone' }))).toHaveLength(1);
  });

  it('a poll and a cloud are only for classic', () => {
    const poll = filled(newQuestion('poll'));
    const cloud = { ...newQuestion('wordcloud'), text: 'Слова?' } as Question;
    for (const question of [poll, cloud]) {
      expect(problemsOf(quizWith(question))).toEqual([]);
      expect(problemsOf(ofBlitz(question))).toEqual([t('problemVotePlace', { index: 1 })]);
      expect(problemsOf(onCell(question, {})), question.type).toHaveLength(1);
    }
  });

  it('cleaning trims group names and tiles', () => {
    const wall = withTile(wallQ(), '  Київ  ', 0, 0);
    const clean = cleaned(quizWith({ ...wall, groups: wall.groups.map((g) => ({ ...g, name: ` ${g.name} ` })) })).rounds[0];
    const question = roundQuestions(clean)[0] as Wall;
    expect(question.groups[0].tiles[0].text).toBe('Київ');
    expect(question.groups[0].name).toBe("Зв'язок 1");
  });

  it('a wall draft keeps its groups; a wrong size is aligned to 3×3 or 4×4', () => {
    const wall = withTile(wallQ(), 'Київ', 0, 0);
    saveDraft('wall-draft', quizWith(wall));
    expect(roundQuestions(loadDraft('wall-draft')!.rounds[0])[0]).toEqual(wall);

    saveDraft('wall-three', quizWith({ ...wall, groups: wall.groups.slice(0, 3) }));
    const back = roundQuestions(loadDraft('wall-three')!.rounds[0])[0] as Wall;
    expect(back.groups).toHaveLength(3);
    expect(back.groups.map((g) => g.tiles.length)).toEqual([3, 3, 3]);
    expect(back.groups[0].tiles[0].text).toBe('Київ');

    saveDraft('wall-two', quizWith({ ...wall, groups: wall.groups.slice(0, 2) }));
    const two = roundQuestions(loadDraft('wall-two')!.rounds[0])[0] as Wall;
    expect([two.groups.length, two.groups[0].tiles.length]).toEqual([4, 4]);
    expect(two.groups[3]).toMatchObject({ name: '', tiles: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }] });
  });

  it('wall mistakes revive as a number, a missing value as the default; a blank field stays blank', () => {
    const revived = (mistakes: unknown) => {
      sessionStorage.setItem('quiz:draft:wm', JSON.stringify(quizWith({ ...wallQ(), mistakes } as unknown as Question)));
      return (roundQuestions(loadDraft('wm')!.rounds[0])[0] as Wall).mistakes;
    };
    expect(revived(5)).toBe(5);
    expect(revived(undefined)).toBe(LIMITS.defaultWallMistakes);
    expect(Number.isNaN(revived(Number.NaN))).toBe(true);
  });

  it('a wall draft drops a stored video', () => {
    sessionStorage.setItem('quiz:draft:wv', JSON.stringify(quizWith({ ...wallQ(), video: { id: 'dQw4w9WgXcQ', start: 0 } } as Question)));
    expect((roundQuestions(loadDraft('wv')!.rounds[0])[0] as Wall).video).toBeNull();
  });

  it('a poll and a cloud draft keep options and words and are worth nothing; a bad word count becomes 3', () => {
    const poll = { ...filled(newQuestion('poll')), points: 500 } as Question;
    sessionStorage.setItem('quiz:draft:pl', JSON.stringify(quizWith(poll)));
    const revivedPoll = roundQuestions(loadDraft('pl')!.rounds[0])[0];
    expect(revivedPoll).toMatchObject({ type: 'poll', points: 0, options: (poll as { options: unknown }).options });
    for (const [stored, expected] of [[2, 2], ['x', 3], [undefined, 3]] as const) {
      sessionStorage.setItem('quiz:draft:wc', JSON.stringify(quizWith({ ...newQuestion('wordcloud'), text: 'a', words: stored } as unknown as Question)));
      expect(roundQuestions(loadDraft('wc')!.rounds[0])[0]).toMatchObject({ type: 'wordcloud', points: 0, words: expected });
    }
  });
});

describe('changeType', () => {
  it('keeps the question text, time and points', () => {
    const source = { ...newQuestion('single'), text: 'Скільки?', timeLimit: 45, points: 500 };
    // Сортування, стіна, опитування й хмара мають власні час чи бали: їх перевіряють окремі тести.
    for (const type of QUESTION_TYPES.filter((candidate) => !['sort', 'wall', 'poll', 'wordcloud'].includes(candidate))) {
      const changed = changeType(source, type);
      expect(changed.type).toBe(type);
      expect([changed.id, changed.text, changed.timeLimit, changed.points]).toEqual([source.id, 'Скільки?', 45, 500]);
    }
  });

  it('keeps the audio always and the revealing picture only where it works', () => {
    const audio = { source: 'youtube', id: 'dQw4w9WgXcQ', start: 0, duration: 15 } as const;
    const source = { ...newQuestion('single'), imageUrl: '/uploads/aaaaaaaaaaaaaaaaaaaa.png', audio, reveal: 'pixels' } as Question;
    const text = changeType(source, 'text');
    expect([text.audio, text.reveal]).toEqual([audio, 'pixels']);
    const multi = changeType(source, 'multi');
    expect([multi.audio, multi.reveal]).toEqual([audio, undefined]);
    expect('reveal' in multi).toBe(false);
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
  it('names the allowed range for an out-of-range or fractional debuff price', () => {
    const base = quizWith(filled(newQuestion('boolean')));
    for (const fog of [10, 9000, 150.5]) {
      const quiz = { ...base, settings: { ...base.settings, debuffs: ['fog' as const], debuffPrices: { fog } } };
      expect(problemsOf(quiz), String(fog)).toEqual(['Ціна дебафу — від 50 до 5000 балів.']);
    }
    expect(problemsOf({ ...base, settings: { ...base.settings, debuffs: ['fog'], debuffPrices: { fog: 2000 } } })).toEqual([]);
  });

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
      expect({ ...copy, id: '', options: undefined, items: undefined, pairs: undefined, categories: undefined, groups: undefined, rows: undefined, words: undefined, correctId: undefined, correctIds: undefined }, type).toEqual({
        ...source,
        id: '',
        options: undefined,
        items: undefined,
        pairs: undefined,
        categories: undefined,
        groups: undefined,
        rows: undefined,
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

  it('switching the round mode leaves no hidden clue interval on voice cells', () => {
    const round = newBoardRound();
    const [a, b, c] = round.categories[0].cells;
    const clue = { ...newQuestion('clues'), interval: 8 } as Question;
    const { answerMode: _drop, ...legacy } = c;
    round.categories[0].cells = [{ ...a, answerMode: 'voice', question: clue }, { ...b, answerMode: 'phone', question: clue }, { ...legacy, question: clue }];
    const toVoice = { ...round, answerMode: 'voice' as const };
    const next = withDefaultMode(toVoice, 'voice');
    const interval = (i: number) => (next.categories[0].cells[i].question as Extract<Question, { type: 'clues' }>).interval;
    expect(interval(0)).toBe(LIMITS.minClueSeconds);
    expect(interval(1)).toBe(8);
    expect(interval(2)).toBe(LIMITS.minClueSeconds);
    expect(withDefaultMode(round, 'phone').categories[0].cells[1].question).toBe(clue);
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

describe('hints and the spare pool in the draft', () => {
  it('cleaned drops empty hints and an empty pool', () => {
    const quiz = quizWith({ ...filled(newQuestion('boolean')), hint: '   ' });
    const clean = cleaned({ ...quiz, spares: [] });
    expect('hint' in roundQuestions(clean.rounds[0])[0]).toBe(false);
    expect('spares' in clean).toBe(false);
    const hinted = cleaned(quizWith({ ...filled(newQuestion('boolean')), hint: '  Тече через Київ ' }));
    expect(roundQuestions(hinted.rounds[0])[0].hint).toBe('Тече через Київ');
  });

  it('changing the type keeps the hint', () => {
    expect(changeType({ ...newQuestion('single'), hint: 'Підказка' }, 'text').hint).toBe('Підказка');
  });

  it('problemsOf names the spare with a problem', () => {
    const quiz = quizWith(filled(newQuestion('boolean')));
    const withPool: Quiz = { ...quiz, spares: [filled(newQuestion('boolean')), newQuestion('boolean')] };
    expect(problemsOf(withPool)).toEqual(['Запасне 2: впишіть текст запитання.']);
    expect(problemsOf({ ...withPool, spares: [filled(newQuestion('boolean'))] })).toEqual([]);
  });

  it('swap without a pool is a problem', () => {
    const quiz = quizWith(filled(newQuestion('boolean')));
    expect(problemsOf({ ...quiz, settings: { ...quiz.settings, buffs: ['swap'] } })).toEqual([t('problemSparesEmpty')]);
  });

  it('a forged pool with a wrong type is still caught', () => {
    const quiz = quizWith(filled(newQuestion('boolean')));
    expect(problemsOf({ ...quiz, spares: [filled(newQuestion('order'))] })).toEqual([t('problemSpareType')]);
  });

  it('newSpare is a plain question without a hint', () => {
    const spare = newSpare('text');
    expect(spare).toMatchObject({ type: 'text', video: null });
    expect('hint' in spare).toBe(false);
  });
});

describe('spare drafts in storage', () => {
  it('a hint that is not a string is dropped, a string hint stays', () => {
    const good = { ...filled(newQuestion('boolean')), hint: 'Тече через Київ' };
    const bad = { ...filled(newQuestion('boolean')), id: 'q-bad', hint: 42 };
    const raw = JSON.parse(JSON.stringify(quizWith(good)));
    raw.rounds[0].questions.push(bad);
    sessionStorage.setItem('quiz:draft:badhint', JSON.stringify(raw));
    const [kept, dropped] = roundQuestions(loadDraft('badhint')!.rounds[0]);
    expect(kept.hint).toBe('Тече через Київ');
    expect('hint' in dropped).toBe(false);
  });

  it('a draft keeps the spare pool and drops a broken one', () => {
    const s1 = filled(newQuestion('boolean'));
    const quiz: Quiz = { ...quizWith(filled(newQuestion('boolean'))), spares: [s1] };
    saveDraft('withspares', quiz);
    expect(loadDraft('withspares')?.spares).toEqual([s1]);
    sessionStorage.setItem('quiz:draft:brokenspares', JSON.stringify({ ...quiz, spares: 'x' }));
    expect('spares' in loadDraft('brokenspares')!).toBe(false);
    sessionStorage.setItem('quiz:draft:emptyspares', JSON.stringify({ ...quiz, spares: [null, 5] }));
    expect('spares' in loadDraft('emptyspares')!).toBe(false);
  });
});

describe('category spares in the draft (9d)', () => {
  const boardQuiz = (spareIn: Record<string, Question[]> = {}, extra: Partial<Quiz> = {}): Quiz => {
    const board = newBoardRound();
    const names = ['Спорт', 'Міста', 'Річки'];
    const round: BoardRound = {
      ...board,
      title: 'Поле',
      categories: board.categories.map((category, i) => ({
        ...category,
        title: names[i],
        cells: category.cells.map((cell) => ({ ...cell, question: filled(cell.question) })),
        ...(spareIn[names[i]] === undefined ? {} : { spares: spareIn[names[i]] }),
      })),
    };
    return { ...newQuiz(), title: 'Гра', rounds: [round], ...extra };
  };
  const swapOn = (quiz: Quiz): Quiz => ({ ...quiz, settings: { ...quiz.settings, buffs: ['swap'] } });

  it('cleaned drops an empty category pool and trims category spares', () => {
    const quiz = boardQuiz({ Спорт: [], Міста: [{ ...filled(newSpare('boolean')), text: '  Так?  ' }] });
    const [round] = cleaned(quiz).rounds as BoardRound[];
    expect('spares' in round.categories[0]).toBe(false);
    expect(round.categories[1].spares?.[0].text).toBe('Так?');
  });

  it('a quiz with spares only in categories saves; problems of a category spare name the category', () => {
    const good = swapOn(boardQuiz({ Спорт: [filled(newSpare('boolean'))] }));
    expect(problemsOf(good)).toEqual([]);
    const bad = swapOn(boardQuiz({ Спорт: [newSpare('boolean')] }));
    expect(problemsOf(bad).join('\n')).toContain('Категорія «Спорт», запасне 1:');
    expect(problemsOf(swapOn(boardQuiz()))).toContain(t('problemSparesEmpty'));
  });

  it('swapGaps lists categories without spares, a classic round without the pool and the legacy board', () => {
    const some = boardQuiz({ Спорт: [filled(newSpare('boolean'))] });
    expect(swapGaps(some)).toEqual({ anyCategory: true, emptyCategories: ['Поле · Міста', 'Поле · Річки'], classicWithoutPool: false, legacyBoard: false });
    const withClassic: Quiz = { ...some, rounds: [...some.rounds, newClassicRound()] };
    expect(swapGaps(withClassic).classicWithoutPool).toBe(true);
    const legacy = boardQuiz({}, { spares: [filled(newSpare('boolean'))] });
    expect(swapGaps(legacy)).toMatchObject({ anyCategory: false, emptyCategories: [], legacyBoard: true });
    expect(swapGaps(boardQuiz()).emptyCategories).toEqual([]);
    expect(swapGaps(boardQuiz()).classicWithoutPool).toBe(false);
    const [round] = some.rounds as BoardRound[];
    const blank: Quiz = { ...some, rounds: [{ ...round, title: '', categories: round.categories.map((c, i) => (i === 1 ? { ...c, title: '' } : c)) }] };
    expect(swapGaps(blank).emptyCategories).toEqual(['Раунд 1 · Категорія 2', 'Раунд 1 · Річки']);
  });

  it('a draft revives category spares: null time limit becomes NaN, a non-array disappears', () => {
    const spare = filled(newSpare('boolean'));
    const quiz = boardQuiz({ Спорт: [spare] });
    const raw = JSON.parse(JSON.stringify(quiz));
    raw.rounds[0].categories[0].spares[0].timeLimit = null;
    raw.rounds[0].categories[1].spares = 'x';
    sessionStorage.setItem('quiz:draft:catspares', JSON.stringify(raw));
    const [round] = loadDraft('catspares')!.rounds as BoardRound[];
    expect(round.categories[0].spares?.[0].timeLimit).toBeNaN();
    expect(round.categories[0].spares?.[0].text).toBe(spare.text);
    expect('spares' in round.categories[1]).toBe(false);
  });
});

describe('slider, audio and revealing picture drafts (10b)', () => {
  const slider = (patch: Record<string, unknown> = {}) => ({ ...filled(newQuestion('slider')), ...patch }) as Question;
  const IMAGE = '/uploads/0123456789abcdef0123456789abcdef.png';

  it('a right slider has no problems; a wrong one names what to check', () => {
    expect(problemsOf(quizWith(slider()))).toEqual([]);
    expect(problemsOf(quizWith(slider({ min: 10, max: 10 })))).toEqual(['Запитання 1: повзунок — перевірте мінімум, максимум і крок.']);
    expect(problemsOf(quizWith(slider({ step: 0 })))).toHaveLength(1);
    expect(problemsOf(quizWith(slider({ step: 0.3 })))).toEqual(['Запитання 1: повзунок — перевірте мінімум, максимум і крок.']);
    expect(problemsOf(quizWith(slider({ min: Number.NaN })))).toEqual(['Запитання 1: повзунок — перевірте мінімум, максимум і крок.']);
    expect(problemsOf(quizWith(slider({ correct: 200 })))).toEqual(['Запитання 1: перевірте правильне значення й допуск: значення між мінімумом і максимумом, допуск не менше 0.']);
    expect(problemsOf(quizWith(slider({ tolerance: -1 })))).toEqual(['Запитання 1: перевірте правильне значення й допуск: значення між мінімумом і максимумом, допуск не менше 0.']);
    expect(problemsOf(quizWith(slider({ zeroBeyond: 1, tolerance: 2 })))).toEqual(['Запитання 1: межа «нуль балів» має бути більшою за допуск.']);
  });

  it('audio out of limits is a problem for any type', () => {
    const audio = { source: 'youtube', id: 'dQw4w9WgXcQ', start: 0, duration: 0 };
    expect(problemsOf(quizWith({ ...filled(newQuestion('boolean')), audio } as Question))).toEqual([
      'Запитання 1: аудіо — початок від 0 с, тривалість від 1 до 120 с.',
    ]);
    expect(problemsOf(quizWith({ ...filled(newQuestion('boolean')), audio: { ...audio, duration: 15 } } as Question))).toEqual([]);
    expect(problemsOf(quizWith({ ...filled(newQuestion('boolean')), audio: { ...audio, duration: 15, start: Number.NaN } } as Question))).toHaveLength(1);
  });

  it('a revealing picture works in a classic round and on a normal phone cell only', () => {
    const revealing = { ...filled(newQuestion('single')), imageUrl: IMAGE, reveal: 'pixels' } as Question;
    expect(problemsOf(quizWith(revealing))).toEqual([]);

    const two = { ...quizWith(filled(newQuestion('boolean'))) };
    const blitz = { ...newBlitzRound(), questions: [revealing] };
    expect(problemsOf({ ...two, rounds: [two.rounds[0], blitz] })).toEqual([
      'Раунд 2: Запитання 1: картинка, що проявляється, діє лише в класиці й на звичайній клітинці поля з телефона.',
    ]);

    const board = (patch: Record<string, unknown>) => {
      const round = newBoardRound();
      const categories = round.categories.map((category, i) => ({
        ...category,
        title: `К${i}`,
        cells: category.cells.map((cell, j) =>
          i === 0 && j === 0 ? { ...cell, ...patch, question: { ...filled(cell.question), imageUrl: IMAGE, reveal: 'blur' as const } } : { ...cell, question: filled(cell.question) },
        ),
      }));
      return { ...newQuiz(), title: 'Гра', rounds: [{ ...round, categories }] } as Quiz;
    };
    expect(problemsOf(board({}))).toEqual([]);
    expect(problemsOf(board({ kind: 'blitz' }))).toEqual([
      'Категорія 1, запитання 1: картинка, що проявляється, діє лише в класиці й на звичайній клітинці поля з телефона.',
    ]);
    expect(problemsOf(board({ answerMode: 'voice' }))).toHaveLength(1);
  });

  it('cleaned drops an empty unit, an empty zero line and a mode without a picture', () => {
    const quiz = quizWith(
      slider({ unit: '  ', reveal: 'pixels', imageUrl: null }),
      { ...filled(newQuestion('single')), imageUrl: IMAGE, reveal: 'blur' } as Question,
      slider({ unit: ' км ', zeroBeyond: 5 }),
    );
    const [first, second, third] = roundQuestions(cleaned(quiz).rounds[0]);
    expect('unit' in first).toBe(false);
    expect('zeroBeyond' in first).toBe(false);
    expect('reveal' in first).toBe(false);
    expect(second).toMatchObject({ reveal: 'blur' });
    expect(third).toMatchObject({ unit: 'км', zeroBeyond: 5 });
  });

  it('a slider draft with empty fields comes back with NaN and a problem; a bad audio and a bad mode are dropped', () => {
    const broken = slider({ min: Number.NaN, zeroBeyond: Number.NaN, audio: { source: 'file', url: 'https://evil.example/a.mp3', start: 0, duration: 10 }, reveal: 'sparkles' });
    saveDraft('slider-draft', quizWith(broken));
    const back = roundQuestions(loadDraft('slider-draft')!.rounds[0])[0];
    if (back.type !== 'slider') throw new Error('slider');
    expect(back.min).toBeNaN();
    expect('zeroBeyond' in back).toBe(false);
    expect('audio' in back).toBe(false);
    expect('reveal' in back).toBe(false);
    expect(problemsOf(loadDraft('slider-draft')!)).toEqual(['Запитання 1: повзунок — перевірте мінімум, максимум і крок.']);
  });

  it('junk in the zero line stays a problem instead of being dropped; a video drops reveal and audio', () => {
    expect(problemsOf(quizWith(slider({ zeroBeyond: Number.NaN })))).toEqual(['Запитання 1: межа «нуль балів» має бути більшою за допуск.']);
    const withVideo = { ...filled(newQuestion('single')), imageUrl: IMAGE, reveal: 'pixels', video: { id: 'dQw4w9WgXcQ', start: 0 } } as Question;
    expect('reveal' in roundQuestions(cleaned(quizWith(withVideo)).rounds[0])[0]).toBe(false);
    const audio = { source: 'youtube', id: 'dQw4w9WgXcQ', start: 0, duration: 10 };
    saveDraft('both', quizWith({ ...filled(newQuestion('boolean')), video: { id: 'dQw4w9WgXcQ', start: 0 }, audio } as Question));
    expect('audio' in roundQuestions(loadDraft('both')!.rounds[0])[0]).toBe(false);
  });

  it('a good audio, mode and unit survive the draft; empty audio numbers stay empty', () => {
    const audio = { source: 'file', url: '/uploads/0123456789abcdef0123456789abcdef.mp3', start: Number.NaN, duration: 20 };
    const question = { ...filled(newQuestion('single')), imageUrl: IMAGE, reveal: 'pixels', audio } as Question;
    saveDraft('audio-draft', quizWith(question, slider({ unit: 'км', zeroBeyond: 5 })));
    const [single, sliderBack] = roundQuestions(loadDraft('audio-draft')!.rounds[0]);
    expect(single).toMatchObject({ reveal: 'pixels', audio: { source: 'file', duration: 20 } });
    expect(single.audio?.start).toBeNaN();
    expect(sliderBack).toMatchObject({ unit: 'км', zeroBeyond: 5 });
  });
});

describe('clues and pin drafts (10c)', () => {
  const clues = (patch: Record<string, unknown> = {}) => ({ ...filled(newQuestion('clues')), ...patch }) as Question;
  const pin = (patch: Record<string, unknown> = {}) => ({ ...filled(newQuestion('pin')), ...patch }) as Question;
  const boardWith = (question: Question, cell: Record<string, unknown> = {}) => {
    const round = newBoardRound();
    const categories = round.categories.map((category, i) => ({
      ...category,
      title: `К${i}`,
      cells: category.cells.map((c, j) => (i === 0 && j === 0 ? { ...c, ...cell, question } : { ...c, question: filled(c.question) })),
    }));
    return { ...newQuiz(), title: 'Гра', rounds: [{ ...round, categories }] } as Quiz;
  };

  it('clues: an empty clue, the time for the last clue, the interval', () => {
    expect(problemsOf(quizWith(clues()))).toEqual([]);
    expect(problemsOf(quizWith(clues({ clues: ['Раз', '', 'Три'] })))).toEqual(['Запитання 1: заповніть кожну підказку.']);
    const six = clues({ clues: ['1', '2', '3', '4', '5', '6'], interval: 8, timeLimit: 30 });
    expect(problemsOf(quizWith(six))).toEqual([
      'Запитання 1: остання підказка відкривається на 40-й секунді — дайте щонайменше 45 с часу або зменште інтервал.',
    ]);
    expect(problemsOf(quizWith({ ...six, timeLimit: 45 } as Question))).toEqual([]);
    expect(problemsOf(quizWith(clues({ interval: 2 })))).toEqual(['Запитання 1: інтервал між підказками — від 3 до 30 с.']);
    expect(problemsOf(quizWith(clues({ interval: Number.NaN })))).toHaveLength(1);
    expect(problemsOf(quizWith(clues({ accepted: [] })))).toEqual(['Запитання 1: впишіть правильну відповідь.']);
  });

  it('pin: an own base without a picture, the radii', () => {
    expect(problemsOf(quizWith(pin()))).toEqual([]);
    expect(problemsOf(quizWith(pin({ map: null, imageUrl: null })))).toEqual(['Запитання 1: завантажте картинку для точки або виберіть мапу.']);
    expect(problemsOf(quizWith(pin({ map: null, imageUrl: '/uploads/0123456789abcdef0123456789abcdef.png', aspect: 1.5 })))).toEqual([]);
    const radius = 'Запитання 1: радіус нуля має бути більшим за радіус повних балів (до 100 %).';
    expect(problemsOf(quizWith(pin({ zeroRadius: 2, fullRadius: 3 })))).toEqual([radius]);
    expect(problemsOf(quizWith(pin({ zeroRadius: Number.NaN })))).toEqual([radius]);
    expect(problemsOf(quizWith(pin({ zeroRadius: 101 })))).toEqual([radius]);
    expect(problemsOf(quizWith(pin({ fullRadius: 60, zeroRadius: 90 })))).toEqual(['Запитання 1: радіус повних балів — від 0 до 50 %.']);
    expect(problemsOf(quizWith(pin({ fullRadius: -1 })))).toEqual(['Запитання 1: радіус повних балів — від 0 до 50 %.']);
  });

  it('every schema code of clues and pin is a problem the editor explains', () => {
    // Те, що редактор не дає створити, усе одно не проходить мовчки: перевірка чернетки каже, що не так.
    const generic = ['Запитання 1: перевірте заповнення.'];
    expect(problemsOf(quizWith(clues({ video: { id: 'dQw4w9WgXcQ', start: 0 } })))).toEqual(generic);
    expect(problemsOf(quizWith(pin({ video: { id: 'dQw4w9WgXcQ', start: 0 } })))).toEqual(generic);
    expect(problemsOf(quizWith(pin({ aspect: 3 })))).toEqual(generic);
  });

  it('places: clues and pins by round and cell', () => {
    const blitz = { ...newBlitzRound(), questions: [clues()] };
    const two = quizWith(filled(newQuestion('boolean')));
    expect(problemsOf({ ...two, rounds: [two.rounds[0], blitz] } as Quiz)).toEqual([
      'Раунд 2: Запитання 1: «Хто я?» діє лише в класиці й на звичайній клітинці поля.',
    ]);
    const final = { ...newFinalRound(), questions: [pin()] };
    expect(problemsOf({ ...two, rounds: [two.rounds[0], final] } as Quiz)).toEqual([
      'Раунд 2: Запитання 1: точка на мапі діє лише в класиці й на звичайній клітинці поля з телефона.',
    ]);
    expect(problemsOf(boardWith(clues(), { kind: 'blitz' }))).toEqual([
      'Категорія 1, запитання 1: «Хто я?» діє лише в класиці й на звичайній клітинці поля.',
    ]);
    expect(problemsOf(boardWith(clues(), { answerMode: 'voice' }))).toEqual([]);
    expect(problemsOf(boardWith(pin(), { answerMode: 'voice' }))).toEqual([
      'Категорія 1, запитання 1: точка на мапі діє лише в класиці й на звичайній клітинці поля з телефона.',
    ]);
    expect(problemsOf(boardWith(pin(), { kind: 'blitz' }))).toHaveLength(1);
    expect(problemsOf(boardWith(pin(), { answerMode: 'phone' }))).toEqual([]);
    expect(firstProblem(boardWith(pin(), { answerMode: 'voice' }))).toMatchObject({ cell: { category: 0, index: 0 } });
  });

  it('a voice clues cell does not tell the host to reduce a hidden interval', () => {
    const six = clues({ clues: ['1', '2', '3', '4', '5', '6'], interval: 8, timeLimit: 30 });
    expect(problemsOf(boardWith(six, { answerMode: 'voice' }))).toEqual(['Категорія 1, запитання 1: для 6 підказок дайте щонайменше 45 с часу.']);
    expect(problemsOf(boardWith(six, { answerMode: 'phone' }))[0]).toContain('зменште інтервал');
  });

  it('cleaned trims the clues and the spellings', () => {
    const [question] = roundQuestions(cleaned(quizWith(clues({ clues: [' Раз ', 'Два', ' Три'], accepted: [' Шевченко ', '  '] }))).rounds[0]);
    expect(question).toMatchObject({ clues: ['Раз', 'Два', 'Три'], accepted: ['Шевченко'] });
  });

  it('draft storage revives clues and pins', () => {
    const asJson = (question: Question) => JSON.parse(JSON.stringify(question)) as Record<string, unknown>;
    const quiz = {
      ...quizWith(filled(newQuestion('boolean'))),
      rounds: [
        {
          ...newClassicRound(),
          questions: [
            { ...asJson(pin()), zeroRadius: Number.NaN },
            { ...asJson(pin()), map: 'mars', aspect: 7 },
            { ...asJson(clues()), clues: null, accepted: null, interval: Number.NaN },
          ],
        },
      ],
    };
    sessionStorage.setItem('quiz:draft:p10c', JSON.stringify(quiz));
    const revived = loadDraft('p10c')!;
    const [broken, mars, empty] = roundQuestions(revived.rounds[0]);
    expect(broken.type === 'pin' && Number.isNaN(broken.zeroRadius)).toBe(true);
    expect(problemsOf({ ...revived, rounds: [{ ...revived.rounds[0], questions: [broken] } as ClassicRound] })).toEqual([
      'Запитання 1: радіус нуля має бути більшим за радіус повних балів (до 100 %).',
    ]);
    expect(mars).toMatchObject({ type: 'pin', map: 'world', aspect: 2, imageUrl: null });
    expect(empty).toMatchObject({ type: 'clues', clues: ['', '', ''], accepted: [''] });
    expect(empty.type === 'clues' && Number.isNaN(empty.interval)).toBe(true);
  });

  it('draft storage clamps the target into the picture', () => {
    saveDraft('far-pin', quizWith(pin({ target: { x: 1.7, y: -3 } })));
    expect(roundQuestions(loadDraft('far-pin')!.rounds[0])[0]).toMatchObject({ target: { x: 1, y: 0 } });
  });

  it('draft storage keeps an own picture and the target', () => {
    const own = pin({ map: null, imageUrl: '/uploads/0123456789abcdef0123456789abcdef.png', aspect: 1.5, target: { x: 0.2, y: 0.7 } });
    saveDraft('own-pin', quizWith(own));
    expect(roundQuestions(loadDraft('own-pin')!.rounds[0])[0]).toMatchObject({ map: null, aspect: 1.5, target: { x: 0.2, y: 0.7 } });
  });
});

describe('survey: checks, clouds and drafts (10e)', () => {
  type Survey = Extract<Question, { type: 'survey' }>;
  const surveyQ = (): Survey => filled(newQuestion('survey')) as Survey;
  const withRows = (survey: Survey, patch: (rows: Survey['rows']) => Survey['rows']): Survey => ({ ...survey, rows: patch(survey.rows) });
  const cloudQ = (id: string): Question => ({ ...newQuestion('wordcloud'), id, text: `Слова ${id}?` }) as Question;
  const single = () => filled(newQuestion('single'));
  const classic = (...questions: Question[]) => ({ ...newClassicRound(), questions });
  const quizOf = (...rounds: Quiz['rounds']): Quiz => ({ ...newQuiz(), title: 'Гра', rounds });
  const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
  const onCell = (question: Question, cell: Partial<BoardRound['categories'][number]['cells'][number]>): Quiz => {
    const round = newBoardRound();
    const categories = round.categories.map((category, i) => ({
      ...category,
      title: `К${i + 1}`,
      cells: category.cells.map((c) => ({ ...c, question: filled(c.question) })),
    }));
    const [first, ...rest] = categories;
    const [head, ...cells] = first.cells;
    return { ...newQuiz(), title: 'Гра', rounds: [{ ...round, categories: [{ ...first, cells: [{ ...head, ...cell, question }, ...cells] }, ...rest] }] };
  };

  it('cloudSources lists only the clouds above the question, numbered across the quiz', () => {
    const quiz = quizOf(classic(cloudQ('c1'), filled(newQuestion('text'))), classic(single(), cloudQ('c2'), surveyQ(), cloudQ('c3')));
    expect(cloudSources(quiz, 0, 1)).toEqual([{ n: 1, id: 'c1', text: 'Слова c1?' }]);
    expect(cloudSources(quiz, 1, 2).map((c) => [c.n, c.id])).toEqual([
      [1, 'c1'],
      [2, 'c2'],
    ]);
    expect(cloudSources(quiz, 1, 0).map((c) => c.id)).toEqual(['c1']);
    expect(cloudSources(quiz, 0, 0)).toEqual([]);
    expect(cloudSources({ rounds: [classic(cloudQ('c1')), newBoardRound()] }, 1, 0)).toEqual([]);
  });

  it('a filled survey has no problems', () => {
    expect(problemsOf(quizWith(surveyQ()))).toEqual([]);
  });

  it('fewer than four filled rows, or a row without popularity, asks for the rows', () => {
    const three = withRows(surveyQ(), (rows) => rows.slice(0, 3));
    expect(problemsOf(quizWith(three))).toEqual([t('problemSurveyRows', { index: 1, surveyMin: 4 })]);
    expect(problemsOf(quizWith(three))[0]).toContain('щонайменше 4 відповіді');
    // Півзаповнений рядок не губиться мовчки.
    const half = withRows(surveyQ(), (rows) => rows.map((row, i) => (i === 4 ? { ...row, popularity: 0 } : row)));
    expect(problemsOf(quizWith(half))).toEqual([t('problemSurveyRows', { index: 1, surveyMin: 4 })]);
  });

  it('blank rows are not saved when four are filled', () => {
    const survey = withRows(surveyQ(), (rows) => [...rows.slice(0, 4), { id: 'blank', text: ' ', popularity: 0, accepted: [' '] }]);
    expect(problemsOf(quizWith(survey))).toEqual([]);
    expect((roundQuestions(cleaned(quizWith(survey)).rounds[0])[0] as Survey).rows).toHaveLength(4);
  });

  it('a total over 100 names the total', () => {
    const total110 = withRows(surveyQ(), (rows) => rows.map((row) => ({ ...row, popularity: 22 })));
    expect(problemsOf(quizWith(total110))).toEqual([t('problemSurveyTotal', { index: 1, total: 110 })]);
    expect(problemsOf(quizWith(total110))[0]).toContain('разом популярність 110');
    const exact = withRows(surveyQ(), (rows) => rows.map((row) => ({ ...row, popularity: 20 })));
    expect(problemsOf(quizWith(exact))).toEqual([]);
  });

  it('the same spelling in two rows is named; the same spelling inside one row is fine', () => {
    const twins = withRows(surveyQ(), (rows) => rows.map((row, i) => (i === 0 ? { ...row, text: 'Яблуко' } : i === 1 ? { ...row, text: 'яблуко' } : row)));
    // Назва — так, як ведучий її ввів, а не ключ порівняння.
    expect(problemsOf(quizWith(twins))).toEqual([t('problemSurveyDuplicate', { index: 1, text: 'яблуко' })]);
    const typed = withRows(surveyQ(), (rows) => rows.map((row, i) => (i === 0 ? { ...row, text: 'Яблуко' } : i === 1 ? { ...row, text: '«ЯБЛУКО»', accepted: ['  ЯБЛУКО '] } : row)));
    expect(problemsOf(quizWith(typed))).toEqual([t('problemSurveyDuplicate', { index: 1, text: 'ЯБЛУКО' })]);
    const viaAccepted = withRows(surveyQ(), (rows) => rows.map((row, i) => (i === 0 ? { ...row, text: 'Яблуко' } : i === 2 ? { ...row, accepted: ['  ЯБЛУКО '] } : row)));
    expect(problemsOf(quizWith(viaAccepted))).toHaveLength(1);
    expect(problemsOf(quizWith(viaAccepted))[0]).toContain('веде у два рядки');
    const inside = withRows(surveyQ(), (rows) => rows.map((row, i) => (i === 0 ? { ...row, text: 'Яблуко', accepted: ['яблуко'] } : row)));
    expect(problemsOf(quizWith(inside))).toEqual([]);
  });

  it('a popularity that is not a whole number gets its own message', () => {
    const fraction = withRows(surveyQ(), (rows) => rows.map((row, i) => (i === 0 ? { ...row, popularity: 12.5 } : row)));
    expect(problemsOf(quizWith(fraction))).toEqual([t('problemSurveyPopularity', { index: 1 })]);
    expect(problemsOf(quizWith(fraction))[0]).toContain('ціле число');
  });

  it('the answers per player are checked with a message', () => {
    expect(problemsOf(quizWith({ ...surveyQ(), answers: 9 }))).toEqual([t('problemSurveyAnswers', { index: 1, surveyMax: 5 })]);
    expect(problemsOf(quizWith({ ...surveyQ(), answers: Number.NaN }))).toHaveLength(1);
  });

  it('a board from a cloud: an earlier cloud is fine, spare rows are optional, a gone, moved or reordered cloud is named', () => {
    const fromCloud: Survey = { ...surveyQ(), rows: [], cloudId: 'c1' };
    expect(problemsOf(quizOf(classic(cloudQ('c1'), fromCloud)))).toEqual([]);
    expect(problemsOf(quizOf(classic(cloudQ('c1')), classic(fromCloud)))).toEqual([]);
    expect(problemsOf(quizOf(classic(cloudQ('c1'), single(), fromCloud)))).toEqual([]);
    // Запасні — або жодного, або щонайменше чотири.
    const spare: Survey = { ...surveyQ(), cloudId: 'c1' };
    expect(problemsOf(quizOf(classic(cloudQ('c1'), spare)))).toEqual([]);
    const fewSpares = withRows(spare, (rows) => rows.slice(0, 2));
    expect(problemsOf(quizOf(classic(cloudQ('c1'), fewSpares)))).toEqual([t('problemSurveyRows', { index: 2, surveyMin: 4 })]);
    // Хмару видалено, переставлено після запитання, перенесено в наступний раунд.
    expect(problemsOf(quizOf(classic(single(), fromCloud)))).toEqual([t('problemSurveyCloud', { index: 2 })]);
    expect(problemsOf(quizOf(classic(fromCloud, cloudQ('c1'))))).toEqual([t('problemSurveyCloud', { index: 1 })]);
    expect(problemsOf(quizOf(classic(fromCloud), classic(cloudQ('c1'))))).toEqual([`${t('problemRound', { round: 1 })} ${t('problemSurveyCloud', { index: 1 })}`]);
    expect(t('problemSurveyCloud', { index: 1 })).toContain('хмари для дошки вже немає раніше в класиці');
    // Id вказує не на хмару.
    expect(problemsOf(quizOf(classic({ ...single(), id: 'c1' }, fromCloud)))).toEqual([t('problemSurveyCloud', { index: 2 })]);
  });

  it('a survey is only for classic and a normal phone cell; a cloud board never on the board', () => {
    const survey = surveyQ();
    const place = t('problemSurveyPlace', { index: 1 });
    expect(problemsOf({ ...quizWith(survey), rounds: [{ ...newBlitzRound(), questions: [survey] }] })).toEqual([place]);
    expect(problemsOf({ ...quizWith(survey), rounds: [{ ...newFinalRound(), questions: [survey] }] })).toEqual([place]);
    expect(problemsOf(onCell(survey, { kind: 'normal', answerMode: 'phone' }))).toEqual([]);
    const cellPlace = t('problemCell', { category: 1, problem: lower(place) });
    expect(problemsOf(onCell(survey, { kind: 'normal', answerMode: 'voice' }))).toEqual([cellPlace]);
    expect(problemsOf(onCell(survey, { kind: 'blitz', answerMode: 'phone' }))).toEqual([cellPlace]);
    const cloud = t('problemCell', { category: 1, problem: lower(t('problemSurveyCloud', { index: 1 })) });
    expect(problemsOf(onCell({ ...survey, cloudId: 'c1' }, { kind: 'normal', answerMode: 'phone' }))).toEqual([cloud]);
  });

  it('cleaning trims rows and spellings and drops empty spellings', () => {
    const survey = withRows(surveyQ(), (rows) => rows.map((row, i) => (i === 0 ? { ...row, text: '  Яблуко ', accepted: [' яблучко ', '  ', ''] } : row)));
    const [first] = (roundQuestions(cleaned(quizWith(survey)).rounds[0])[0] as Survey).rows;
    expect(first.text).toBe('Яблуко');
    expect(first.accepted).toEqual(['яблучко']);
  });

  it('a cloud board with only blank spare rows saves with no rows', () => {
    const fresh = newQuestion('survey') as Survey;
    const blankSpares: Survey = { ...fresh, text: 'Питання?', cloudId: 'c1', rows: fresh.rows.slice(0, 4) };
    const quiz = quizOf(classic(cloudQ('c1'), blankSpares));
    expect(problemsOf(quiz)).toEqual([]);
    expect((roundQuestions(cleaned(quiz).rounds[0])[1] as Survey).rows).toEqual([]);
    expect(quizSchema.safeParse(cleaned(quiz)).success).toBe(true);
  });

  it('a survey draft with no rows and no cloud comes back with five blank rows', () => {
    const empty: Survey = { ...surveyQ(), rows: [] };
    saveDraft('survey-empty', quizWith(empty));
    const rows = (roundQuestions(loadDraft('survey-empty')!.rounds[0])[0] as Survey).rows;
    expect(rows).toHaveLength(5);
    expect(rows.every((row) => row.text === '' && row.popularity === 0 && row.accepted.length === 0)).toBe(true);
  });

  it('a survey draft keeps rows, spellings, answers and the cloud', () => {
    const survey: Survey = { ...withRows(surveyQ(), (rows) => rows.map((row, i) => (i === 0 ? { ...row, accepted: ['яблучко'] } : row))), answers: 4, cloudId: 'c1' };
    saveDraft('survey-draft', quizOf(classic(cloudQ('c1'), survey)));
    expect(roundQuestions(loadDraft('survey-draft')!.rounds[0])[1]).toEqual(survey);
  });

  it('a broken survey draft revives: popularity "x" is 0, answers keep the number, rows fall back to five blanks', () => {
    const revived = (patch: Record<string, unknown>) => {
      sessionStorage.setItem('quiz:draft:sv', JSON.stringify(quizWith({ ...surveyQ(), ...patch } as unknown as Question)));
      return roundQuestions(loadDraft('sv')!.rounds[0])[0] as Survey;
    };
    const rows = surveyQ().rows.map((row, i) => (i === 0 ? { ...row, popularity: 'x', accepted: ['a', 5] } : row));
    const back = revived({ rows, answers: 9, cloudId: 7 });
    expect(back.rows[0].popularity).toBe(0);
    expect(back.rows[0].accepted).toEqual(['a', '']);
    expect(back.answers).toBe(9);
    expect('cloudId' in back).toBe(false);
    expect(revived({ answers: undefined }).answers).toBe(LIMITS.defaultSurveyAnswers);
    expect(Number.isNaN(revived({ answers: Number.NaN }).answers)).toBe(true);
    const fallback = revived({ rows: 'oops' });
    expect(fallback.rows).toHaveLength(5);
    expect(fallback.rows.every((row) => row.text === '' && row.popularity === 0 && row.accepted.length === 0)).toBe(true);
    expect(revived({ rows: undefined, cloudId: 'c1' }).cloudId).toBe('c1');
  });
});
