import { describe, expect, it } from 'vitest';
import { emptyBrief, type Answer, type Question, type RoundInfo } from '@quiz/shared';
import { questionLabel, roundFacts, roundLabel, answerText, choiceLabel, choicesOf, correctPairs, correctText, formatDate, formatDay, orderLabelsText, pairTexts, pickedText, secondsText, shownChoices, seenText, sliderNumber } from './format';

const base = { id: 'q', text: '?', imageUrl: null, video: null, timeLimit: 20, points: 1000 };
const options = [
  { id: 'a', text: 'Львів' },
  { id: 'b', text: 'Київ' },
  { id: 'c', text: 'Одеса' },
];
const single: Question = { ...base, type: 'single', options, correctId: 'b' };
const multi: Question = { ...base, type: 'multi', options, correctIds: ['a', 'c'] };
const bool: Question = { ...base, type: 'boolean', correct: false };
const text: Question = { ...base, type: 'text', accepted: ['Одеса', 'Одесса'] };
const numeric: Question = { ...base, type: 'numeric', correct: 2061, tolerance: 100 };
const order: Question = { ...base, type: 'order', items: options };

describe('correctText', () => {
  it('describes the correct answer of every question type', () => {
    expect(correctText(single)).toBe('B. Київ');
    expect(correctText(multi)).toBe('A. Львів, C. Одеса');
    expect(correctText(bool)).toBe('Ні');
    expect(correctText(text)).toBe('Одеса');
    expect(correctText(numeric)).toBe('2061 (± 100)');
    expect(correctText({ ...numeric, tolerance: 0 })).toBe('2061');
    expect(correctText(order)).toBe('Львів → Київ → Одеса');
  });
});

describe('survey texts (10e)', () => {
  const row = (id: string, text: string, popularity: number) => ({ id, text, popularity, accepted: [] });
  const survey: Question = { ...base, type: 'survey', answers: 3, rows: [row('a', 'Яблуко', 32), row('b', 'Банан', 25), row('c', 'Полуниця', 15), row('d', 'Кавун', 10), row('e', 'Груша', 8)] };
  it('correctText lists the rows by popularity', () => {
    expect(correctText(survey)).toBe('Яблуко (32); Банан (25); Полуниця (15); Кавун (10); Груша (8)');
  });
  it('answerText marks hits and misses, or lists the values without hits', () => {
    expect(answerText({ type: 'survey', values: ['яблучко', 'ананас'], rows: ['a', null] }, survey)).toBe('яблучко ✓, ананас ✗');
    expect(answerText({ type: 'survey', values: ['яблучко', 'ананас'] } as unknown as Answer, survey)).toBe('яблучко, ананас');
  });
});

describe('clues and pin texts (10c)', () => {
  const clues: Question = { ...base, type: 'clues', clues: ['а', 'б', 'в'], accepted: ['Шевченко'], interval: 8 };
  const pin: Question = { ...base, type: 'pin', map: 'ukraine', aspect: 16 / 11, target: { x: 0.5, y: 0.5 }, fullRadius: 3, zeroRadius: 15 };
  it('correctText', () => {
    expect(correctText(clues)).toBe('Шевченко');
    expect(correctText(pin)).toBe('Точка на мапі «Україна»');
    expect(correctText({ ...pin, map: null, imageUrl: '/uploads/aaaaaaaaaaaaaaaaaaaa.png' } as Question)).toBe('Точка на картинці');
  });
  it('answerText', () => {
    const wide: Question = { ...pin, map: 'world', aspect: 2 } as Question;
    expect(answerText({ type: 'pin', x: 0.52, y: 0.5 }, wide)).toBe('Точка за 2,0 % від правильної');
    expect(answerText({ type: 'pin', x: 0.52, y: 0.5 }, null)).toBe('Точка на мапі');
    expect(answerText({ type: 'clues', value: 'Шевченко' }, clues)).toBe('Шевченко');
  });
});

