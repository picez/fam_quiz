import { describe, expect, it } from 'vitest';
import { emptyBrief, type GuidePage } from '@quiz/shared';
import { guidePageText, roundHow, typeHow } from './guide-text';
import { roundSummary } from './round-summary';

describe('guide texts', () => {
  it('the order line uses the quiz label in lower case; without a label it says how to submit', () => {
    expect(typeHow('order', 'Найбільший')).toBe('Розставте рядки стрілками ↑ ↓: зверху — найбільший.');
    expect(typeHow('order', '')).toBe('Розставте рядки стрілками ↑ ↓ і натисніть «Відповісти».');
    expect(typeHow('order', '   ')).toBe('Розставте рядки стрілками ↑ ↓ і натисніть «Відповісти».');
    expect(typeHow('single')).toBe('Торкніться одного правильного варіанта.');
  });

  it('every question type has a line', () => {
    for (const type of ['single', 'multi', 'boolean', 'text', 'numeric', 'order', 'match', 'chain', 'sort'] as const) expect(typeHow(type).length).toBeGreaterThan(10);
  });

  it('how each round works: an instant blitz differs, the final adds the wager mode', () => {
    expect(roundHow(emptyBrief('classic'))).toEqual(['Запитання йдуть по черзі; кожен відповідає у своєму телефоні.']);
    expect(roundHow({ ...emptyBrief('blitz'), instant: true })[0]).toContain('Відповідайте одразу');
    expect(roundHow(emptyBrief('blitz'))[0]).toContain('«Відповісти»');
    expect(roundHow(emptyBrief('board'))[0]).toContain('кубик');
    expect(roundHow({ ...emptyBrief('final'), wagerMode: 'bank' })).toEqual([
      'Спершу таємна ставка в телефоні — від 0 до вашого рахунку, потім одне запитання для всіх.',
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
    expect(questions.items[0]).toMatchObject({ icon: '↕', name: 'Впорядкування', line: 'Розставте рядки стрілками ↑ ↓: зверху — найбільший.', details: [] });
  });

  it('buffs, debuffs, the phone page and duels', () => {
    expect(guidePageText({ kind: 'buffs', buffs: ['fifty'] }).items).toEqual([{ icon: '½', name: '50/50', line: 'Прибирає частину неправильних варіантів.', details: [] }]);
    expect(guidePageText({ kind: 'buffs', buffs: ['fifty'] }).lead).toHaveLength(2);
    expect(guidePageText({ kind: 'debuffs', debuffs: ['fog'] }).items[0]).toMatchObject({ icon: '🌫️', name: 'Туман' });
    const phone = guidePageText({ kind: 'phone' });
    expect(phone.lead).toHaveLength(3);
    expect(phone.items).toEqual([]);
    const duel = (stake: number): GuidePage => ({ kind: 'duels', after: 4, questions: 3, stake });
    expect(guidePageText(duel(300)).lead).toContain('Переможець забирає в суперника 300 балів.');
    expect(guidePageText(duel(0)).lead.join(' ')).not.toContain('забирає');
    expect(guidePageText(duel(0)).lead[0]).toBe('Після 4 запитань у шапці телефона з’явиться кнопка «⚔ Дуель».');
    expect(guidePageText(duel(0)).lead[2]).toContain('3');
    expect(guidePageText({ kind: 'duels', after: 1, questions: 3, stake: 2 }).lead).toEqual(
      expect.arrayContaining(['Після 1 запитання у шапці телефона з’явиться кнопка «⚔ Дуель».', 'Переможець забирає в суперника 2 бали.']),
    );
  });
});
