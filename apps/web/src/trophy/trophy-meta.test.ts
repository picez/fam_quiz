import { describe, expect, it } from 'vitest';
import { prizeSummary, trophyLabel } from './trophy-meta';

describe('trophyLabel', () => {
  it('agrees the material with the gender of the kind', () => {
    expect(trophyLabel({ kind: 'cup', material: 'gold' })).toBe('Золотий кубок');
    expect(trophyLabel({ kind: 'medal', material: 'silver' })).toBe('Срібна медаль');
    expect(trophyLabel({ kind: 'crown', material: 'bronze' })).toBe('Бронзова корона');
    expect(trophyLabel({ kind: 'star', material: 'diamond' })).toBe('Діамантова зірка');
    expect(trophyLabel({ kind: 'statuette', material: 'gold' })).toBe('Золота статуетка');
    expect(trophyLabel({ kind: 'cup', material: 'diamond' })).toBe('Діамантовий кубок');
  });
});

describe('prizeSummary', () => {
  const none = { trophy: null, engraving: null, real: null, title: null, diploma: false };

  it('joins the trophy and the real prize', () => {
    expect(prizeSummary({ ...none, trophy: { kind: 'cup', material: 'gold' }, real: { text: 'Піца', photoUrl: null } })).toBe(
      '🏆 Золотий кубок · 🎁 Піца',
    );
  });

  it('lists the title and the diploma too, in order', () => {
    expect(prizeSummary({ ...none, trophy: { kind: 'medal', material: 'bronze' }, engraving: 'Чемпіон', title: 'Знавець', diploma: true })).toBe(
      '🏅 Бронзова медаль · 🎗️ Титул «Знавець» · 📜 Диплом',
    );
  });

  it('shows the title, the diploma or, when alone, the engraving', () => {
    expect(prizeSummary({ ...none, title: 'Знавець' })).toBe('🎗️ Титул «Знавець»');
    expect(prizeSummary({ ...none, diploma: true })).toBe('📜 Диплом');
    expect(prizeSummary({ ...none, engraving: 'Чемпіон' })).toBe('✒️ «Чемпіон»');
  });
});
