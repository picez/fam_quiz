import { describe, expect, it } from 'vitest';
import { emptyBrief, type AnswerMode } from '@quiz/shared';
import { roundSummary } from './round-summary';

describe('roundSummary', () => {
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
});
