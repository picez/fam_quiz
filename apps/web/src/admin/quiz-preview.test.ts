import { QUESTION_TYPES, videoLink, type Question, type QuestionType } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { questionLines } from './admin-text';
import { questionPreview } from './quiz-preview';

const IMG_A = '/uploads/aaaaaaaaaaaaaaaa.jpg';
const IMG_B = '/uploads/bbbbbbbbbbbbbbbb.png';
const SOUND = '/uploads/cccccccccccccccc.mp3';
const base = { imageUrl: null, video: null, timeLimit: 30, points: 1000 };
const single: Question = { ...base, id: 'q1', type: 'single', text: 'Найдовша річка України?', options: [{ id: 'a', text: 'Дніпро' }, { id: 'b', text: 'Десна' }, { id: 'c', text: 'Буг' }], correctId: 'a' };

describe('questionPreview', () => {
  it('marks the one correct option of a single choice', () => {
    const preview = questionPreview(single);
    expect(preview.text).toBe('Найдовша річка України?');
    expect(preview.items).toEqual([
      { text: 'Дніпро', correct: true },
      { text: 'Десна', correct: false },
      { text: 'Буг', correct: false },
    ]);
    expect(preview.points).toBe(1000);
    expect(preview.timeLimit).toBe(30);
  });

  it('marks both correct options of a multi choice', () => {
    const multi: Question = { ...base, id: 'q2', type: 'multi', text: 'Які міста на Дніпрі?', options: [{ id: 'a', text: 'Київ' }, { id: 'b', text: 'Львів' }, { id: 'c', text: 'Дніпро' }], correctIds: ['a', 'c'] };
    expect(questionPreview(multi).items.filter((item) => item.correct === true).map((item) => item.text)).toEqual(['Київ', 'Дніпро']);
  });

  it('a poll has no correct options', () => {
    const poll: Question = { ...base, points: 0, id: 'q3', type: 'poll', text: 'Улюблена пора року?', options: [{ id: 'a', text: 'Літо' }, { id: 'b', text: 'Зима' }] };
    expect(questionPreview(poll).items.map((item) => item.correct)).toEqual([null, null]);
  });

  it('a yes/no question says its answer', () => {
    const no: Question = { ...base, id: 'q4', type: 'boolean', text: 'Говерла вища за 2100 м?', correct: false };
    expect(questionPreview(no).answer).toBe(t('no'));
    expect(questionPreview({ ...no, correct: true }).answer).toBe(t('yes'));
  });

  it('a text question lists its spellings in order and carries the hint', () => {
    const text: Question = { ...base, id: 'q5', type: 'text', text: 'Найвища гора України?', accepted: ['Говерла', 'гора Говерла'], hint: 'Чорногора' };
    const preview = questionPreview(text);
    expect(preview.accepted).toEqual(['Говерла', 'гора Говерла']);
    expect(preview.hint).toBe('Чорногора');
    expect(preview.items).toEqual([]);
    expect(questionPreview(single).hint).toBeNull();
  });

  it('collects the question picture and the option pictures', () => {
    const pictured: Question = { ...single, imageUrl: IMG_A, options: [{ id: 'a', text: 'Дніпро', imageUrl: IMG_B }, { id: 'b', text: 'Десна', imageUrl: IMG_A }] };
    expect(questionPreview(pictured).images).toEqual([IMG_A, IMG_B]);
  });

  it('a video gives its link and takes the timer away', () => {
    const video = { id: 'dQw4w9WgXcQ', start: 75 };
    const preview = questionPreview({ ...single, video });
    expect(preview.video).toEqual({ url: videoLink(video), start: 75 });
    expect(preview.timeLimit).toBeNull();
    expect(preview.audio).toBeNull();
  });

  it('an audio file keeps its start and length and is not a picture', () => {
    const preview = questionPreview({ ...single, audio: { source: 'file', url: SOUND, start: 12, duration: 20 } });
    expect(preview.audio).toEqual({ url: SOUND, start: 12, duration: 20 });
    expect(preview.images).toEqual([]);
  });

  it('a type without its own rule shows the lines of questionLines', () => {
    const order: Question = { ...base, id: 'q6', type: 'order', text: 'Від найдовшої', items: [{ id: 'a', text: 'Дніпро' }, { id: 'b', text: 'Дністер' }, { id: 'c', text: 'Десна' }] };
    expect(questionPreview(order).items).toEqual(questionLines(order).slice(1).map((text) => ({ text, correct: null })));
  });

  it('numbers and the word game give one answer', () => {
    expect(questionPreview({ ...base, id: 'n', type: 'numeric', text: 'Скільки областей?', correct: 24, tolerance: 0 }).answer).toBe('24');
    // 61: замість старого тексту автора — «Вгадай слово: СЛОВО», без підказки.
    const old = questionPreview({ ...base, id: 'w', type: 'wordle', text: 'Ягода з колючого куща', hint: 'Росте при дорозі', word: 'ожина' });
    expect([old.text, old.hint]).toEqual(['Вгадай слово: ОЖИНА', null]);
    expect(questionLines({ ...base, id: 'w', type: 'wordle', text: 'Ягода з колючого куща', word: 'ожина' })).toEqual(['Вгадай слово: ОЖИНА']);
    expect(questionPreview({ ...base, id: 'w', type: 'wordle', text: 'Слово', word: 'КАВУН' }).answer).toBe('КАВУН');
  });

  it('never throws on a question of any type, even with fields missing', () => {
    for (const type of QUESTION_TYPES) {
      const broken = { id: 'x', type, text: 'Щось', points: 10 } as unknown as Question;
      const preview = questionPreview(broken);
      expect(preview.text, type).toBe('Щось');
      expect(Array.isArray(preview.items), type).toBe(true);
    }
    expect(() => questionPreview({} as unknown as Question)).not.toThrow();
  });

  it('memory shows every pair, a picture half by its thumbnail number', () => {
    const preview = questionPreview(BY_TYPE.memory);
    expect(preview.items).toEqual([
      { text: 'Україна — Київ', correct: null },
      { text: `Італія — ${t('adminPreviewImage', { number: 1 })}`, correct: null },
    ]);
    expect(preview.images).toEqual([IMG_B]);
  });

  it('sort shows the category of every word', () => {
    expect(questionPreview(BY_TYPE.sort).items.map((item) => item.text)).toEqual(['Морква — Овочі', 'Яблуко — Фрукти', 'Буряк — Овочі']);
  });

  it('survey shows the popularity and the spellings of every row', () => {
    expect(questionPreview(BY_TYPE.survey).items.map((item) => item.text)).toEqual(['Яблуко — 32 (яблучко)', 'Банан — 25']);
  });

  it('pin gives the point and both radii', () => {
    expect(questionPreview(BY_TYPE.pin).answer).toBe(t('adminPreviewPin', { x: '50', y: '12,5', full: '3', zero: '15' }));
  });

  it('sudoku gives its solution as six rows', () => {
    const preview = questionPreview(BY_TYPE.sudoku);
    expect(preview.grid).toEqual(['123 456', '456 123', '231 564', '564 231', '312 645', '645 312']);
    expect(questionPreview(single).grid).toBeNull();
  });

  it('spotdiff gives the number of spots', () => {
    expect(questionPreview(BY_TYPE.spotdiff).answer).toBe(t('adminPreviewSpots', { count: 2 }));
  });

  it('think shows the host words with their synonyms', () => {
    expect(questionPreview(BY_TYPE.think).items.map((item) => item.text)).toEqual(['червоний (багряний)', 'синій']);
  });

  it('an external picture is a link, not a thumbnail', () => {
    const preview = questionPreview({ ...single, imageUrl: 'https://example.com/a.jpg' });
    expect(preview.images).toEqual([]);
    expect(preview.imageLinks).toEqual(['https://example.com/a.jpg']);
    expect(questionPreview(single).imageLinks).toEqual([]);
  });

  it('every type that has a correct answer shows it', () => {
    for (const type of QUESTION_TYPES) {
      if (NO_ANSWER.has(type)) continue;
      const preview = questionPreview(BY_TYPE[type]);
      expect(preview.items.length > 0 || preview.answer !== null || preview.accepted.length > 0 || preview.grid !== null, type).toBe(true);
    }
  });
});

