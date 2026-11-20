import { createHash } from 'node:crypto';
import { DrizzleQueryError } from 'drizzle-orm';
import type { ErrorContext } from './log';

/**
 * Маскування особистого в тексті збою (64) — до запису в базу.
 * Порядок: облікові дані в URL (`//user:pass@`), email, `Bearer …`, пари «секретне ім'я = значення»
 * (зокрема JSON `"password":"…"` і `access_token=…`), довгі рядки-токени (32+ символів base64url чи hex).
 * UUID і шестизначні коди кімнат лишаються: вони не особисті й потрібні для пошуку.
 * Облікові дані в URL — перед email: інакше `app:pw@db.example.com` став би `app:[email]`, а ім'я лишилось би.
 */
// Усі вирази лінійні: межі довжини й lookbehind не дають почати збіг посеред довгого рядка (100 КБ — за мілісекунди).
// До останнього `@` у межах адреси: `//app:p@ss@db` → `//[hidden]@db`.
const URL_USERINFO = /\/\/[^\s/]{1,512}@/g;
// Локальна частина до 64 символів і не з середини такого ж рядка; `@` чи закодоване `%40`; домен — до 10 міток по 63.
const EMAIL = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]{1,64}(?:@|%40)[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,24}(?![A-Za-z0-9-])/gi;
// Заголовки Authorization і Cookie — усе значення до кінця рядка (кожна пара cookie; Basic, Digest тощо — лишається назва схеми).
const AUTH_HEADER = /\b((?:proxy-)?authorization)([ \t]*:[ \t]*)(?:([A-Za-z]{1,20})[ \t]+)?[^\r\n"]+/gi;
const COOKIE_HEADER = /\b((?:set-)?cookie)([ \t]*:[ \t]*)[^\r\n"]+/gi;
const BEARER = /\b(Bearer|Basic)\s+[^\s"',;]+/gi;
const SECRET_PAIR = /(token|password|passwd|secret|authorization|auth|cookie|session|key|sig|signature)("?\s*[=:]\s*)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|(?![A-Za-z]{1,20}[ \t]+\[hidden\])[^\s&,;"']+)/gi;
const LONG_RUN = /[A-Za-z0-9_-]{32,}/g;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_ANYWHERE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function maskPersonal(text: string): string {
  return text
    .replace(URL_USERINFO, '//[hidden]@')
    .replace(EMAIL, '[email]')
    .replace(AUTH_HEADER, (_all, name: string, separator: string, scheme: string | undefined) => `${name}${separator}${scheme === undefined ? '' : `${scheme} `}[hidden]`)
    .replace(COOKIE_HEADER, '$1$2[hidden]')
    .replace(BEARER, '$1 [hidden]')
    .replace(SECRET_PAIR, (_all, name: string, separator: string) => `${name}${separator.includes('=') ? '=' : separator}[hidden]`)
    .replace(LONG_RUN, (run) => (UUID.test(run) ? run : '[hidden]'));
}

/**
 * Шляхи в стеку — від apps/ чи node_modules/ (без теки розгортання чи домашньої теки, де буває ім'я користувача),
 * і без проміжної теки pnpm (`.pnpm/пакет@версія/node_modules/`): коротше й без зайвого.
 */
const PATH_PREFIX = /(?<=^|[\s(])(?:file:\/\/\/?)?[^\s()]*?[\\/](apps|node_modules)[\\/]/g;
const BACKSLASH_PATH = /(?:apps|node_modules)\/[^\s():]*/g;
const PNPM_STORE = /node_modules\/\.pnpm\/[^/\s()]+\/node_modules\//g;

export function shortenStack(stack: string): string {
  return stack
    .replace(PATH_PREFIX, '$1/')
    .replace(BACKSLASH_PATH, (path) => path.replace(/\\/g, '/'))
    .replace(PNPM_STORE, 'node_modules/');
}

/** Не довше за max байтів UTF-8 і без розірваного посередині символу. */
export function truncateBytes(text: string, max: number): string {
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length <= max) return text;
  let end = max;
  // Байт на межі — продовження символу (10xxxxxx): символ не влазить цілим, відступаємо до його початку.
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end -= 1;
  return bytes.subarray(0, end).toString('utf8');
}

/** Не довше за max символів UTF-16 і без половинки пари (емодзі тощо). */
export function truncateChars(text: string, max: number): string {
  if (text.length <= max) return text;
  const code = text.charCodeAt(max - 1);
  return text.slice(0, code >= 0xd800 && code <= 0xdbff ? max - 1 : max);
}

/** Скільки тексту збою взагалі читається (до маскування й відбитка): довге повідомлення не має гальмувати сервер. */
export const ERROR_TEXT_READ_MAX = 8192;

const PARAMS_MARK = '\nparams:';
const FRAME = /^\s+at /;

/** Кадри стека (рядки `at …`) без заголовка: заголовок — це повідомлення, а в ньому бувають параметри запиту. */
function framesOnly(stack: string): string {
  return stack
    .split('\n')
    .filter((line) => FRAME.test(line))
    .join('\n');
}

/** Обмежений: значення в лапках після «: » не довше за 512 символів. */
const QUOTED_VALUE = /: "(?:[^"\\\n]|\\.){0,512}"/g;

/**
 * Postgres кладе значення рядка в повідомлення (`invalid input syntax for type uuid: "<текст>"`,
 * `invalid input value for enum …: "<текст>"`): ховаємо його, щоб не зберігати й не розбивати групу.
 */
function quotedValuesHidden(message: string): string {
  return message.replace(QUOTED_VALUE, ': "?"');
}

/**
 * Помилка запиту drizzle (DrizzleQueryError чи будь-яке повідомлення з `\nparams:`) несе параметри запиту —
 * імена, email, тексти. Лишаємо лише SQL і повідомлення бази (cause.message, без detail); параметрів не беремо ніколи.
 */
function queryMessage(error: Error, message: string): string | null {
  const query = (error as { query?: unknown }).query;
  const at = message.indexOf(PARAMS_MARK);
  if (at < 0 && !(error instanceof DrizzleQueryError)) return null;
  const sqlText = typeof query === 'string' ? `Failed query: ${query}` : at < 0 ? message : message.slice(0, at);
  const cause = (error as { cause?: unknown }).cause;
  const causeMessage = cause instanceof Error && typeof cause.message === 'string' ? quotedValuesHidden(truncateChars(cause.message, ERROR_TEXT_READ_MAX).split(PARAMS_MARK)[0]!) : '';
  return causeMessage === '' ? sqlText : `${causeMessage}\n${sqlText}`;
}

/**
 * Назва, повідомлення й стек будь-якого кинутого значення; сам ніколи не кидає.
 * Повідомлення й стек — не довші за ERROR_TEXT_READ_MAX символів ще до маскування.
 */
export function errorParts(error: unknown): { name: string; message: string; stack: string | null } {
  if (error instanceof Error) {
    const name = truncateChars(String(error.name || 'Error'), 200);
    const raw = String(error.message ?? '');
    const query = queryMessage(error, raw);
    const message = truncateChars(query ?? raw, ERROR_TEXT_READ_MAX);
    let stack = typeof error.stack === 'string' ? error.stack : null;
    if (stack !== null && query !== null) {
      // Заголовок стека повторює повідомлення з параметрами (навіть через переноси рядків у них) — беремо лише кадри.
      stack = `${name}: ${message}\n${framesOnly(stack)}`;
    }
    return { name, message, stack: stack === null ? null : truncateChars(stack, ERROR_TEXT_READ_MAX) };
  }
  if (typeof error === 'string') return { name: 'string', message: truncateChars(error, ERROR_TEXT_READ_MAX), stack: null };
  let message: string;
  try {
    message = String(error);
  } catch {
    message = '[object]';
  }
  return { name: typeof error, message: truncateChars(message, ERROR_TEXT_READ_MAX), stack: null };
}

/** Числа й uuid — у `#`: «кімната 123456» і «кімната 654321» — один збій. */
function normalize(text: string): string {
  return text.replace(UUID_ANYWHERE, '#').replace(/\d+/g, '#');
}

/** Перший рядок стека з коду застосунку (apps/…), без шляху до теки й номерів рядка та колонки. */
function appFrame(stack: string | null): string {
  if (stack === null) return '';
  const line = stack.split('\n').find((l) => FRAME.test(l) && /apps[\\/]/.test(l) && !/node_modules/.test(l));
  if (line === undefined) return '';
  return line
    .trim()
    .replace(/^.*?(apps[\\/])/, '$1')
    .replace(/\\/g, '/')
    .replace(/:\d+(:\d+)?\)?$/, '');
}

/** Відбиток збою: sha1 від where|what|name|нормалізоване повідомлення|перший кадр стека з apps/. */
export function errorFingerprint(error: unknown, context: ErrorContext): string {
  const parts = errorParts(error);
  const message = normalize(maskPersonal(parts.message));
  const frame = appFrame(parts.stack);
  return createHash('sha1')
    .update([context.where, context.what ?? '', parts.name, message, frame].join('|'))
    .digest('hex');
}
