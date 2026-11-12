import { describe, expect, it } from 'vitest';
import { emptyBrief, type AnswerMode } from '@quiz/shared';
import { buffName } from './buff-meta';
import { roundSummary } from './round-summary';
import { t } from './i18n';

describe('roundSummary', () => {
  it('bets: the minimum with its step, then the maximum or all the points', () => {
    const bets = { betStart: 200, betStep: 100, betMax: 600, count: 5 };
    expect(roundSummary({ ...emptyBrief('bets'), bets })).toEqual(['Мінімальна ставка: 200, далі щоразу +100', 'Найбільша ставка: 600']);
    expect(roundSummary({ ...emptyBrief('bets'), bets: { ...bets, betMax: null } })[1]).toBe('Можна ставити всі свої бали');
    expect(roundSummary({ ...emptyBrief('bets'), bets: { ...bets, betStep: 0 } })[0]).toBe('Мінімальна ставка: 200, однакова весь раунд');
  });

  it('auction: the bid rule, then what a mistake costs', () => {
    const auction = { mode: 'step' as const, step: 50, loss: 'bid' as const, count: 4 };
    expect(roundSummary({ ...emptyBrief('auction'), auction })).toEqual(['Ставки кроком +50', 'Помилка коштує ставки']);
    expect(roundSummary({ ...emptyBrief('auction'), auction: { ...auction, mode: 'free', loss: 'bid_price' } })).toEqual([
      'Ставка — будь-яка сума, більша за поточну',
      'Помилка коштує ставки й ціни запитання',
    ]);
  });

  it('quest: the code length with the tries, then the bonus', () => {
    const quest = { length: 4, tries: 3, count: 5, bonus: { kind: 'points' as const, points: 1200 } };
    expect(roundSummary({ ...emptyBrief('quest'), quest })).toEqual(['Код із 4 символів, спроб: 3', 'Бонус до 1200 балів — чим раніше, тим більше']);
    const buff = roundSummary({ ...emptyBrief('quest'), quest: { ...quest, bonus: { kind: 'buff' as const, buff: 'fifty' as const, first: 2 } } });
    expect(buff[1]).toBe(`Бонус — ще один баф «${buffName('fifty')}», лише першим 2`);
    expect(roundSummary({ ...emptyBrief('quest'), quest: { ...quest, bonus: { kind: 'buff' as const, buff: 'fifty' as const, first: null } } })[1]).toBe(`Бонус — ще один баф «${buffName('fifty')}»`);
  });

  it('truth: the price of a guess and the author share', () => {
    expect(roundSummary({ ...emptyBrief('truth'), truth: { points: 300, time: 30 } })).toEqual([
      'Запитання — факти гравців; вгадали — 300, автор — частка за кожного, хто не вгадав',
    ]);
  });

  it('puzzles: the rule, then only the kinds there are, with plurals', () => {
    const rule = t('summaryPuzzles');
    expect(roundSummary({ ...emptyBrief('puzzles'), puzzles: { sudoku: 3, crossword: 0, jigsaw: 0, spotdiff: 0, memory: 0, time: 540 } })).toEqual([rule, '3 судоку']);
    expect(roundSummary({ ...emptyBrief('puzzles'), puzzles: { sudoku: 1, crossword: 2, jigsaw: 0, spotdiff: 0, memory: 0, time: 600 } })).toEqual([rule, '1 судоку · 2 кросворди']);
    expect(roundSummary({ ...emptyBrief('puzzles'), puzzles: { sudoku: 0, crossword: 5, jigsaw: 0, spotdiff: 0, memory: 0, time: 1200 } })).toEqual([rule, '5 кросвордів']);
    expect(roundSummary({ ...emptyBrief('puzzles'), puzzles: { sudoku: 0, crossword: 1, jigsaw: 0, spotdiff: 0, memory: 0, time: 240 } })).toEqual([rule, '1 кросворд']);
    expect(roundSummary({ ...emptyBrief('puzzles'), puzzles: { sudoku: 0, crossword: 0, jigsaw: 0, spotdiff: 0, memory: 0, time: 0 } })).toEqual([rule]);
    expect(roundSummary({ ...emptyBrief('puzzles'), puzzles: { sudoku: 1, crossword: 0, jigsaw: 2, spotdiff: 0, memory: 0, time: 360 } })).toEqual([rule, '1 судоку · 2 пазли']);
    expect(roundSummary({ ...emptyBrief('puzzles'), puzzles: { sudoku: 0, crossword: 0, jigsaw: 5, spotdiff: 0, memory: 0, time: 600 } })).toEqual([rule, '5 пазлів']);
    expect(roundSummary({ ...emptyBrief('puzzles'), puzzles: { sudoku: 0, crossword: 0, jigsaw: 1, spotdiff: 0, memory: 2, time: 600 } })).toEqual([rule, '1 пазл · 2 «Пам’яті»']);
    expect(roundSummary({ ...emptyBrief('puzzles'), puzzles: { sudoku: 0, crossword: 0, jigsaw: 0, spotdiff: 0, memory: 1, time: 90 } })).toEqual([rule, '1 «Пам’ять»']);
    expect(roundSummary({ ...emptyBrief('puzzles'), puzzles: { sudoku: 0, crossword: 0, jigsaw: 0, spotdiff: 0, memory: 5, time: 450 } })).toEqual([rule, '5 «Пам’ятей»']);
  });

  it('a classic round with melodies says how they score', () => {
    expect(roundSummary({ ...emptyBrief('classic'), melodies: 1 }).at(-1)).toBe('1 мелодія: бали за найдовшим шматком, який послухали');
    expect(roundSummary({ ...emptyBrief('classic'), melodies: 2 }).at(-1)).toBe('2 мелодії: бали за найдовшим шматком, який послухали');
    expect(roundSummary({ ...emptyBrief('classic'), melodies: 5 }).at(-1)).toBe('5 мелодій: бали за найдовшим шматком, який послухали');
    expect(roundSummary(emptyBrief('classic')).join(' ')).not.toContain('мелод');
  });

  it('a default classic round: everyone answers, faster is more', () => {
    expect(roundSummary({ ...emptyBrief('classic'), speedBonus: true })).toEqual([
      'Відповідають усі: бали отримує кожен, хто відповів правильно.',
      'Якщо є таймер, швидша правильна відповідь дає більше балів.',
    ]);
  });
  it('a classic round lists the penalty, the streak and the multiplier on one line', () => {
    const brief = { ...emptyBrief('classic'), penalty: true, multiplier: 2 as const, streak: { length: 2, bonus: { kind: 'percent' as const, value: 20 } } };
    expect(roundSummary(brief)).toEqual([
      'Відповідають усі: бали отримує кожен, хто відповів правильно.',
      'Помилка: мінус ціна запитання · Серія з 2 правильних: +20% · Усі бали ×2',
    ]);
  });
  it('an instant blitz explains answering at once with one attempt', () => {
    expect(roundSummary({ ...emptyBrief('blitz'), instant: true, attempts: 1 })).toEqual([
      'Бали отримує лише той, хто першим правильно відповість.',
      'Відповідайте одразу, без кнопки: одна спроба, відповіді перевіряються в порядку надходження.',
    ]);
  });
  it('a blitz round says that only the first right answer scores', () => {
    expect(roundSummary({ ...emptyBrief('blitz'), attempts: 1, answerWindow: 15 })).toEqual([
      'Бали отримує лише той, хто першим правильно відповість.',
      'Натисніть «Відповісти», щоб стати в чергу, і відповідайте за 15 с.',
      'Спроб на запитання: 1',
    ]);
    expect(roundSummary({ ...emptyBrief('blitz'), penalty: true })).toEqual([
      'Бали отримує лише той, хто першим правильно відповість.',
      'Натисніть «Відповісти», щоб стати в чергу, і відповідайте у відведений час.',
      'Спроб без обмежень · Помилка: мінус ціна запитання',
    ]);
  });
  it('a blitz round with series lists both steps', () => {
    const lines = roundSummary({ ...emptyBrief('blitz'), penalty: true, series: { plus: 250, minus: 250 } });
    expect(lines.at(-1)).toContain('серія: кожна правильна поспіль +250');
    expect(lines.at(-1)).toContain('серія: кожна помилка поспіль −250');
    expect(roundSummary({ ...emptyBrief('blitz'), penalty: true, series: null })).toEqual(roundSummary({ ...emptyBrief('blitz'), penalty: true }));
  });
  it('a board round: turns, the answer mode and blitz cells', () => {
    expect(roundSummary({ ...emptyBrief('board'), answerModes: ['phone'] })).toEqual([
      'Гравці по черзі вибирають клітинку; відповідає той, хто вибрав.',
      'Відповідь — на телефоні.',
    ]);
  });
  it('never takes more than four lines', () => {
    const everything = {
      ...emptyBrief('board'), answerModes: ['phone', 'voice'] as AnswerMode[], marks: true, blitzCells: true, penaltyAll: true,
      penalty: true, multiplier: 3 as const, streak: { length: 3, bonus: { kind: 'fixed' as const, value: 200 } },
    };
    expect(roundSummary(everything)).toEqual([
      'Гравці по черзі вибирають клітинку; відповідає той, хто вибрав.',
      'Відповідь — на телефоні або вголос, залежно від клітинки.',
      'На бліц-клітинці бали отримує перший, хто правильно відповість; якщо це той, хто вибрав клітинку, ціна подвійна.',
      'Є клітинки ×2 і ×3 · Деякі бліц-клітинки: мінус усім, крім того, хто вгадав · Помилка на звичайній клітинці: мінус ціна запитання · Серія з 3 правильних: +200 · Усі бали ×3',
    ]);
    for (const type of ['classic', 'blitz', 'final'] as const) {
      expect(roundSummary({ ...everything, type, attempts: 3, answerWindow: 30, speedBonus: true }).length).toBeLessThanOrEqual(4);
    }
  });
  it('a final round explains the secret wager', () => {
    expect(roundSummary({ ...emptyBrief('final'), wagerMode: 'classic' })).toEqual([
      'Кожен таємно ставить від 0 до свого рахунку.',
      'Правильна відповідь — плюс ставка, неправильна або жодної — мінус ставка.',
    ]);
  });
  it('a bank final explains the shared bank', () => {
    expect(roundSummary({ ...emptyBrief('final'), wagerMode: 'bank' })).toEqual([
      'Кожен таємно ставить від 0 до свого рахунку.',
      'Хто помилився або не відповів, віддає ставку в спільний банк; хто відповів правильно, зберігає свою й ділить банк пропорційно ставкам.',
    ]);
  });
  it('a wipeout round explains the bank and the take', () => {
    expect(roundSummary(emptyBrief('wipeout'))).toEqual([t('summaryWipeout'), t('summaryWipeoutTake')]);
  });
  it('a survival round explains the edge, the trial and the bonus, then the classic modifiers', () => {
    const brief = { ...emptyBrief('survival'), penalty: true, survival: { trial: 'luck' as const, survivors: 1, bonus: 500 } };
    expect(roundSummary(brief)).toEqual([
      t('summarySurvival'),
      t('summarySurvivalTrial_luck'),
      t('summarySurvivalBonus', { bonus: 500 }),
      t('summaryPenalty'),
    ]);
    const none = { ...brief, penalty: false, survival: { trial: 'question' as const, survivors: 1, bonus: 0 } };
    expect(roundSummary(none)).toEqual([t('summarySurvival'), t('summarySurvivalTrial_question')]);
  });
  it('the ladder hint is not «від ведучого» in a game with no host', () => {
    const brief = { ...emptyBrief('ladder'), ladder: { pick: 'random' as const, lifelines: ['fifty' as const, 'hint' as const], top: 10000, timer: true } };
    expect(roundSummary(brief).join(' ')).toContain('Підказка ведучого');
    expect(roundSummary(brief, true).join(' ')).not.toMatch(/ведуч/i);
  });
  it('a ladder round explains the contestant, the pick, the hall and the lifelines, with no modifiers', () => {
    const ladder = { pick: 'lowest' as const, lifelines: ['fifty' as const, 'audience' as const], top: 10000, timer: false };
    const brief = { ...emptyBrief('ladder'), ladder };
    expect(roundSummary(brief)).toEqual([
      t('summaryLadderContestant', { top: 10000 }),
      t('summaryLadderPick_lowest'),
      t('summaryLadderHall'),
      t('summaryLadderLifelines', { list: `${buffName('fifty')}, ${buffName('audience')}` }),
    ]);
    expect(roundSummary({ ...brief, ladder: { ...ladder, lifelines: [] } })).toEqual([
      t('summaryLadderContestant', { top: 10000 }),
      t('summaryLadderPick_lowest'),
      t('summaryLadderHall'),
    ]);
  });
});