/** Типи без правильної відповіді: «хмара слів», «Думай як усі» й пазл (його відповідь — сама картинка). */
const NO_ANSWER: ReadonlySet<QuestionType> = new Set(['wordcloud', 'thinkalike', 'jigsaw']);

/** По одному запитанню кожного типу; новий тип ламає компіляцію тесту. */
const BY_TYPE = {
  single,
  multi: { ...base, id: 'm', type: 'multi', text: 'Міста на Дніпрі?', options: [{ id: 'a', text: 'Київ' }, { id: 'b', text: 'Львів' }], correctIds: ['a'] },
  boolean: { ...base, id: 'b', type: 'boolean', text: 'Говерла вища за 2000 м?', correct: true },
  text: { ...base, id: 't', type: 'text', text: 'Найвища гора?', accepted: ['Говерла'] },
  numeric: { ...base, id: 'n', type: 'numeric', text: 'Скільки областей?', correct: 24, tolerance: 0 },
  order: { ...base, id: 'o', type: 'order', text: 'З заходу на схід', items: [{ id: 'a', text: 'Львів' }, { id: 'b', text: 'Київ' }] },
  match: { ...base, id: 'mt', type: 'match', text: 'Місто й річка', pairs: [{ left: { id: 'a', text: 'Київ' }, right: { id: 'x', text: 'Дніпро' } }] },
  chain: { ...base, id: 'c', type: 'chain', text: 'Ланцюжок', words: ['Риба', 'Океан'], hintSeconds: 5 },
  wordladder: { ...base, id: 'wl', type: 'wordladder', text: 'Драбина', path: ['поле', 'пола'], maxSteps: 4 },
  sort: {
    ...base,
    id: 's',
    type: 'sort',
    text: 'Овочі й фрукти',
    lockSeconds: 3,
    categories: [
      { id: 'c1', text: 'Овочі' },
      { id: 'c2', text: 'Фрукти' },
    ],
    words: [
      { id: 'w1', text: 'Морква', categoryId: 'c1' },
      { id: 'w2', text: 'Яблуко', categoryId: 'c2' },
      { id: 'w3', text: 'Буряк', categoryId: 'c1' },
    ],
  },
  slider: { ...base, id: 'sl', type: 'slider', text: 'Скільки відсотків?', min: 0, max: 100, step: 1, correct: 70, tolerance: 2 },
  clues: { ...base, id: 'cl', type: 'clues', text: 'Хто я?', clues: ['Я поет.'], accepted: ['Шевченко'], interval: 5 },
  pin: { ...base, id: 'p', type: 'pin', text: 'Де Київ?', map: 'world', aspect: 2, target: { x: 0.5, y: 0.125 }, fullRadius: 3, zeroRadius: 15 },
  wall: { ...base, id: 'wa', type: 'wall', text: 'Стіна', mistakes: 3, groups: [{ id: 'g', name: 'Річки', tiles: [{ id: 'r1', text: 'Дніпро' }] }] },
  poll: { ...base, points: 0, id: 'po', type: 'poll', text: 'Пора року?', options: [{ id: 'a', text: 'Літо' }] },
  wordcloud: { ...base, points: 0, id: 'wc', type: 'wordcloud', text: 'Асоціації', words: 3 },
  survey: {
    ...base,
    id: 'sv',
    type: 'survey',
    text: 'Фрукт, який люблять діти',
    answers: 3,
    rows: [
      { id: 'sa', text: 'Яблуко', popularity: 32, accepted: ['яблучко'] },
      { id: 'sb', text: 'Банан', popularity: 25, accepted: [] },
    ],
  },
  timedlist: { ...base, id: 'tl', type: 'timedlist', text: 'Планети', minus: null, items: [{ id: 'l1', text: 'Марс', accepted: [] }] },
  letterwords: { ...base, id: 'lw', type: 'letterwords', text: 'Слова з літер', set: { kind: 'fixed', letters: 'морква' }, goal: 'most', per: 'word' },
  wordle: { ...base, id: 'w', type: 'wordle', text: 'Слово', word: 'КАВУН' },
  moreless: { ...base, id: 'ml', type: 'moreless', text: 'Більше чи менше', pairs: [{ id: 'm1', prompt: 'Що вище?', a: { text: 'Говерла', value: '2061 м' }, b: { text: 'Петрос', value: '2020 м' }, correct: 'a', points: 100 }] },
  drawing: { ...base, id: 'd', type: 'drawing', text: 'Що на малюнку?', accepted: ['соняшник'] },
  sudoku: { ...base, id: 'su', type: 'sudoku', text: 'Судоку', level: 'easy', seed: 1, givens: '0'.repeat(36), solution: '123456456123231564564231312645645312' },
  crossword: { ...base, id: 'cw', type: 'crossword', text: 'Кросворд', mode: 'full', entries: [{ id: 'e1', answer: 'калина', clue: 'Червоні ягоди' }], key: null, layout: null },
  jigsaw: { ...base, id: 'j', type: 'jigsaw', text: 'Пазл', photo: IMG_A, aspect: '4:3', focus: { x: 0.5, y: 0.5 }, rows: 3, cols: 4, seed: 1, tabs: '', preview: true },
  spotdiff: { ...base, id: 'sd', type: 'spotdiff', text: 'Відмінності', original: IMG_A, changed: IMG_B, aspect: 4 / 3, spots: [{ x: 0.2, y: 0.3, r: 0.05 }, { x: 0.6, y: 0.5, r: 0.06 }] },
  memory: { ...base, id: 'mm', type: 'memory', text: 'Пари', grid: '3x4', seed: 42, pairs: [{ a: { text: 'Україна' }, b: { text: 'Київ' } }, { a: { text: 'Італія' }, b: { text: '', imageUrl: IMG_B } }] },
  melody: { ...base, id: 'me', type: 'melody', text: 'Пісня?', track: { source: 'file', url: SOUND, start: 5 }, accepted: ['Щедрик'] },
  videoclip: { ...base, id: 'vc', type: 'videoclip', text: 'Кліп?', clip: { id: 'dQw4w9WgXcQ', start: 12 }, muted: true, accepted: ['Кліп'] },
  bluff: { ...base, id: 'bl', type: 'bluff', text: 'Вежу ставили в …', choiceTime: 30, accepted: ['Барселона'], lies: ['Мадрид'] },
  thinkalike: { ...base, id: 'ta', type: 'thinkalike', text: 'Фрукт' },
  spy: { ...base, id: 'sp', type: 'spy', text: 'Асоціація', accepted: ['кава'], spyHint: "Що п'ють зранку", voteTime: 30 },
  think: { ...base, points: 0, id: 'th', type: 'think', text: 'Колір веселки', words: [{ word: 'червоний', synonyms: ['багряний'] }, { word: 'синій', synonyms: [] }] },
} satisfies Record<QuestionType, Question>;
