import { createHash } from 'node:crypto';
import type { ErrorContext } from './log';

/**
 * Маскування особистого в тексті збою (64) — до запису в базу.
 * Порядок: облікові дані в URL (`//user:pass@`), email, `Bearer …`, пари «секретне ім'я = значення»
 * (зокрема JSON `"password":"…"` і `access_token=…`), довгі рядки-токени (32+ символів base64url чи hex).
 * UUID і шестизначні коди кімнат лишаються: вони не особисті й потрібні для пошуку.
 * Облікові дані в URL — перед email: інакше `app:pw@db.example.com` став би `app:[email]`, а ім'я лишилось би.
 */
const URL_USERINFO = /\/\/[^\s/@]+@/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const BEARER = /\bBearer\s+[^\s"',;]+/gi;
const SECRET_PAIR = /(token|password|passwd|secret|auth|cookie|session|key|sig|signature)("?\s*[=:]\s*)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s&,;"']+)/gi;
const LONG_RUN = /[A-Za-z0-9_-]{32,}/g;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_ANYWHERE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function maskPersonal(text: string): string {
  return text
    .replace(URL_USERINFO, '//[hidden]@')
    .replace(EMAIL, '[email]')
    .replace(BEARER, 'Bearer [hidden]')
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

/** Назва, повідомлення й стек будь-якого кинутого значення; сам ніколи не кидає. */
export function errorParts(error: unknown): { name: string; message: string; stack: string | null } {
  if (error instanceof Error) {
    return { name: String(error.name || 'Error'), message: String(error.message ?? ''), stack: typeof error.stack === 'string' ? error.stack : null };
  }
  if (typeof error === 'string') return { name: 'string', message: error, stack: null };
  let message: string;
  try {
    message = String(error);
  } catch {
    message = '[object]';
  }
  return { name: typeof error, message, stack: null };
}

/** Числа й uuid — у `#`: «кімната 123456» і «кімната 654321» — один збій. */
function normalize(text: string): string {
  return text.replace(UUID_ANYWHERE, '#').replace(/\d+/g, '#');
}

/** Перший рядок стека з коду застосунку (apps/…), без шляху до теки й номерів рядка та колонки. */
function appFrame(stack: string | null): string {
  if (stack === null) return '';
  const line = stack.split('\n').find((l) => /apps[\\/]/.test(l) && !/node_modules/.test(l));
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