describe('wall, poll and word cloud texts (10d)', () => {
  const tile = (id: string, text: string) => ({ id, text });
  const names = ['Річки', 'Гори', 'Озера', 'Острови'];
  const wall = {
    ...base,
    type: 'wall',
    mistakes: 3,
    groups: names.map((name, g) => ({ id: `g${g}`, name, tiles: [0, 1, 2, 3].map((n) => tile(`t${g}${n}`, `${name}${n}`)) })),
  } as Question;
  const poll: Question = { ...base, type: 'poll', points: 0, options: [{ id: 'a', text: 'Весна' }, { id: 'b', text: 'Літо' }] };
  it('correctText', () => {
    expect(correctText(wall)).toBe('Групи: Річки; Гори; Озера; Острови');
    expect(correctText(poll)).toBe('Без правильної відповіді');
    expect(correctText({ ...base, type: 'wordcloud', points: 0, words: 3 })).toBe('Без правильної відповіді');
  });
  it('answerText', () => {
    expect(answerText({ type: 'wall', found: 2, groups: 4, mistakes: 1, timeMs: null }, wall)).toBe('2 з 4 груп, помилок: 1');
    expect(answerText({ type: 'wall', found: 4, groups: 4, mistakes: 1, timeMs: 5000 }, wall)).toBe('Стіну складено, помилок: 1');
    expect(answerText({ type: 'poll', optionId: 'b' }, poll)).toBe('Літо');
    expect(answerText({ type: 'wordcloud', words: ['каштани', 'Дніпро'] }, null)).toBe('каштани, Дніпро');
  });
});

describe('picture options', () => {
  it('labels a picture-only option by its letter wherever text is needed', () => {
    const pics = {
      ...base,
      type: 'single' as const,
      options: [{ id: 'a', text: 'Львів' }, { id: 'b', text: '', imageUrl: '/uploads/abcdefabcdefabcd.png' }, { id: 'c', text: 'Одеса' }],
      correctId: 'b',
    };
    expect(choiceLabel(pics.options[1], 1)).toBe('Картинка B');
    expect(choiceLabel(pics.options[0], 0)).toBe('Львів');
    expect(answerText({ type: 'single', optionId: 'b' }, pics)).toBe('картинка');
    expect(answerText({ type: 'single', optionId: 'b' }, pics, [{ id: 'b' }, { id: 'a' }, { id: 'c' }])).toBe('Картинка A');
    expect(correctText(pics)).toBe('B. картинка');
    expect(pickedText({ type: 'single', optionId: 'b' }, [pics.options[1], pics.options[0]])).toBe('Картинка A');
    expect(choicesOf(pics)[1]).toEqual({ id: 'b', text: 'картинка', imageUrl: '/uploads/abcdefabcdefabcd.png' });
  });
});

describe('order labels', () => {
  it('order labels in words and in the revealed answer', () => {
    expect(orderLabelsText({ top: 'Найбільший', bottom: 'Найменший' })).toBe('зверху — Найбільший, знизу — Найменший');
    expect(orderLabelsText({ top: '', bottom: 'Найменший' })).toBe('знизу — Найменший');
    expect(orderLabelsText({ top: '', bottom: '' })).toBe('');
    expect(correctText({ ...order, topLabel: 'Захід', bottomLabel: 'Схід' })).toBe('Львів → Київ → Одеса (зверху — Захід, знизу — Схід)');
    expect(correctText(order)).toBe('Львів → Київ → Одеса');
  });
});

describe('slider texts (10b)', () => {
  const slider: Question = { ...base, type: 'slider', min: 1900, max: 2100, step: 1, correct: 1991, tolerance: 2, unit: 'рік' };

  it('correctText: unit after a space, tolerance only when positive', () => {
    expect(correctText(slider)).toBe('1991 рік (± 2)');
    expect(correctText({ ...slider, tolerance: 0 })).toBe('1991 рік');
    expect(correctText({ ...slider, tolerance: 0, unit: undefined })).toBe('1991');
  });

  it('answerText: the value with the unit, decimals as in the step', () => {
    expect(answerText({ type: 'slider', value: 1990 }, slider)).toBe('1990 рік');
    const km: Question = { ...base, type: 'slider', min: 0, max: 10, step: 0.5, correct: 2, tolerance: 0, unit: 'км' };
    expect(answerText({ type: 'slider', value: 2.5 }, km)).toBe('2,5 км');
  });

  it('sliderNumber: uk-UA, as many decimals as the step has', () => {
    expect(sliderNumber(1990, 1)).toBe('1990');
    expect(sliderNumber(0.25, 0.25)).toBe('0,25');
    expect(sliderNumber(2, 0.5)).toBe('2,0');
  });
});

describe('answerText', () => {
  it('describes a player answer using the question options', () => {
    expect(answerText({ type: 'single', optionId: 'c' }, single)).toBe('Одеса');
    expect(answerText({ type: 'multi', optionIds: ['c', 'a'] }, multi)).toBe('Одеса, Львів');
    expect(answerText({ type: 'boolean', value: true }, bool)).toBe('Так');
    expect(answerText({ type: 'text', value: 'Адеса' }, text)).toBe('Адеса');
    expect(answerText({ type: 'numeric', value: 2000.5 }, numeric)).toBe('2000.5');
    expect(answerText({ type: 'order', itemIds: ['c', 'a', 'b'] }, order)).toBe('Одеса → Львів → Київ');
  });

  it('falls back to ids when the option is unknown or the question is missing', () => {
    expect(answerText({ type: 'single', optionId: 'zzz' }, single)).toBe('zzz');
    expect(answerText({ type: 'single', optionId: 'a' }, null)).toBe('a');
  });
});

