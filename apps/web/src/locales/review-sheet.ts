import type { Locale } from '@quiz/shared';
import { checkLocale, digitRuns, glossary, integerForms, placeholders, pluralBases, type Issue } from './checks';
import { parseCsv, toCsv } from './csv';
import { L10N_EXCEPTIONS } from './exceptions';
import type { Messages } from './load';
import { INTL_TAGS } from './locales';

/**
 * Чиста логіка інструмента `pnpm l10n`: рядки файлу вичитки, застосування повернутого CSV, партії перекладу.
 * Без файлової системи: скрипт apps/web/scripts/l10n.ts лише читає й пише JSON.
 */

type Target = Exclude<Locale, 'uk'>;
type Section = 'ui' | 'help' | 'push';
export type Dicts = { ui: Messages; help: Messages; push: Messages };
export type SheetSource = Dicts & { contexts: Record<string, string> };

export type SheetRow = { key: string; context: string; uk: string; translation: string; status: 'draft' | 'reviewed' };
/** key → [uk-текст, переклад], що вичитав рецензент. Зміна будь-якого з двох знову робить рядок чернеткою. */
export type Reviewed = Record<string, [uk: string, translation: string]>;
export type Rejected = { key: string; reason: string };
export type BatchIssue = Omit<Issue, 'kind'> & { kind: Issue['kind'] | 'unknown_key' };
export type TodoItem = { key: string; uk: string; context: string; forms?: string[] };

export const SHEET_HEADER = ['ключ', 'де в застосунку', 'українською', 'переклад', 'статус', 'виправлення', 'перевірено'];
const STATUS_TEXT = { draft: 'чернетка (машинний переклад)', reviewed: 'перевірено' } as const;
const SECTIONS: readonly Section[] = ['ui', 'help', 'push'];
const PLURAL_SUFFIX = /^(.+)_(zero|one|two|few|many|other)$/;
const FORMULA_START = /^[=+\-@]/;
const REVIEWED_MARK_COLUMNS = { correction: 5, mark: 6 };

const own = (messages: Messages, key: string): boolean => Object.prototype.hasOwnProperty.call(messages, key);
const sameList = (a: string[], b: string[]): boolean => a.length === b.length && a.every((item, index) => item === b[index]);
const subsetOf = (part: string[], whole: string[]): boolean => part.every((item) => whole.includes(item));

