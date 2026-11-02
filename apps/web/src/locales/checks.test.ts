import { describe, expect, it } from 'vitest';
import type { Locale } from '@quiz/shared';
import { ukMessages } from '../i18n';
import { pushStrings } from '../push/push-strings';
import { checkLocale, digitRuns, glossary, integerForms, placeholders, pluralBases, type Issue } from './checks';
import { loadMessages, type Messages } from './load';
import { ENABLED_LOCALES } from './locales';

type Dicts = { ui: Messages; help: Messages; push: Messages };
const dicts = (ui: Messages, help: Messages = {}, push: Messages = {}): Dicts => ({ ui, help, push });
const kinds = (issues: Issue[]) => issues.map((issue) => `${issue.kind}:${issue.key}`);

describe('integerForms', () => {
  it('lists the plural forms each locale uses for whole numbers', () => {
    expect(integerForms('uk')).toEqual(['few', 'many', 'one']);
    expect(integerForms('en')).toEqual(['one', 'other']);
    expect(integerForms('de')).toEqual(['one', 'other']);
    expect(integerForms('pl')).toEqual(['few', 'many', 'one']);
    expect(integerForms('es')).toEqual(['many', 'one', 'other']);
    expect(integerForms('it')).toEqual(['many', 'one', 'other']);
    expect(integerForms('ar')).toEqual(['few', 'many', 'one', 'other', 'two', 'zero']);
  });
});

describe('helpers', () => {
  it('finds plural bases, placeholders and digit runs', () => {
    expect(pluralBases({ a_one: '', a_few: '', a_many: '', b_one: '', adminLog_ban: '' })).toEqual(['a']);
    expect(placeholders('{total} і {answered} з {total}')).toEqual(['answered', 'total']);
    expect(digitRuns('Разом до {total} бала (не більше 2000), 2 з 10')).toEqual(['10', '2', '2000']);
    expect(digitRuns('{p2} only')).toEqual([]);
  });

  it('builds a glossary of quoted UI values', () => {
    expect(glossary([{ authorStart: 'Почати гру', authorStartHint: 'Натисни «Почати гру», коли…', other: '«Невідоме»' }])).toEqual({ 'Почати гру': 'authorStart' });
  });
});

