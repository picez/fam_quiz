import type { Locale, TrophyKind } from '@quiz/shared';
import { t } from '../i18n';
import { currentLocale, intlTag } from './current';

/**
 * Граматика, що залежить від мови. uk-правила (і/й, «3-я», знахідний день) живуть лише тут;
 * решта мов — через Intl. Кожна функція бере мову з останнього параметра, інакше — активну.
 */

/** Intl-об'єкти дорогі: один на тег і набір опцій. */
const cache = new Map<string, unknown>();
function cached<T>(key: string, make: () => T): T {
  let found = cache.get(key) as T | undefined;
  if (found === undefined) {
    found = make();
    cache.set(key, found);
  }
  return found;
}

const VOWEL_END = /[аеєиіїоуюяaeiouy]$/i;
const SOFT_START = /^[іїйєюя]/i;

/** Імена через кому, останнє — uk: через «і» чи «й» за милозвучністю («Оля, Петро й Тарас»); інші мови — Intl.ListFormat. */
export function namesText(names: string[], locale: Locale = currentLocale()): string {
  if (names.length <= 1) return names[0] ?? '';
  if (locale !== 'uk') {
    const tag = intlTag(locale);
    return cached(`list:${tag}`, () => new Intl.ListFormat(tag, { type: 'conjunction' })).format(names);
  }
  const rest = names.slice(0, -1).join(', ');
  const last = names[names.length - 1]!;
  const short = VOWEL_END.test(rest.trim()) && !SOFT_START.test(last.trim());
  return t(short ? 'factNamesAndShort' : 'factNamesAnd', { rest, last });
}

const EN_SUFFIX: Partial<Record<Intl.LDMLPluralRule, string>> = { one: 'st', two: 'nd', few: 'rd' };

/**
 * Порядковий числівник цифрами. uk за правописом 2019: f — «2-а», «3-я»; n — «2-е», «3-є» (але «13-а», «13-е»).
 * en — 1st 2nd 3rd 4th 11th; pl, de — «3.»; es — «3.ª» / «3.º»; it — «3ª» / «3º»; ar — «3».
 */
export function ordinal(n: number, gender: 'f' | 'n', locale: Locale = currentLocale()): string {
  switch (locale) {
    case 'uk': {
      const third = n % 10 === 3 && n % 100 !== 13;
      return `${n}-${gender === 'f' ? (third ? 'я' : 'а') : third ? 'є' : 'е'}`;
    }
    case 'en': {
      const tag = intlTag(locale);
      const form = cached(`ordinal:${tag}`, () => new Intl.PluralRules(tag, { type: 'ordinal' })).select(n);
      return `${n}${EN_SUFFIX[form] ?? 'th'}`;
    }
    case 'pl':
    case 'de':
      return `${n}.`;
    case 'es':
      return `${n}.${gender === 'f' ? 'ª' : 'º'}`;
    case 'it':
      return `${n}${gender === 'f' ? 'ª' : 'º'}`;
    case 'ar':
      return String(n);
  }
}

const WEEKDAY_ACCUSATIVE: Record<string, string> = { середа: 'середу', 'пʼятниця': 'пʼятницю', "п'ятниця": "п'ятницю", 'п’ятниця': 'п’ятницю', субота: 'суботу', неділя: 'неділю' };

/** uk: «субота, 7 листопада» → «суботу, 7 листопада» (після «на» потрібен знахідний). Інші мови — без змін. */
export function accusativeDay(heading: string, locale: Locale = currentLocale()): string {
  if (locale !== 'uk') return heading;
  const [word = '', ...rest] = heading.split(',');
  return [WEEKDAY_ACCUSATIVE[word.trim()] ?? word.trim(), ...rest].join(',');
}

/** uk: « р.», яке uk-UA дописує після року, відрізається («29 жовтня 2026 р.» → «29 жовтня 2026»). Інші мови — без змін. */
export function dropYearMark(text: string, locale: Locale = currentLocale()): string {
  return locale === 'uk' ? text.replace(/\s*р\.$/, '') : text;
}

/**
 * Мала перша літера, лише якщо друга теж мала: «Найбільший» → «найбільший», а «NASA» чи «ВВП» без змін.
 * de (іменники з великої) і ar (регістру немає) — без змін.
 */
