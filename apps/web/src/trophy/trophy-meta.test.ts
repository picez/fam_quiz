import type { TrophyDecor } from '@quiz/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { activateLocale, activateLocaleForTests, loadLocale } from '../i18n';
import { TROPHY_KINDS, TROPHY_MATERIALS } from '@quiz/shared';
import { MATERIAL_GROUPS, MATERIAL_LOOK, TROPHY_EMOJI, TROPHY_GROUPS, modelUrl, podiumColumns, prizeSummary, titleBadge, trophyLabel } from './trophy-meta';

describe('trophyLabel', () => {
  it('agrees the material with the gender of the kind', () => {
    expect(trophyLabel({ kind: 'cup', material: 'gold' })).toBe('Золотий кубок');
    expect(trophyLabel({ kind: 'medal', material: 'silver' })).toBe('Срібна медаль');
    expect(trophyLabel({ kind: 'crown', material: 'bronze' })).toBe('Бронзова корона');
    expect(trophyLabel({ kind: 'star', material: 'diamond' })).toBe('Діамантова зірка');
    expect(trophyLabel({ kind: 'statuette', material: 'gold' })).toBe('Золота статуетка');
    expect(trophyLabel({ kind: 'cup', material: 'diamond' })).toBe('Діамантовий кубок');
    expect(trophyLabel({ kind: 'grail', material: 'gold' })).toBe('Золотий грааль');
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
      expect(trophyLabel({ kind: 'grail', material: 'gold' })).toBe('Goldener Gral');
    });
  });

  describe('in Spanish', () => {
    afterEach(() => activateLocaleForTests('uk'));

    it('puts the noun first, all five kinds being feminine', async () => {
      await loadLocale('es');
      activateLocale('es');
      expect(trophyLabel({ kind: 'cup', material: 'gold' })).toBe('Copa de oro');
      expect(trophyLabel({ kind: 'medal', material: 'silver' })).toBe('Medalla de plata');
      expect(trophyLabel({ kind: 'crown', material: 'bronze' })).toBe('Corona de bronce');
      expect(trophyLabel({ kind: 'star', material: 'diamond' })).toBe('Estrella de diamante');
      expect(trophyLabel({ kind: 'statuette', material: 'gold' })).toBe('Estatuilla de oro');
    });
  });

  describe('in Italian', () => {
    afterEach(() => activateLocaleForTests('uk'));

    it("puts the noun first with an elided «d'» before a vowel, all five kinds being feminine", async () => {
      await loadLocale('it');
      activateLocale('it');
      expect(trophyLabel({ kind: 'cup', material: 'gold' })).toBe("Coppa d'oro");
      expect(trophyLabel({ kind: 'cup', material: 'silver' })).toBe("Coppa d'argento");
      expect(trophyLabel({ kind: 'cup', material: 'bronze' })).toBe('Coppa di bronzo');
      expect(trophyLabel({ kind: 'cup', material: 'diamond' })).toBe('Coppa di diamante');
      expect(trophyLabel({ kind: 'medal', material: 'silver' })).toBe("Medaglia d'argento");
      expect(trophyLabel({ kind: 'crown', material: 'bronze' })).toBe('Corona di bronzo');
      expect(trophyLabel({ kind: 'star', material: 'diamond' })).toBe('Stella di diamante');
      expect(trophyLabel({ kind: 'statuette', material: 'gold' })).toBe("Statuetta d'oro");
    });
  });

  describe('in Arabic', () => {
    afterEach(() => activateLocaleForTests('uk'));

    it('puts the noun first and the adjective agrees with its gender', async () => {
      await loadLocale('ar');
      activateLocale('ar');
      expect(trophyLabel({ kind: 'cup', material: 'gold' })).toBe('كأس ذهبية');
      expect(trophyLabel({ kind: 'medal', material: 'silver' })).toBe('ميدالية فضية');
      expect(trophyLabel({ kind: 'crown', material: 'bronze' })).toBe('تاج برونزي');
      expect(trophyLabel({ kind: 'star', material: 'diamond' })).toBe('نجمة ماسية');
      expect(trophyLabel({ kind: 'statuette', material: 'gold' })).toBe('تمثال ذهبي');
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

  it('labels the grail kind with its goblet emoji', () => {
    expect(prizeSummary({ ...none, trophy: { kind: 'grail', material: 'gold' } })).toBe('🍷 Золотий грааль');
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

describe('modelUrl', () => {
  const decor: TrophyDecor = { photos: [], photoPlace: 'ring', frame: 'none', photoStyle: 'normal', inscriptions: [], effect: { kind: 'none' }, appearance: 'spin', stickers: [] };
  it('keeps the baked family grail only for a grail without decor', () => {
    expect(modelUrl({ kind: 'grail', material: 'gold' })).toBe('/models/grail-family.glb');
    expect(modelUrl({ kind: 'grail', material: 'gold', decor: null })).toBe('/models/grail-family.glb');
    expect(modelUrl({ kind: 'grail', material: 'gold', decor })).toBe('/models/grail.glb');
  });
  it('is the kind model for everything else', () => {
    expect(modelUrl({ kind: 'cup', material: 'gold' })).toBe('/models/cup.glb');
    expect(modelUrl({ kind: 'cup', material: 'gold', decor })).toBe('/models/cup.glb');
  });
});

describe('groups and tables (25e)', () => {
  it('groups cover every kind and material once', () => {
    expect(TROPHY_GROUPS.flatMap((g) => g.kinds).sort()).toEqual([...TROPHY_KINDS].sort());
    expect(MATERIAL_GROUPS.flatMap((g) => g.materials).sort()).toEqual([...TROPHY_MATERIALS].sort());
  });
  it('has an emoji and a look for every kind and material, old looks untouched', () => {
    for (const kind of TROPHY_KINDS) expect(TROPHY_EMOJI[kind], kind).toBeTruthy();
    expect(MATERIAL_LOOK.gold).toEqual({ color: '#E8B84A', metallic: 1, roughness: 0.2 });
    expect(MATERIAL_LOOK.neon.emissiveIntensity).toBe(1.4);
    expect(MATERIAL_LOOK.marble.pattern?.kind).toBe('marble');
  });
  it('agrees a new material with a new kind', () => {
    expect(trophyLabel({ kind: 'plate', material: 'gold' })).toBe('Золота тарілка-трофей');
    expect(trophyLabel({ kind: 'laurel', material: 'wood' })).toBe('Дерев’яний лавровий вінок');
    expect(trophyLabel({ kind: 'vase', material: 'rosegold' })).toBe('Рожевозолота ваза');
  });
});

describe('new names in every locale (25e)', () => {
  afterEach(() => activateLocaleForTests('uk'));

  it('every kind and material makes a label in every locale', async () => {
    for (const locale of ['uk', 'en', 'pl', 'de', 'es', 'it', 'ar'] as const) {
      await loadLocale(locale);
      activateLocale(locale);
      for (const kind of TROPHY_KINDS) {
        for (const material of TROPHY_MATERIALS) {
          const label = trophyLabel({ kind, material });
          expect(label.trim(), `${locale} ${kind} ${material}`).not.toBe('');
          expect(label, `${locale} ${kind} ${material}`).not.toMatch(/material_|trophy_/);
        }
      }
    }
  });

  it('agrees the new kinds in each language', async () => {
    const use = async (locale: 'en' | 'pl' | 'de' | 'es' | 'it' | 'ar') => {
      await loadLocale(locale);
      activateLocale(locale);
    };
    await use('en');
    expect(trophyLabel({ kind: 'fist', material: 'copper' })).toBe('Copper raised fist');
    await use('de');
    expect(trophyLabel({ kind: 'octagon', material: 'gold' })).toBe('Goldene achteckige Medaille');
    expect(trophyLabel({ kind: 'goblet', material: 'gold' })).toBe('Goldener Kelch');
    await use('es');
    expect(trophyLabel({ kind: 'vase', material: 'gold' })).toBe('Jarrón de oro');
    await use('it');
    expect(trophyLabel({ kind: 'flame', material: 'gold' })).toBe("Fiamma d'oro");
    await use('pl');
    expect(trophyLabel({ kind: 'fist', material: 'gold' })).toBe('Złota pięść');
    await use('ar');
    expect(trophyLabel({ kind: 'crown', material: 'bronze' })).toBe('تاج برونزي');
    expect(trophyLabel({ kind: 'flame', material: 'gold' })).toBe('شعلة ذهبية');
  });
});
