import { afterEach, describe, expect, it } from 'vitest';
import { activateLocale, activateLocaleForTests, loadLocale } from '../i18n';
import { podiumColumns, prizeSummary, titleBadge, trophyLabel } from './trophy-meta';

describe('trophyLabel', () => {
  it('agrees the material with the gender of the kind', () => {
    expect(trophyLabel({ kind: 'cup', material: 'gold' })).toBe('Золотий кубок');
    expect(trophyLabel({ kind: 'medal', material: 'silver' })).toBe('Срібна медаль');
    expect(trophyLabel({ kind: 'crown', material: 'bronze' })).toBe('Бронзова корона');
    expect(trophyLabel({ kind: 'star', material: 'diamond' })).toBe('Діамантова зірка');
    expect(trophyLabel({ kind: 'statuette', material: 'gold' })).toBe('Золота статуетка');
    expect(trophyLabel({ kind: 'cup', material: 'diamond' })).toBe('Діамантовий кубок');
  });

  describe('in Polish', () => {
    afterEach(() => activateLocaleForTests('uk'));

    it('agrees the material with the Polish gender, where a medal is masculine', async () => {
      await loadLocale('pl');
      activateLocale('pl');
      expect(trophyLabel({ kind: 'medal', material: 'silver' })).toBe('Srebrny medal');
      expect(trophyLabel({ kind: 'cup', material: 'gold' })).toBe('Złoty puchar');
      expect(trophyLabel({ kind: 'crown', material: 'bronze' })).toBe('Brązowa korona');
    });
  });

  describe('in German', () => {
    afterEach(() => activateLocaleForTests('uk'));

    it('agrees the strong adjective ending with der Pokal / der Stern and die Medaille / Krone / Statuette', async () => {
      await loadLocale('de');
      activateLocale('de');
      expect(trophyLabel({ kind: 'cup', material: 'gold' })).toBe('Goldener Pokal');
      expect(trophyLabel({ kind: 'star', material: 'diamond' })).toBe('Diamantener Stern');
      expect(trophyLabel({ kind: 'medal', material: 'silver' })).toBe('Silberne Medaille');
      expect(trophyLabel({ kind: 'crown', material: 'bronze' })).toBe('Bronzene Krone');
      expect(trophyLabel({ kind: 'statuette', material: 'gold' })).toBe('Goldene Statuette');
    });
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

describe('titleBadge', () => {
  it('prefixes the crown only when the title does not start with an emoji', () => {
    expect(titleBadge('Король')).toBe('👑 Король');
    expect(titleBadge('👑 Король')).toBe('👑 Король');
    expect(titleBadge('🦉 Сова вікторин')).toBe('🦉 Сова вікторин');
    expect(titleBadge('1-й номер')).toBe('👑 1-й номер');
  });
});

describe('podiumColumns', () => {
  const shown = (place: 1 | 2 | 3) => ({ place, content: { trophy: null, engraving: null, real: null, title: null, diploma: false }, winner: { name: 'X', members: [] } });

  it('keeps only the places of the ceremony, left to right 2 — 1 — 3', () => {
    expect(podiumColumns([shown(3), shown(2), shown(1)])).toEqual([2, 1, 3]);
    expect(podiumColumns([shown(2), shown(1)])).toEqual([2, 1]);
    expect(podiumColumns([shown(1)])).toEqual([1]);
    expect(podiumColumns([shown(3), shown(1)])).toEqual([1, 3]);
    expect(podiumColumns([])).toEqual([]);
  });
});
