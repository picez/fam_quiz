import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from './csv';
import { applySheet, mergeBatch, SHEET_HEADER, sectionContexts, sheetCsv, sheetRows, statusCounts, todoItems, type Reviewed } from './review-sheet';

const ui = {
  homeTitle: 'Головна сторінка',
  questionCount_one: '{count} запитання',
  questionCount_few: '{count} запитання',
  questionCount_many: '{count} запитань',
  streakBonusLine: '+{points} за серію',
  answeredOf: 'Відповіли {answered} з {total}',
  sortTotal_one: 'Разом до {total} бала (не більше 2000)',
  sortTotal_few: 'Разом до {total} балів (не більше 2000)',
  sortTotal_many: 'Разом до {total} балів (не більше 2000)',
};
const contexts = { homeTitle: 'Головна', questionCount_one: 'Список вікторин', streakBonusLine: 'Підсумок' };
const help = {
  'round.classic.title': 'Класичний',
  'round.classic.how.0': 'Натисніть «Почати раунд».',
  'round.classic.how.1': 'Зачекайте {paceStep} с.',
  'round.classic.how.2': 'Далі.',
};
const push = { pushFallbackTitle: 'Квіз' };
const src = { ui, help, push, contexts };
const empty = { ui: {}, help: {}, push: {} };
const rowOf = (key: string, locale: 'en' | 'pl' = 'en', target = empty, reviewed: Reviewed = {}) =>
  sheetRows(locale, src, target, reviewed).find((row) => row.key === key)!;
const sheetOf = (...rows: string[][]) => toCsv([[...SHEET_HEADER], ...rows]);
const fix = (key: string, correction: string, mark = '') => [key, '', '', '', '', correction, mark];

describe('sheetRows', () => {
  it('makes one row per required plural form of the locale', () => {
    const rows = sheetRows('en', src, empty, {});
    expect(rows.filter((row) => row.key.startsWith('questionCount_')).map((row) => row.key)).toEqual(['questionCount_one', 'questionCount_other']);
    const other = rowOf('questionCount_other');
    expect(other.uk).toBe('{count} запитання / {count} запитання / {count} запитань');
    expect(other.context).toContain('Форма множини other');
    expect(other.context).toContain('2, 3, 4');
    expect(other.context).toContain('Список вікторин');
    expect(other.context).toContain('Плейсхолдери: {count}');
  });

  it('uses the polish forms for pl', () => {
    const forms = sheetRows('pl', src, empty, {}).filter((row) => row.key.startsWith('sortTotal_')).map((row) => row.key);
    expect(forms).toEqual(['sortTotal_few', 'sortTotal_many', 'sortTotal_one']);
  });

  it('takes the context from the section comment above the key', () => {
    const contextMap = sectionContexts(['export const uk = {', '  // Головна', '  homeTitle: 1,', '  homeSub: 2,', '  // Вхід гравця', "  'joinTitle': 3,", '};'].join('\n'));
    expect(contextMap).toEqual({ homeTitle: 'Головна', homeSub: 'Головна', joinTitle: 'Вхід гравця' });
    expect(rowOf('homeTitle').context.startsWith('Головна')).toBe(true);
  });

  it('describes help and push rows', () => {
    expect(rowOf('round.classic.how.1').context).toContain('Довідка ведучого: Класичний');
    expect(rowOf('round.classic.how.1').context).toContain('{paceStep}');
    expect(rowOf('pushFallbackTitle').context).toBe('Сповіщення');
  });

  it('is a draft until the pair is in reviewed, and a draft again when the uk text changes', () => {
    const target = { ...empty, ui: { homeTitle: 'Home' } };
    expect(rowOf('homeTitle', 'en', target).status).toBe('draft');
    const reviewed: Reviewed = { homeTitle: ['Головна сторінка', 'Home'] };
    expect(rowOf('homeTitle', 'en', target, reviewed).status).toBe('reviewed');
    expect(rowOf('homeTitle', 'en', { ...empty, ui: { homeTitle: 'Home page' } }, reviewed).status).toBe('draft');
    const changed = sheetRows('en', { ...src, ui: { ...ui, homeTitle: 'Інша' } }, target, reviewed).find((row) => row.key === 'homeTitle')!;
    expect(changed.status).toBe('draft');
  });
});

describe('sheetCsv', () => {
  it('prefixes a quote when a cell would read as a formula', () => {
    const target = { ...empty, ui: { streakBonusLine: '+{points} for a streak' } };
    const cells = parseCsv(sheetCsv(sheetRows('en', src, target, {}))).find((row) => row[0] === 'streakBonusLine')!;
    expect(cells[2]).toBe("'+{points} за серію");
    expect(cells[3]).toBe("'+{points} for a streak");
    expect(cells[4]).toBe('чернетка (машинний переклад)');
  });

  it('has the header and seven columns', () => {
    const parsed = parseCsv(sheetCsv(sheetRows('en', src, empty, {})));
    expect(parsed[0]).toEqual([...SHEET_HEADER]);
    expect(parsed.every((row) => row.length === 7)).toBe(true);
  });
});