export function lowerFirst(label: string, locale: Locale = currentLocale()): string {
  if (locale === 'de' || locale === 'ar') return label;
  const tag = locale === 'uk' ? 'uk' : intlTag(locale);
  const second = label.charAt(1);
  const secondLower = second !== '' && second === second.toLocaleLowerCase(tag) && second !== second.toLocaleUpperCase(tag);
  return secondLower ? label.charAt(0).toLocaleLowerCase(tag) + label.slice(1) : label;
}

/** Рядок для пошуку: малими літерами мови. */
export function searchNormalize(s: string, locale: Locale = currentLocale()): string {
  return s.toLocaleLowerCase(intlTag(locale));
}

/** Порівняння для сортування за абеткою мови. */
export function compareText(a: string, b: string, locale: Locale = currentLocale()): number {
  return a.localeCompare(b, intlTag(locale));
}

/** Десяткове число мовою, рівно digits знаків після коми, без групування: uk «23,4», en «23.4». */
export function decimalText(value: number, digits: number, locale: Locale = currentLocale()): string {
  const tag = intlTag(locale);
  return cached(`decimal:${tag}:${digits}`, () => new Intl.NumberFormat(tag, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false })).format(value);
}

/** «12 хв тому» / «3 год тому» (en «12 min ago»): хвилини до години, далі години. */
export function agoText(ms: number, locale: Locale = currentLocale()): string {
  const tag = intlTag(locale);
  const format = cached(`ago:${tag}`, () => new Intl.RelativeTimeFormat(tag, { style: 'short' }));
  return ms < 3_600_000 ? format.format(-Math.floor(ms / 60_000), 'minute') : format.format(-Math.floor(ms / 3_600_000), 'hour');
}

/**
 * Рід назви трофея — щоб узгодити прикметник матеріалу: «Золотий кубок», «Срібна медаль».
 * Рід залежить від мови: у pl «medal» чоловічого роду («Srebrny medal»). Мови без свого рядка — як uk.
 */
const TROPHY_GENDER: Record<TrophyKind, 'm' | 'f'> = { cup: 'm', medal: 'f', crown: 'f', star: 'f', statuette: 'f', grail: 'm' };
const TROPHY_GENDER_BY_LOCALE: Partial<Record<Locale, Partial<Record<TrophyKind, 'm' | 'f'>>>> = {
  pl: { medal: 'm' },
  /** de: der Pokal, der Stern, der Gral — «Goldener»; die Medaille, Krone, Statuette — «Goldene» (uk-рід зірки жіночий). */
  de: { cup: 'm', medal: 'f', crown: 'f', star: 'm', statuette: 'f', grail: 'm' },
  /** es: la copa, la medalla, la corona, la estrella, la estatuilla — жіночого роду; el grial — чоловічого. */
  es: { cup: 'f', medal: 'f', crown: 'f', star: 'f', statuette: 'f', grail: 'm' },
  /** it: la coppa, la medaglia, la corona, la stella, la statuetta — жіночого роду; il Graal — чоловічого. */
  it: { cup: 'f', medal: 'f', crown: 'f', star: 'f', statuette: 'f', grail: 'm' },
  /** ar: كأس، ميدالية، نجمة، كأس مقدسة — жіночого роду («كأس ذهبية»); تاج، تمثال — чоловічого («تاج فضي»). */
  ar: { cup: 'f', medal: 'f', crown: 'm', star: 'f', statuette: 'm', grail: 'f' },
};
export function trophyGender(kind: TrophyKind, locale: Locale = currentLocale()): 'm' | 'f' {
  return TROPHY_GENDER_BY_LOCALE[locale]?.[kind] ?? TROPHY_GENDER[kind];
}

/**
 * Назва трофея з матеріалу й виду: uk «Золотий кубок» (прикметник попереду). es, it — іменник попереду з великої,
 * матеріал після: «Copa de oro», «Coppa d'oro» (елізія «d'» уже в словнику матеріалу). ar — іменник попереду,
 * прикметник узгоджений за родом: «كأس ذهبية», «تاج فضي» (регістру немає).
 */
export function trophyPhrase(adjective: string, noun: string, locale: Locale = currentLocale()): string {
  if (locale === 'ar') return `${noun} ${adjective}`;
  if (locale === 'es' || locale === 'it') return `${noun.charAt(0).toLocaleUpperCase(intlTag(locale))}${noun.slice(1)} ${adjective}`;
  return `${adjective} ${noun}`;
}
