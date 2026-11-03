import type { Locale } from '@quiz/shared';
import { L10N_EXCEPTIONS } from './exceptions';
import type { Messages } from './load';
import { INTL_TAGS } from './locales';

/** Перевірки повноти словника мови проти uk. Чисті функції: їх кличе і checks.test.ts, і скрипт l10n. */

export type { Messages };

export type Issue = {
  key: string;
  kind: 'missing' | 'extra' | 'placeholders' | 'plural' | 'digits' | 'cyrillic' | 'indic_digits' | 'quote' | 'menu_length' | 'list_gap';
  detail: string;
};

type Exceptions = Partial<Record<Issue['kind'], string[]>>;
type Sources = { ui: Messages; help: Messages; push: Messages };

const PLURAL_SUFFIX = /^(.+)_(zero|one|two|few|many|other)$/;
const PLACEHOLDER = /\{(\w+)\}/g;
const CYRILLIC = /[\u0400-\u04FF]/;
const INDIC_DIGITS = /[٠-٩۰-۹]/;
const QUOTED = /«([^«»]+)»/g;
const MENU_SHORT_MAX = 8;
const MENU_WORD_MAX = 12;

const rulesCache = new Map<Locale, Intl.PluralRules>();
function rules(locale: Locale): Intl.PluralRules {
  let found = rulesCache.get(locale);
  if (!found) {
    found = new Intl.PluralRules(INTL_TAGS[locale]);
    rulesCache.set(locale, found);
  }
  return found;
}

const SAMPLE_INTEGERS = [...Array.from({ length: 201 }, (_, index) => index), 1000, 1_000_000, 2_000_000];

/** Обов'язкові форми множини мови: ті, що select дає на цілих 0…200, 1000, 1e6, 2e6. Відсортовані. */
export function integerForms(locale: Locale): Intl.LDMLPluralRule[] {
  const forms = new Set(SAMPLE_INTEGERS.map((count) => rules(locale).select(count)));
  return [...forms].sort();
}

function allowedForms(locale: Locale): Intl.LDMLPluralRule[] {
  return rules(locale).resolvedOptions().pluralCategories;
}

const own = (messages: Messages, key: string): boolean => Object.prototype.hasOwnProperty.call(messages, key);

/** Бази множини: ключі, у яких в uk є і `_one`, і `_many`. */
export function pluralBases(source: Messages): string[] {
  return Object.keys(source)
    .filter((key) => key.endsWith('_one'))
    .map((key) => key.slice(0, -'_one'.length))
    .filter((base) => own(source, `${base}_many`));
}

/** Відсортовані унікальні {імена} плейсхолдерів. */
export function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((match) => match[1]!))].sort();
}

/** Послідовності цифр поза плейсхолдерами, відсортовані (з повторами). */
export function digitRuns(text: string): string[] {
  return (text.replace(PLACEHOLDER, ' ').match(/\d+/g) ?? []).sort();
}

function quotedTerms(text: string): string[] {
  return [...text.matchAll(QUOTED)].map((match) => match[1]!);
}

/** Усі ключі з цим точним uk-значенням, у порядку словників. */
function keysByValue(sources: Messages[]): Map<string, string[]> {
  const byValue = new Map<string, string[]>();
  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) byValue.set(value, [...(byValue.get(value) ?? []), key]);
  }
  return byValue;
}

/** Глосарій: uk-значення ключа, яке стоїть у «…» в іншому uk-рядку → цей ключ (перший у порядку словників). */
export function glossary(sources: Messages[]): Record<string, string> {
  const byValue = keysByValue(sources);
  const found: Record<string, string> = {};
  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      for (const term of quotedTerms(value)) {
        const candidate = byValue.get(term)?.find((one) => one !== key);
        if (candidate !== undefined && !(term in found)) found[term] = candidate;
      }
    }
  }
  return found;
}

const sameList = (a: string[], b: string[]): boolean => a.length === b.length && a.every((item, index) => item === b[index]);
const subsetOf = (part: string[], whole: string[]): boolean => part.every((item) => whole.includes(item));

function graphemes(text: string, locale: Locale): number {
  return [...new Intl.Segmenter(INTL_TAGS[locale], { granularity: 'grapheme' }).segment(text)].length;
}