describe('checkLocale', () => {
  const uk = dicts({ yes: 'Так', no: 'Ні' });

  it('reports missing and extra keys', () => {
    expect(kinds(checkLocale('en', uk, dicts({ yes: 'Yes', maybe: 'Maybe' })))).toEqual(['missing:no', 'extra:maybe']);
    expect(kinds(checkLocale('en', dicts({}, { 'round.classic.title': 'Класика' }), dicts({}, {})))).toEqual(['missing:round.classic.title']);
  });

  it('reports placeholders that differ', () => {
    const issues = checkLocale('en', dicts({ answeredOf: 'Відповіли {answered} з {total}' }), dicts({ answeredOf: '{answered} of {totl}' }));
    expect(kinds(issues)).toEqual(['placeholders:answeredOf']);
  });

  it('requires every plural form of the locale', () => {
    const source = dicts({ questionCount_one: '{count} запитання', questionCount_few: '{count} запитання', questionCount_many: '{count} запитань' });
    expect(kinds(checkLocale('en', source, dicts({ questionCount_one: '{count} question' })))).toEqual(['plural:questionCount_other']);
    expect(checkLocale('en', source, dicts({ questionCount_one: '{count} question', questionCount_other: '{count} questions' }))).toEqual([]);
    expect(
      kinds(checkLocale('en', source, dicts({ questionCount_one: '{count} question', questionCount_other: '{count} questions', questionCount_few: 'x' }))),
    ).toEqual(['extra:questionCount_few']);
  });

  it('lets a plural form drop the number', () => {
    const source = dicts({ questionCount_one: '{count} запитання', questionCount_few: '{count} запитання', questionCount_many: '{count} запитань' });
    const ar = {
      questionCount_zero: '{count} سؤال',
      questionCount_one: 'سؤال واحد',
      questionCount_two: 'سؤالان',
      questionCount_few: '{count} أسئلة',
      questionCount_many: '{count} سؤالًا',
      questionCount_other: '{count} سؤال',
    };
    expect(checkLocale('ar', source, dicts(ar))).toEqual([]);
    expect(kinds(checkLocale('ar', source, dicts({ ...ar, questionCount_two: '{count} {who}' })))).toEqual(['placeholders:questionCount_two']);
  });

  it('reports numbers that differ', () => {
    const issues = checkLocale('en', dicts({ sortTotal: 'Разом до {total} бала (не більше 2000)' }), dicts({ sortTotal: 'Up to {total} points (max 200)' }));
    expect(kinds(issues)).toEqual(['digits:sortTotal']);
  });

  it('reports Cyrillic and Arabic-Indic digits', () => {
    expect(kinds(checkLocale('en', dicts({ city: 'Місто' }), dicts({ city: 'Київ' })))).toEqual(['cyrillic:city']);
    expect(kinds(checkLocale('ar', dicts({ three: 'Три' }), dicts({ three: '٣' })))).toEqual(['indic_digits:three']);
    expect(checkLocale('en', dicts({ three: 'Три' }), dicts({ three: 'Three' }))).toEqual([]);
  });

  it('reports a quoted term translated differently from its button', () => {
    const source = dicts({ authorStart: 'Почати гру', authorStartHint: 'Натисни «Почати гру», коли…' });
    expect(kinds(checkLocale('en', source, dicts({ authorStart: 'Start game', authorStartHint: 'Press “Begin” when…' })))).toEqual(['quote:authorStartHint']);
    expect(checkLocale('en', source, dicts({ authorStart: 'Start game', authorStartHint: 'Press “Start Game” when…' }))).toEqual([]);
    const help = dicts({ authorStart: 'Почати гру' }, { 'round.x.how.0': 'Тисни «Почати гру».' });
    expect(kinds(checkLocale('en', help, dicts({ authorStart: 'Start game' }, { 'round.x.how.0': 'Press “Go”.' })))).toEqual(['quote:round.x.how.0']);
  });

  it('limits menu labels', () => {
    const source = dicts({ menuShortHistory: 'Історія', menuHistory: 'Історія', menuLabel: 'Меню' });
    expect(kinds(checkLocale('en', source, dicts({ menuShortHistory: 'Gameshistory', menuHistory: 'Game history', menuLabel: 'Navigation menu items' })))).toEqual([
      'menu_length:menuShortHistory',
    ]);
    expect(kinds(checkLocale('de', source, dicts({ menuShortHistory: 'Verlauf', menuHistory: 'Spielverlaufsliste', menuLabel: 'Menü' })))).toEqual([
      'menu_length:menuHistory',
    ]);
    expect(checkLocale('ar', source, dicts({ menuShortHistory: 'السجل', menuHistory: 'السجل', menuLabel: 'القائمة' }))).toEqual([]);
  });

  it('skips a key listed in the exceptions for its kind only', () => {
    const source = dicts({ sortTotal: 'Разом до {total} бала (не більше 2000)' });
    const target = dicts({ sortTotal: 'Up to {totl} points (max 200)' });
    expect(kinds(checkLocale('en', source, target))).toEqual(['placeholders:sortTotal', 'digits:sortTotal']);
    expect(kinds(checkLocale('en', source, target, { digits: ['sortTotal'] }))).toEqual(['placeholders:sortTotal']);
  });
});

describe('real dictionaries', () => {
  const pushKeys = new Set(Object.keys(pushStrings));
  const ui: Messages = Object.fromEntries(Object.entries(ukMessages).filter(([key]) => !pushKeys.has(key)));
  const sources: Dicts = { ui, help: {}, push: pushStrings };
  const others = ENABLED_LOCALES.filter((one): one is Exclude<Locale, 'uk'> => one !== 'uk');

  for (const locale of others) {
    it(`${locale} is complete`, async () => {
      const loaded = await loadMessages(locale);
      expect(checkLocale(locale, sources, { ui: loaded.ui, help: loaded.help, push: {} })).toEqual([]);
    });
  }

  it('checks every enabled locale but uk', () => {
    expect(others).toEqual(ENABLED_LOCALES.slice(1));
  });
});