describe('correctText with a presented order', () => {
  it('uses the letters players actually see when options were shuffled', () => {
    const presented = [{ id: 'b' }, { id: 'c' }, { id: 'a' }];
    expect(correctText(single, presented)).toBe('A. Київ');
    expect(correctText(multi, presented)).toBe('B. Одеса, C. Львів');
  });
});

describe('formatDate', () => {
  it('shows the day, the month in words and the time', () => {
    const text = formatDate('2026-10-12T15:30:00.000Z');
    expect(text).toMatch(/\d{1,2} жовт/);
    expect(text).toMatch(/\d{1,2}:\d{2}/);
  });

  it('returns an empty string for something that is not a date', () => {
    expect(formatDate('не дата')).toBe('');
  });
});

describe('formatDay', () => {
  it('shows the day and the month in words with the year, without the time', () => {
    const text = formatDay('2026-10-29T10:00:00.000Z');
    expect(text).toContain('жовтня 2026');
    expect(text).not.toContain(':');
  });

  it('reads the day in Kyiv time', () => {
    expect(formatDay('2026-10-28T22:30:00.000Z')).toBe('29 жовтня 2026');
  });

  it('returns an empty string for something that is not a date', () => {
    expect(formatDay('нісенітниця')).toBe('');
  });
});

describe('match questions', () => {
  const pair = (l: string, lt: string, r: string, rt: string) => ({ left: { id: l, text: lt }, right: { id: r, text: rt } });
  const matchQ: Question = {
    ...base,
    type: 'match',
    pairs: [pair('a', 'Київ', 'x', 'Дніпро'), pair('b', 'Львів', 'y', 'Полтва'), pair('c', 'Ужгород', 'z', 'Уж')],
  };

  it('writes match answers and the correct pairs as pairs', () => {
    expect(correctText(matchQ)).toBe('Київ — Дніпро; Львів — Полтва; Ужгород — Уж');
    expect(answerText({ type: 'match', links: [{ left: 'b', right: 'x' }, { left: 'a', right: 'y' }] }, matchQ)).toBe('Львів — Дніпро; Київ — Полтва');
    expect(pairTexts([{ left: 'a', right: '??' }], choicesOf(matchQ))).toEqual([{ left: 'Київ', right: '??' }]);
    expect(correctPairs(matchQ)[1]).toEqual({ left: 'Львів', right: 'Полтва' });
    expect(correctPairs(single)).toEqual([]);
  });

  it('lists the left and right items as shown choices', () => {
    const shown = shownChoices({ choices: [{ id: 'a', text: 'Київ' }], right: [{ id: 'x', text: 'Дніпро' }] } as never);
    expect(shown.map((c) => c.id)).toEqual(['a', 'x']);
  });
});

it('an untitled final round is called «Фінал»', () => {
  expect(roundLabel('', 3, 'final')).toBe('Фінал');
  expect(roundLabel('Космос', 3, 'final')).toBe('Космос');
});

describe('chain texts', () => {
  const chainQ: Question = { ...base, type: 'chain', words: ['Форель', 'Риба', 'Океан', 'Корабель'], hintSeconds: 5 };
  it('writes the chain and chain answers in words', () => {
    expect(correctText(chainQ)).toBe('Форель → Риба → Океан → Корабель');
    expect(answerText({ type: 'chain', solved: 3, hints: 1, timeMs: 23_400 }, chainQ)).toBe('Пройдено за 23,4 с, підказок: 1');
    expect(answerText({ type: 'chain', solved: 1, hints: 0, timeMs: 20_000 }, chainQ)).toBe('Слів: 1 з 3');
    expect(answerText({ type: 'chain', solved: 1, hints: 0, timeMs: 20_000 }, null)).toBe('Слів: 1');
    expect(secondsText(5000)).toBe('5,0');
  });
});

