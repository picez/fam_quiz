import { describe, expect, it } from 'vitest';
import { emptyBrief, type GuidePage } from '@quiz/shared';
import { guidePageText, lowerFirst, roundHow, typeHow } from './guide-text';
import { roundSummary } from './round-summary';

describe('guide texts', () => {
  it('the order line uses the quiz label in lower case; without a label it says how to submit', () => {
    expect(typeHow('order', 'Найбільший')).toBe('Розставте рядки стрілками ↑ ↓ (зверху — найбільший) і натисніть «Відповісти».');
    expect(typeHow('order', '')).toBe('Розставте рядки стрілками ↑ ↓ і натисніть «Відповісти».');
    expect(typeHow('order', '   ')).toBe('Розставте рядки стрілками ↑ ↓ і натисніть «Відповісти».');
    expect(typeHow('single')).toBe('Торкніться одного правильного варіанта.');
  });

  it('the order label keeps abbreviations as written', () => {
    expect(lowerFirst('Найбільший')).toBe('найбільший');
    expect(lowerFirst('ВВП')).toBe('ВВП');
    expect(lowerFirst('NASA')).toBe('NASA');
    expect(lowerFirst('Я')).toBe('Я');
    expect(lowerFirst('1 місце')).toBe('1 місце');
    expect(typeHow('order', 'NASA')).toContain('(зверху — NASA)');
  });

  it('every question type has a line', () => {
    for (const type of ['single', 'multi', 'boolean', 'text', 'numeric', 'order', 'match', 'chain', 'sort'] as const) expect(typeHow(type).length).toBeGreaterThan(10);
  });

  it('how each round works: an instant blitz differs, the final adds the wager mode', () => {
    expect(roundHow(emptyBrief('classic'))).toEqual(['Запитання йдуть по черзі; кожен відповідає у своєму телефоні.']);
    expect(roundHow({ ...emptyBrief('blitz'), instant: true })[0]).toContain('Кнопки немає');
    expect(roundHow(emptyBrief('blitz'))[0]).toContain('«Відповісти»');
    expect(roundHow(emptyBrief('board'))[0]).toContain('кубик');
    expect(roundHow({ ...emptyBrief('final'), wagerMode: 'bank' })).toEqual([
      'Спершу таємна ставка в телефоні, потім одне запитання для всіх.',
      'Хто помилився або не відповів, віддає ставку в спільний банк; хто відповів правильно, зберігає свою й ділить банк пропорційно ставкам.',
    ]);
    expect(roundHow({ ...emptyBrief('final'), wagerMode: 'classic' })[1]).toContain('плюс ставка');
  });

  it('a rounds page lists each kind with its scoring lines; a questions page uses the label', () => {
    const brief = { ...emptyBrief('classic'), speedBonus: true };
    const rounds = guidePageText({ kind: 'rounds', rounds: [brief] });
    expect(rounds.title).toBe('Раунди цієї гри');
    expect(rounds.items).toEqual([{ icon: '❓', name: 'Класичний', line: roundHow(brief).join(' '), details: roundSummary(brief) }]);
    const questions = guidePageText({ kind: 'questions', types: [{ type: 'order', top: 'Найбільший' }] });
    expect(questions.items[0]).toMatchObject({ icon: '↕', name: 'Впорядкування', line: 'Розставте рядки стрілками ↑ ↓ (зверху — найбільший) і натисніть «Відповісти».', details: [] });
  });

  it('buffs, debuffs, the phone page and duels', () => {
    expect(guidePageText({ kind: 'buffs', buffs: ['fifty'] }).items).toEqual([{ icon: '½', name: '50/50', line: 'Прибирає частину неправильних варіантів.', details: [] }]);
    expect(guidePageText({ kind: 'buffs', buffs: ['fifty'] }).lead).toHaveLength(2);
    expect(guidePageText({ kind: 'debuffs', debuffs: ['fog'] }).items[0]).toMatchObject({ icon: '🌫️', name: 'Туман' });
    const phone = guidePageText({ kind: 'phone' });
    expect(phone.lead).toHaveLength(3);
    expect(phone.items).toEqual([]);
    const duel = (stake: number): GuidePage => ({ kind: 'duels', after: 4, questions: 3, stake, final: true });
    expect(guidePageText(duel(300)).lead).toContain('Переможець забирає в суперника 300 балів.');
    expect(guidePageText(duel(0)).lead.join(' ')).not.toContain('забирає');
    expect(guidePageText(duel(0)).lead[0]).toBe('Після 4 запитань у шапці телефона з’явиться кнопка «⚔ Дуель». Викликати можна до фіналу.');
    expect(guidePageText(duel(0)).lead[2]).toContain('3');
    expect(guidePageText({ kind: 'duels', after: 1, questions: 3, stake: 2, final: false }).lead).toEqual(
      expect.arrayContaining(['Після 1 запитання у шапці телефона з’явиться кнопка «⚔ Дуель». Викликати можна до останнього раунду.', 'Переможець забирає в суперника 2 бали.']),
    );
  });
});

describe('teams guide page (10j)', () => {
  it('has a title and a body with the number of teams', () => {
    const text = guidePageText({ kind: 'teams', count: 3 });
    expect(text.title).toBe('Граємо командами');
    expect(text.lead.join(' ')).toContain('Команд: 3');
  });
});

describe('guide texts without a host', () => {
  it('the phone page, the debuffs lead, the buff line and the board line name no host', () => {
    expect(guidePageText({ kind: 'phone' }, true).lead).toContain('Правильну відповідь і бали покаже сцена; ваш рахунок — угорі телефона.');
    expect(guidePageText({ kind: 'phone' }).lead.join(' ')).toContain('покаже ведучий');
    expect(roundHow(emptyBrief('board'), true)).toEqual(['Спершу черга: кожен кидає кубик у телефоні. У свій хід виберіть клітинку — категорію й ціну.']);
    expect(roundHow(emptyBrief('board'))[0]).toContain('ведучий');
    expect(guidePageText({ kind: 'debuffs', debuffs: ['mirror'] } as GuidePage, true).lead).toEqual(['Перешкоду на одне запитання можна купити суперникові за бали (кнопка 😈). Відповісти все одно можна.']);
    expect(guidePageText({ kind: 'buffs', buffs: ['hint'] } as GuidePage, true).items[0].line).toBe('Підказка з вікторини лише вам.');
    expect(guidePageText({ kind: 'buffs', buffs: ['hint'] } as GuidePage).items[0].line).toBe('Підказка від ведучого лише вам.');
  });
});