describe('applySheet', () => {
  it('accepts a correction, writes it and marks the pair reviewed', () => {
    const result = applySheet('en', sheetOf(fix('answeredOf', '{answered} of {total} answered')), src, empty, {});
    expect(result.rejected).toEqual([]);
    expect(result.target.ui.answeredOf).toBe('{answered} of {total} answered');
    expect(result.reviewed.answeredOf).toEqual(['Відповіли {answered} з {total}', '{answered} of {total} answered']);
    expect(rowOf('answeredOf', 'en', result.target, result.reviewed).status).toBe('reviewed');
  });

  it('marks an existing translation reviewed with only a tick', () => {
    const target = { ...empty, ui: { answeredOf: '{answered} of {total}' } };
    const result = applySheet('en', sheetOf(fix('answeredOf', '', 'x')), src, target, {});
    expect(result.rejected).toEqual([]);
    expect(result.reviewed.answeredOf).toEqual(['Відповіли {answered} з {total}', '{answered} of {total}']);
    expect(result.target.ui.answeredOf).toBe('{answered} of {total}');
  });

  it('rejects a changed placeholder', () => {
    const result = applySheet('en', sheetOf(fix('answeredOf', '{answered} of {totl}')), src, empty, {});
    expect(result.rejected[0]!.key).toBe('answeredOf');
    expect(result.rejected[0]!.reason).toContain('placeholders');
    expect(result.target.ui).not.toHaveProperty('answeredOf');
    expect(result.reviewed).not.toHaveProperty('answeredOf');
  });

  it('rejects a changed number', () => {
    const result = applySheet('en', sheetOf(fix('sortTotal_other', 'Up to {total} points (max 200)')), src, empty, {});
    expect(result.rejected[0]!.reason).toContain('digits');
  });

  it('rejects an unknown key and still applies the rest', () => {
    const result = applySheet('en', sheetOf(fix('nope', 'Hi'), fix('homeTitle', 'Home')), src, empty, {});
    expect(result.rejected).toEqual([{ key: 'nope', reason: 'unknown_key' }]);
    expect(result.target.ui.homeTitle).toBe('Home');
  });

  it('rejects a plural form the language does not have', () => {
    expect(applySheet('en', sheetOf(fix('questionCount_few', '{count} questions')), src, empty, {}).rejected[0]!.reason).toBe('unknown_key');
  });

  it('rejects a tick on a row without a translation', () => {
    expect(applySheet('en', sheetOf(fix('homeTitle', '', 'x')), src, empty, {}).rejected[0]!.reason).toBe('no_translation');
  });

  it('strips the formula guard quote from a correction', () => {
    const result = applySheet('en', sheetOf(fix('streakBonusLine', "'+{points} for a streak")), src, empty, {});
    expect(result.rejected).toEqual([]);
    expect(result.target.ui.streakBonusLine).toBe('+{points} for a streak');
  });

  it('routes help and push keys to their own dictionaries', () => {
    const result = applySheet('en', sheetOf(fix('pushFallbackTitle', 'Quiz'), fix('round.classic.title', 'Classic')), src, empty, {});
    expect(result.target.push.pushFallbackTitle).toBe('Quiz');
    expect(result.target.help['round.classic.title']).toBe('Classic');
    expect(result.target.ui).toEqual({});
  });

  it('reads a sheet whose rows are shorter than the header', () => {
    const result = applySheet('en', toCsv([[...SHEET_HEADER], ['homeTitle', '', '', '', '', 'Home']]), src, empty, {});
    expect(result.target.ui.homeTitle).toBe('Home');
  });
});

describe('todoItems, mergeBatch and statusCounts', () => {
  it('lists untranslated keys in uk order, a plural base as one item with its forms', () => {
    const items = todoItems('en', src, empty);
    expect(items[0]).toMatchObject({ key: 'homeTitle', uk: 'Головна сторінка', context: 'Головна' });
    const plural = items.find((item) => item.key === 'questionCount')!;
    expect(plural.forms).toEqual(['one', 'other']);
    expect(items.find((item) => item.key === 'pushFallbackTitle')?.context).toBe('Сповіщення');
  });

  it('puts the glossary first and drops translated keys', () => {
    const glossarySrc = { ...src, ui: { ...ui, btnStart: 'Почати раунд' } };
    const items = todoItems('en', glossarySrc, { ...empty, ui: { homeTitle: 'Home' } }, { glossaryFirst: true });
    expect(items[0]!.key).toBe('btnStart');
    expect(items.some((item) => item.key === 'homeTitle')).toBe(false);
    expect(todoItems('en', glossarySrc, empty, { glossaryOnly: true }).map((item) => item.key)).toEqual(['btnStart']);
    expect(todoItems('en', src, empty, { limit: 2 })).toHaveLength(2);
  });

  it('merges a batch into the right dictionaries and reports issues only for batch keys', () => {
    const ok = mergeBatch('en', src, empty, {
      homeTitle: 'Home',
      pushFallbackTitle: 'Quiz',
      'round.classic.title': 'Classic',
      questionCount_one: '{count} question',
      questionCount_other: '{count} questions',
    });
    expect(ok.issues).toEqual([]);
    expect(ok.target.ui.homeTitle).toBe('Home');
    expect(ok.target.push.pushFallbackTitle).toBe('Quiz');
    expect(ok.target.help['round.classic.title']).toBe('Classic');
    const bad = mergeBatch('en', src, empty, { answeredOf: '{answered} of {totl}', mystery: 'x' });
    expect(bad.issues.map((issue) => `${issue.kind}:${issue.key}`)).toEqual(['placeholders:answeredOf', 'unknown_key:mystery']);
  });

  it('counts draft and reviewed translated rows only', () => {
    const target = { ...empty, ui: { homeTitle: 'Home', answeredOf: '{answered} of {total}' } };
    expect(statusCounts('en', src, target, { homeTitle: ['Головна сторінка', 'Home'] })).toEqual({ draft: 1, reviewed: 1 });
    expect(statusCounts('en', src, empty, {})).toEqual({ draft: 0, reviewed: 0 });
  });
});