describe('sort texts', () => {
  const sortQuestion: Question = { ...base, type: 'sort', timeLimit: 60, points: 100, lockSeconds: 3,
    categories: [{ id: 'c1', text: 'Овочі' }, { id: 'c2', text: 'Фрукти' }],
    words: [{ id: 'w1', text: 'Морква', categoryId: 'c1' }, { id: 'w2', text: 'Яблуко', categoryId: 'c2' },
            { id: 'w3', text: 'Буряк', categoryId: 'c1' }, { id: 'w4', text: 'Груша', categoryId: 'c2' }] };
  it('a sort answer and the sort grouping in words', () => {
    expect(answerText({ type: 'sort', sorted: 4, total: 4, misses: 2, timeMs: 41_234 }, sortQuestion)).toBe('Відсортовано 4 з 4 за 41,2 с, помилок: 2');
    expect(answerText({ type: 'sort', sorted: 3, total: 4, misses: 0, timeMs: null }, null)).toBe('Відсортовано 3 з 4, помилок: 0');
    expect(correctText(sortQuestion)).toBe('Овочі: Морква, Буряк; Фрукти: Яблуко, Груша');
  });
});

const info = (type: RoundInfo['type'], total = 1, times: RoundInfo['times'] = null): RoundInfo => ({
  index: 0, total, title: '', type, partial: false, description: '', brief: emptyBrief(type), times,
});

describe('round facts and the question label', () => {
  it('round facts: the count and the time per question', () => {
    expect(roundFacts(info('classic', 1, { min: 30, max: 60 }), 10)).toBe('10 запитань · 30–60 с на кожне');
    expect(roundFacts(info('blitz', 1, { min: 20, max: 20 }), 1)).toBe('1 запитання · 20 с на кожне');
    expect(roundFacts(info('classic', 1, null), 3)).toBe('3 запитання · без таймера');
    expect(roundFacts(info('board', 1, { min: 20, max: 20 }), 24)).toBe('24 клітинки · 20 с на кожну');
    expect(roundFacts(info('board', 1, { min: 20, max: 40 }), 25)).toBe('25 клітинок · 20–40 с на кожну');
    expect(roundFacts(info('final', 1, { min: 30, max: 30 }), 1)).toBeNull();
  });

  it('the question label says how many are left', () => {
    expect(questionLabel(info('classic'), 2, 10)).toBe('Запитання 3 з 10 · лишилося 7');
    expect(questionLabel(info('classic'), 9, 10)).toBe('Запитання 10 з 10 · останнє');
    expect(questionLabel(info('board'), 4, 24)).toBe('Клітинка 5 з 24 · лишилося 19');
    expect(questionLabel(info('board'), 23, 24)).toBe('Клітинка 24 з 24 · остання');
    expect(questionLabel({ ...info('classic', 3), index: 1 }, 1, 5)).toBe('Запитання 2 з 5 · лишилося 3 · Раунд 2');
    expect(questionLabel({ ...info('final', 3), index: 2 }, 0, 1)).toBe('Запитання 1 з 1 · Раунд 3');
    expect(questionLabel(null, 0, 3)).toBe('Запитання 1 з 3 · лишилося 2');
  });
});

describe('bluff (10f)', () => {
  const bluffQ = { ...base, type: 'bluff', timeLimit: 60, choiceTime: 30, accepted: ['Барселона', 'Барселоні'], lies: ['Мадрид', 'Лондон'] } as Question;
  it('correctText is the first spelling of the truth', () => {
    expect(correctText(bluffQ)).toBe('Барселона');
  });
  it('answerText tells the lie, the pick with its mark and how many were fooled', () => {
    expect(answerText({ type: 'bluff', lie: 'Рим', pick: 'Барселона', truth: true, fooled: 1 }, bluffQ)).toBe('вигадка «Рим» · вибір «Барселона» ✓ · купилися: 1');
    expect(answerText({ type: 'bluff', lie: 'Рим', pick: 'Мадрид', truth: false, fooled: 0 }, bluffQ)).toBe('вигадка «Рим» · вибір «Мадрид» ✗');
    expect(answerText({ type: 'bluff', lie: null, pick: null, truth: false, fooled: 0 }, bluffQ)).toBe('без вигадки · без вибору');
  });
});

describe('seenText (backlog 9)', () => {
  const now = Date.parse('2026-10-31T12:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();
  it('online for five minutes, then minutes, hours and the date', () => {
    expect(seenText(null, now)).toBeNull();
    expect(seenText(ago(60_000), now)).toBe('онлайн');
    expect(seenText(ago(12 * 60_000), now)).toBe('був(-ла) 12 хв тому');
    expect(seenText(ago(3 * 3_600_000), now)).toBe('був(-ла) 3 год тому');
    expect(seenText(ago(3 * 86_400_000), now)).toMatch(/^був\(-ла\) 28 жовтня 2026/);
  });
});
