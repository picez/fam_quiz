import { describe, expect, it } from 'vitest';
import type { AppealView, PublicQuestion, Question } from '@quiz/shared';
import { appealAsk, appealButtonText, appealPresented, appealCountText, appealResultText, appealTitle, historyAppealText } from './appeal-text';

const appeal = (over: Partial<AppealView> = {}): AppealView => ({
  id: 1,
  by: { playerId: 'p1', nickname: 'Оля' },
  reason: 'grade',
  answer: { type: 'text', value: 'Одеська' },
  question: {
    id: 'q',
    text: 'Місто біля моря?',
    imageUrl: null,
    video: null,
    timeLimit: 20,
    points: 1000,
    type: 'text',
    accepted: ['Одеса'],
  },
  points: 200,
  endsAt: 100_000,
  remainingMs: null,
  yes: 1,
  no: 0,
  waiting: 1,
  outcome: null,
  undone: false,
  ...over,
});

describe('appeal texts', () => {
  it('names the appellant, and a team through «Команда «…» оскаржує»', () => {
    expect(appealTitle(appeal(), false)).toBe('⚖️ Оля оскаржує');
    expect(appealTitle(appeal({ by: { playerId: 'team-r', nickname: 'Червоні' } }), true)).toBe('⚖️ Команда «Червоні» оскаржує');
  });

  it('asks the hall about the answer or about the away penalty', () => {
    expect(appealAsk(appeal())).toBe('Відповідь «Одеська», правильна — «Одеса». Зарахувати?');
    expect(appealAsk(appeal({ reason: 'away', answer: null }))).toBe('Штраф за вихід із гри. Зняти штраф?');
  });

  it('a shuffled single choice: the letter of the right answer follows the order this screen showed', () => {
    const question: Question = {
      id: 'c1',
      text: 'Столиця України?',
      imageUrl: null,
      video: null,
      timeLimit: 20,
      points: 1000,
      type: 'single',
      options: [
        { id: 'a', text: 'Львів' },
        { id: 'b', text: 'Київ' },
        { id: 'c', text: 'Одеса' },
      ],
      correctId: 'b',
    };
    const view = appeal({ question, answer: { type: 'single', optionId: 'a' } });
    const shown = (order: string[], text = question.text) =>
      ({ type: 'single', text, choices: order.map((id) => ({ id, text: question.type === 'single' ? (question.options.find((o) => o.id === id)?.text ?? '') : '' })) }) as unknown as PublicQuestion;
    // Показ «Київ, Одеса, Львів»: правильна — A, а не B авторського порядку.
    const shuffled = shown(['b', 'c', 'a']);
    expect(appealPresented(view, shuffled)).toEqual(shuffled.choices);
    expect(appealAsk(view, appealPresented(view, shuffled))).toBe('Відповідь «Львів», правильна — «A. Київ». Зарахувати?');
    // Запасне запитання (інший текст) чи екран без запитання: без літер з обох боків.
    expect(appealPresented(view, shown(['b', 'c', 'a'], 'Інше запитання?'))).toBeUndefined();
    expect(appealPresented(view, null)).toBeUndefined();
    expect(appealAsk(view)).toBe('Відповідь «Львів», правильна — «Київ». Зарахувати?');
    // Текстова відповідь порядку не має.
    expect(appealPresented(appeal(), shuffled)).toBeUndefined();
  });

  it('counts yes, no and those still thinking, without the last when nobody thinks', () => {
    expect(appealCountText({ yes: 3, no: 1, waiting: 2 })).toBe('так 3 · ні 1 · ще думають 2');
    expect(appealCountText({ yes: 3, no: 1, waiting: 0 })).toBe('так 3 · ні 1');
    expect(appealCountText({ yes: 1, no: 0, waiting: 1 })).toBe('так 1 · ні 0 · ще думає 1');
    expect(appealCountText({ yes: 0, no: 0, waiting: 5 })).toBe('так 0 · ні 0 · ще думають 5');
    expect(appealCountText({ yes: 0, no: 0, waiting: 21 })).toBe('так 0 · ні 0 · ще думає 21');
  });

  it('shows the result of a closed appeal and nothing for an open or cancelled one', () => {
    expect(appealResultText(appeal({ outcome: 'yes', points: 200, waiting: 0 }))).toBe('⚖️ Зараховано! +200');
    expect(appealResultText(appeal({ outcome: 'yes', points: 0, waiting: 0 }))).toBe('⚖️ Зараховано!');
    expect(
      appealResultText(
        appeal({
          outcome: 'yes',
          reason: 'away',
          answer: null,
          points: 300,
          waiting: 0,
        }),
      ),
    ).toBe('⚖️ Штраф знято');
    expect(appealResultText(appeal({ outcome: 'tie', yes: 1, no: 1, waiting: 0 }))).toBe('⚖️ Лишається як було · так 1 · ні 1');
    expect(appealResultText(appeal({ outcome: 'no', yes: 0, no: 2, waiting: 0 }))).toBe('⚖️ Лишається як було · так 0 · ні 2');
    expect(appealResultText(appeal({ outcome: 'host', waiting: 0 }))).toBe('⚖️ Зараховано ведучим');
    expect(appealResultText(appeal())).toBeNull();
    expect(appealResultText(appeal({ outcome: 'cancelled', waiting: 0 }))).toBeNull();
  });

  it('an undone yes says the decision of the hall was undone', () => {
    expect(appealResultText(appeal({ outcome: 'yes', points: 0, waiting: 0, undone: true }))).toBe('⚖️ Рішення залу скасовано');
    expect(appealResultText(appeal({ outcome: 'yes', reason: 'away', answer: null, points: 0, waiting: 0, undone: true }))).toBe('⚖️ Рішення залу скасовано');
  });

  it('labels the buttons with the appeals left', () => {
    expect(appealButtonText('grade', 2)).toBe('⚖️ Оскаржити (лишилось 2)');
    expect(appealButtonText('away', 1)).toBe('⚖️ Оскаржити штраф (лишилось 1)');
  });

  it('history: yes, kept (no and tie), host and the away variants, with the count', () => {
    expect(historyAppealText({ reason: 'grade', yes: 2, no: 0, outcome: 'yes' })).toBe('⚖️ зараховано 2:0');
    expect(historyAppealText({ reason: 'grade', yes: 1, no: 1, outcome: 'tie' })).toBe('⚖️ лишилось як було 1:1');
    expect(historyAppealText({ reason: 'grade', yes: 0, no: 2, outcome: 'no' })).toBe('⚖️ лишилось як було 0:2');
    expect(historyAppealText({ reason: 'grade', yes: 0, no: 1, outcome: 'host' })).toBe('⚖️ зараховано ведучим');
    expect(historyAppealText({ reason: 'away', yes: 2, no: 0, outcome: 'yes' })).toBe('⚖️ штраф знято 2:0');
    expect(historyAppealText({ reason: 'away', yes: 0, no: 2, outcome: 'no' })).toBe('⚖️ штраф лишився 0:2');
    expect(historyAppealText({ reason: 'away', yes: 0, no: 0, outcome: 'tie' })).toBe('⚖️ штраф лишився 0:0');
    expect(historyAppealText({ reason: 'away', yes: 0, no: 0, outcome: 'host' })).toBe('⚖️ зараховано ведучим');
  });

  it('never uses gendered past forms', () => {
    const all = [
      appealTitle(appeal(), false),
      appealTitle(appeal(), true),
      appealAsk(appeal()),
      appealAsk(appeal({ reason: 'away' })),
      appealCountText(appeal()),
      ...(['yes', 'no', 'tie', 'host'] as const).map((outcome) => appealResultText(appeal({ outcome })) ?? ''),
      appealResultText(appeal({ outcome: 'yes', undone: true })) ?? '',
      appealButtonText('grade', 2),
      appealButtonText('away', 2),
    ];
    for (const text of all) expect(text).not.toMatch(/голосував|голосувала|оскаржив|оскаржила/);
  });
});