/** Повна перевірка мови: ключі, плейсхолдери, форми множини, числа, кирилиця, цифри, терміни в «…», довжина підписів меню. */
export function checkLocale(
  locale: Exclude<Locale, 'uk'>,
  sources: Sources,
  target: Sources,
  exceptions: Exceptions = L10N_EXCEPTIONS[locale],
): Issue[] {
  const issues: Issue[] = [];
  const report = (key: string, kind: Issue['kind'], detail: string) => {
    if (!exceptions[kind]?.includes(key)) issues.push({ key, kind, detail });
  };
  const required = integerForms(locale);
  const allowed = allowedForms(locale);
  const tag = INTL_TAGS[locale];
  const byValue = keysByValue([sources.ui, sources.help, sources.push]);
  const translationOf = (key: string): string | undefined =>
    [target.ui, target.help, target.push].find((section) => own(section, key))?.[key];

  for (const section of ['ui', 'help', 'push'] as const) {
    const source = sources[section];
    const translated = target[section];
    const bases = new Set(pluralBases(source));
    const baseOf = (key: string): string | undefined => {
      const match = PLURAL_SUFFIX.exec(key);
      return match && bases.has(match[1]!) ? match[1] : undefined;
    };
    const ukForms = (base: string): string[] => Object.keys(source).filter((key) => baseOf(key) === base);

    // Ключі й форми множини.
    for (const key of Object.keys(source)) {
      if (baseOf(key) === undefined && !own(translated, key)) report(key, 'missing', `no translation for ${section} key`);
    }
    for (const base of bases) {
      for (const form of required) {
        const key = `${base}_${form}`;
        if (!own(translated, key)) report(key, 'plural', `plural form "${form}" is required in ${locale}`);
      }
    }
    for (const key of Object.keys(translated)) {
      const base = baseOf(key);
      if (base === undefined ? !own(source, key) : !allowed.includes(key.slice(base.length + 1) as Intl.LDMLPluralRule)) {
        report(key, 'extra', base === undefined ? `not a uk ${section} key` : `${locale} has no plural form "${key.slice(base.length + 1)}"`);
      }
    }

    // Списки довідки (how.0, how.1, …) без пропусків: helpEntry збирає масив за наявними ключами.
    if (section === 'help') {
      const indexed = new Map<string, Set<number>>();
      for (const key of Object.keys(translated)) {
        const match = /^(.+)\.(\d+)$/.exec(key);
        if (match) indexed.set(match[1]!, (indexed.get(match[1]!) ?? new Set()).add(Number(match[2])));
      }
      for (const [prefix, found] of indexed) {
        for (const at of [...found].sort((a, b) => a - b)) {
          if (at > 0 && !found.has(at - 1)) report(`${prefix}.${at}`, 'list_gap', `no ${prefix}.${at - 1} before it`);
        }
      }
    }

    // Кожен перекладений рядок.
    for (const [key, text] of Object.entries(translated)) {
      const base = baseOf(key);
      const known = base !== undefined || own(source, key);
      if (known) {
        const ukTexts = base === undefined ? [source[key]!] : ukForms(base).map((form) => source[form]!);
        const ukPlaceholders = [...new Set(ukTexts.flatMap(placeholders))].sort();
        const ukDigits = base === undefined ? digitRuns(ukTexts[0]!) : [...new Set(ukTexts.flatMap(digitRuns))];
        const found = placeholders(text);
        const ownDigits = digitRuns(text);
        if (base === undefined ? !sameList(found, ukPlaceholders) : !subsetOf(found, ukPlaceholders)) {
          report(key, 'placeholders', `has {${found.join('}, {')}} but uk has {${ukPlaceholders.join('}, {')}}`);
        }
        if (base === undefined ? !sameList(ownDigits, ukDigits) : !subsetOf(ownDigits, ukDigits)) {
          report(key, 'digits', `has [${ownDigits.join(', ')}] but uk has [${ukDigits.join(', ')}]`);
        }
      }
      if (CYRILLIC.test(text)) report(key, 'cyrillic', `Cyrillic letters in ${locale}: ${text}`);
      if (locale === 'ar' && INDIC_DIGITS.test(text)) report(key, 'indic_digits', `Arabic-Indic digits: ${text}`);
      if (section === 'ui' && known) {
        if (/^menuShort[A-Z]/.test(key)) {
          if (graphemes(text, locale) > MENU_SHORT_MAX) report(key, 'menu_length', `short menu label longer than ${MENU_SHORT_MAX} graphemes: ${text}`);
        } else if (/^menu[A-Z]/.test(key) && key !== 'menuLabel') {
          const long = text.split(/\s+/).filter((word) => graphemes(word, locale) > MENU_WORD_MAX);
          if (long.length > 0) report(key, 'menu_length', `menu label word longer than ${MENU_WORD_MAX} graphemes: ${long.join(', ')}`);
        }
      }
    }

    // Терміни в «…»: переклад рядка містить переклад ключа, чиє uk-значення процитоване.
    for (const [key, ukText] of Object.entries(source)) {
      const terms = quotedTerms(ukText);
      if (terms.length === 0) continue;
      const base = baseOf(key);
      const targetKeys = base === undefined ? [key] : Object.keys(translated).filter((one) => baseOf(one) === base);
      for (const targetKey of targetKeys) {
        if (!own(translated, targetKey)) continue;
        const text = translated[targetKey]!.toLocaleLowerCase(tag);
        for (const term of terms) {
          const named = (byValue.get(term) ?? []).filter((one) => one !== key);
          const renderings = named.map(translationOf).filter((one): one is string => one !== undefined);
          if (renderings.length === 0) continue;
          if (!renderings.some((one) => text.includes(one.toLocaleLowerCase(tag)))) {
            report(targetKey, 'quote', `quotes «${term}» (${named.join(', ')}) but has none of: ${renderings.join(' | ')}`);
          }
        }
      }
    }
  }
  return issues;
}