/** Ключ → найближчий `// коментар` над ним у i18n.ts. */
export function sectionContexts(i18nSource: string): Record<string, string> {
  const found: Record<string, string> = {};
  let current = '';
  for (const line of i18nSource.split(/\r?\n/)) {
    const comment = /^ {2}\/\/\s*(.+?)\s*$/.exec(line);
    if (comment) {
      current = comment[1]!;
      continue;
    }
    const key = /^ {2}['"]?(\w+)['"]?\s*:/.exec(line);
    if (key && current !== '') found[key[1]!] = current;
  }
  return found;
}

type Located = { section: Section; key: string; base?: string; form?: string; ukTexts: string[] };

class Index {
  private bases: Record<Section, Set<string>>;
  constructor(
    private readonly locale: Target,
    readonly src: SheetSource,
  ) {
    this.bases = { ui: new Set(pluralBases(src.ui)), help: new Set(pluralBases(src.help)), push: new Set(pluralBases(src.push)) };
  }

  baseOf(section: Section, key: string): string | undefined {
    const match = PLURAL_SUFFIX.exec(key);
    return match && this.bases[section].has(match[1]!) ? match[1] : undefined;
  }

  ukForms(section: Section, base: string): string[] {
    return Object.keys(this.src[section]).filter((key) => this.baseOf(section, key) === base);
  }

  /** Де живе ключ перекладу: звичайний uk-ключ або `<база>_<форма>`, форма якої є в мові. */
  locate(key: string): Located | undefined {
    const allowed: string[] = new Intl.PluralRules(INTL_TAGS[this.locale]).resolvedOptions().pluralCategories;
    for (const section of SECTIONS) {
      const match = PLURAL_SUFFIX.exec(key);
      if (match && this.bases[section].has(match[1]!)) {
        if (!allowed.includes(match[2]!)) return undefined;
        const ukTexts = this.ukForms(section, match[1]!).map((form) => this.src[section][form]!);
        return { section, key, base: match[1], form: match[2], ukTexts };
      }
      if (own(this.src[section], key)) return { section, key, ukTexts: [this.src[section][key]!] };
    }
    return undefined;
  }
}

const PLACEHOLDER_NOTES: Record<string, string> = {
  count: 'число',
  title: 'назва гри',
  time: 'час',
  when: 'коли',
  points: 'бали',
  total: 'загальна кількість',
  answered: 'скільки відповіли',
};

const HELP_FIELDS: Record<string, string> = { title: 'назва', what: 'опис', how: 'як грати', points: 'бали', tip: 'порада', limits: 'обмеження' };

function helpWhere(key: string, help: Messages): string {
  const match = /^([a-z]+)\.([A-Za-z0-9_]+)\.(title|what|how|points|tip|limits)(?:\.(\d+))?$/.exec(key);
  if (!match) return 'Довідка ведучого';
  const title = help[`${match[1]}.${match[2]}.title`] ?? `${match[1]}.${match[2]}`;
  const field = HELP_FIELDS[match[3]!]!;
  return `Довідка ведучого: ${title} — ${match[4] === undefined ? field : `${field} (${Number(match[4]) + 1})`}`;
}

const EXAMPLE_POOL = [...Array.from({ length: 200 }, (_, index) => index + 1), 0, 1000, 1_000_000, 2_000_000];

/** Три цілі, на яких Intl дає цю форму множини. */
function pluralExamples(locale: Target, form: string): string {
  const rules = new Intl.PluralRules(INTL_TAGS[locale]);
  return EXAMPLE_POOL.filter((count) => rules.select(count) === form)
    .slice(0, 3)
    .join(', ');
}

function contextText(locale: Target, where: string, ukTexts: string[], forms: string[] = []): string {
  const names = [...new Set(ukTexts.flatMap(placeholders))];
  const parts = [where];
  if (names.length > 0) parts.push(`Плейсхолдери: ${names.map((name) => `{${name}} — ${PLACEHOLDER_NOTES[name] ?? 'підставляється програмою'}`).join('; ')} (лишати як є)`);
  if (forms.length > 0) parts.push(forms.map((form) => `Форма множини ${form}: напр. ${pluralExamples(locale, form)}`).join('; '));
  return parts.filter((part) => part !== '').join('. ');
}

function whereOf(index: Index, section: Section, key: string): string {
  if (section === 'push') return 'Сповіщення';
  if (section === 'help') return helpWhere(key, index.src.help);
  return index.src.contexts[key] ?? '';
}

export function sheetRows(locale: Target, src: SheetSource, target: Dicts, reviewed: Reviewed): SheetRow[] {
  const index = new Index(locale, src);
  const rows: SheetRow[] = [];
  const push = (section: Section, key: string, ukTexts: string[], where: string, forms?: string[]) => {
    const uk = ukTexts.join(' / ');
    const translation = target[section][key] ?? '';
    const pair = reviewed[key];
    const status = translation !== '' && pair !== undefined && pair[0] === uk && pair[1] === translation ? 'reviewed' : 'draft';
    rows.push({ key, context: contextText(locale, where, ukTexts, forms), uk, translation, status });
  };
  for (const section of SECTIONS) {
    const seen = new Set<string>();
    for (const key of Object.keys(src[section])) {
      const base = index.baseOf(section, key);
      if (base === undefined) {
        push(section, key, [src[section][key]!], whereOf(index, section, key));
        continue;
      }
      if (seen.has(base)) continue;
      seen.add(base);
      const forms = index.ukForms(section, base);
      const ukTexts = forms.map((form) => src[section][form]!);
      const where = (index.src.contexts[forms[0]!] ?? index.src.contexts[base]) ?? '';
      for (const form of integerForms(locale)) push(section, `${base}_${form}`, ukTexts, section === 'ui' ? where : whereOf(index, section, forms[0]!), [form]);
    }
  }
  return rows;
}

/** CSV вичитки; клітинка, що таблиця прочитала б як формулу, дістає префікс '. */
export function sheetCsv(rows: SheetRow[]): string {
  const guard = (cell: string) => (FORMULA_START.test(cell) ? `'${cell}` : cell);
  return toCsv([[...SHEET_HEADER], ...rows.map((row) => [row.key, row.context, row.uk, row.translation, STATUS_TEXT[row.status], '', ''].map(guard))]);
}

/** Причини, чому виправлення порушує правила мови; порожньо, якщо все гаразд. */
function textProblems(locale: Target, key: string, text: string, located: Located): string[] {
  const exceptions = L10N_EXCEPTIONS[locale];
  const problems: string[] = [];
  const check = (kind: Issue['kind'], failed: boolean, detail: string) => {
    if (failed && !exceptions[kind]?.includes(key)) problems.push(`${kind}: ${detail}`);
  };
  const plural = located.base !== undefined;
  const ukPlaceholders = [...new Set(located.ukTexts.flatMap(placeholders))].sort();
  const ukDigits = plural ? [...new Set(located.ukTexts.flatMap(digitRuns))] : digitRuns(located.ukTexts[0]!);
  const found = placeholders(text);
  const digits = digitRuns(text);
  check('placeholders', plural ? !subsetOf(found, ukPlaceholders) : !sameList(found, ukPlaceholders), `has {${found.join('}, {')}} but uk has {${ukPlaceholders.join('}, {')}}`);
  check('digits', plural ? !subsetOf(digits, ukDigits) : !sameList(digits, ukDigits), `has [${digits.join(', ')}] but uk has [${ukDigits.join(', ')}]`);
  check('cyrillic', /[Ѐ-ӿ]/.test(text), 'Cyrillic letters in the translation');
  check('indic_digits', locale === 'ar' && /[٠-٩۰-۹]/.test(text), 'Arabic-Indic digits');
  return problems;
}

/**
 * Застосовує повернутий CSV: непорожнє `виправлення` стає перекладом, а коли воно (чи позначка `перевірено`)
 * є — пара [uk, переклад] іде в reviewed. Рядки з невідомим ключем, чужими плейсхолдерами чи цифрами відхиляються.
 */
export function applySheet(locale: Target, csv: string, src: SheetSource, target: Dicts, reviewed: Reviewed): { target: Dicts; reviewed: Reviewed; rejected: Rejected[] } {
  const index = new Index(locale, src);
  const next: Record<Section, Record<string, string>> = { ui: { ...target.ui }, help: { ...target.help }, push: { ...target.push } };
  const marked: Reviewed = { ...reviewed };
  const rejected: Rejected[] = [];
  const [header = [], ...rows] = parseCsv(csv);
  const column = (name: string, fallback: number) => {
    const found = header.findIndex((one) => one.trim() === name);
    return found >= 0 ? found : fallback;
  };
  const keyAt = column(SHEET_HEADER[0]!, 0);
  const correctionAt = column(SHEET_HEADER[5]!, REVIEWED_MARK_COLUMNS.correction);
  const markAt = column(SHEET_HEADER[6]!, REVIEWED_MARK_COLUMNS.mark);
  for (const row of rows) {
    const key = (row[keyAt] ?? '').trim();
    let correction = (row[correctionAt] ?? '').trim();
    const ticked = (row[markAt] ?? '').trim() !== '';
    if (key === '' || (correction === '' && !ticked)) continue;
    const located = index.locate(key);
    if (!located) {
      rejected.push({ key, reason: 'unknown_key' });
      continue;
    }
    const uk = located.ukTexts.join(' / ');
    if (correction.startsWith("'") && !uk.startsWith("'")) correction = correction.slice(1);
    if (correction === '') {
      const current = next[located.section][key];
      if (current === undefined || current === '') {
        rejected.push({ key, reason: 'no_translation' });
        continue;
      }
      marked[key] = [uk, current];
      continue;
    }
    const problems = textProblems(locale, key, correction, located);
    if (problems.length > 0) {
      rejected.push({ key, reason: problems.join('; ') });
      continue;
    }
    next[located.section][key] = correction;
    marked[key] = [uk, correction];
  }
  return { target: next, reviewed: marked, rejected };
}

/** Чернетки й вичитане серед уже перекладених рядків. */
export function statusCounts(locale: Target, src: SheetSource, target: Dicts, reviewed: Reviewed): { draft: number; reviewed: number } {
  const counts = { draft: 0, reviewed: 0 };
  for (const row of sheetRows(locale, src, target, reviewed)) if (row.translation !== '') counts[row.status]++;
  return counts;
}

export type TodoOptions = { glossaryFirst?: boolean; glossaryOnly?: boolean; limit?: number };

/** Що ще перекладати, у порядку uk-словників. Множина — один пункт з `forms`, яких бракує: партія пише ключі `<key>_<форма>`. */
export function todoItems(locale: Target, src: SheetSource, target: Dicts, options: TodoOptions = {}): TodoItem[] {
  const index = new Index(locale, src);
  const required = integerForms(locale);
  const glossaryKeys = new Set(
    Object.values(glossary([src.ui, src.help, src.push])).map((key) => {
      for (const section of SECTIONS) {
        const base = index.baseOf(section, key);
        if (base !== undefined) return base;
      }
      return key;
    }),
  );
  const items: TodoItem[] = [];
  for (const section of SECTIONS) {
    const seen = new Set<string>();
    for (const key of Object.keys(src[section])) {
      const base = index.baseOf(section, key);
      if (base === undefined) {
        if (!own(target[section], key)) items.push({ key, uk: src[section][key]!, context: contextText(locale, whereOf(index, section, key), [src[section][key]!]) });
        continue;
      }
      if (seen.has(base)) continue;
      seen.add(base);
      const missing = required.filter((form) => !own(target[section], `${base}_${form}`));
      if (missing.length === 0) continue;
      const ukTexts = index.ukForms(section, base).map((form) => src[section][form]!);
      const first = index.ukForms(section, base)[0]!;
      const where = section === 'ui' ? ((index.src.contexts[first] ?? index.src.contexts[base]) ?? '') : whereOf(index, section, first);
      items.push({ key: base, uk: ukTexts.join(' / '), context: contextText(locale, where, ukTexts, missing), forms: missing });
    }
  }
  let list = items;
  if (options.glossaryOnly) list = items.filter((item) => glossaryKeys.has(item.key));
  else if (options.glossaryFirst) list = [...items.filter((item) => glossaryKeys.has(item.key)), ...items.filter((item) => !glossaryKeys.has(item.key))];
  return options.limit === undefined ? list : list.slice(0, options.limit);
}

/**
 * Кладе партію `{ ключ: переклад }` у словники й перевіряє checkLocale лише для ключів партії.
 * Скрипт нічого не пише, якщо є issues.
 */
export function mergeBatch(locale: Target, src: SheetSource, target: Dicts, batch: Record<string, string>): { target: Dicts; issues: BatchIssue[] } {
  const index = new Index(locale, src);
  const next: Record<Section, Record<string, string>> = { ui: { ...target.ui }, help: { ...target.help }, push: { ...target.push } };
  const unknown: BatchIssue[] = [];
  const accepted = new Set<string>();
  for (const [key, text] of Object.entries(batch)) {
    const located = index.locate(key);
    if (!located || typeof text !== 'string') {
      unknown.push({ key, kind: 'unknown_key', detail: located ? 'value is not a string' : 'not a uk key or a plural form of this language' });
      continue;
    }
    next[located.section][key] = text;
    accepted.add(key);
  }
  const issues: BatchIssue[] = checkLocale(locale, src, next).filter((issue) => accepted.has(issue.key));
  return { target: next, issues: [...issues, ...unknown] };
}
