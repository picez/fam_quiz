import { pino, type Logger } from 'pino';

/**
 * Рівень журналу (30a): LOG_LEVEL, якщо задано й це рівень pino (trace … fatal, silent); у тестах (vitest, зокрема наскрізних) — warn,
 * щоб не засмічувати вивід; інакше — info (і в продакшені, і локально). Невідомий LOG_LEVEL — info, а не падіння pino на старті.
 */
export function logLevel(env: Record<string, string | undefined>): string {
  const given = env.LOG_LEVEL?.trim().toLowerCase();
  if (given !== undefined && given !== '') return given === 'silent' || given in pino.levels.values ? given : 'info';
  if (env.VITEST !== undefined || env.NODE_ENV === 'test') return 'warn';
  return 'info';
}

/** Що журнал цензурує (30a): секрети й подробиці запитів до бази. */
export const LOG_REDACT = {
  paths: [
    'token',
    '*.token',
    'auth',
    '*.auth',
    'email',
    '*.email',
    'password',
    '*.password',
    'req.headers.cookie',
    'req.headers.authorization',
    'headers.cookie',
    'headers.authorization',
    // Помилки бази (pg, drizzle) несуть рядок і параметри запиту — там можуть бути email і токени.
    'err.detail',
    'err.params',
    'err.query',
    'err.cause.detail',
    'err.cause.params',
    'err.cause.query',
  ],
  censor: '[hidden]',
};

/**
 * Структурований журнал сервера (pino, рядок JSON на запис); той самий екземпляр веде Fastify (app.ts).
 * Персональних даних у журнал не пишемо: токени, email, паролі, cookie й заголовки авторизації цензуруються,
 * навіть якщо їх випадково передали в об'єкті запису.
 */
export const log: Logger = pino({ level: logLevel(process.env), redact: LOG_REDACT });

/** Де стався збій і з чим: код кімнати, подія сокета, роль. Без токенів, email, текстів відповідей. */
export interface ErrorContext {
  /** Місце: 'socket', 'socket-push', 'room-timer', 'room-listener', 'recorder', 'store', 'process', … */
  where: string;
  room?: string;
  event?: string;
  role?: string;
  /** Короткий ярлик таймера чи слухача: 'deadline', 'pilot', 'expiry', … */
  what?: string;
}

export type ErrorReporter = (error: unknown, context: ErrorContext) => void;

let reporter: ErrorReporter | null = null;

/**
 * Хук для зовнішнього збирача помилок (Sentry тощо): поки нічого не під'єднано. Повертає функцію, що знімає хук.
 * Тести ставлять сюди шпигуна, щоб переконатися, що збій дійшов до журналу.
 */
export function setErrorReporter(next: ErrorReporter | null): () => void {
  const previous = reporter;
  reporter = next;
  return () => {
    reporter = previous;
  };
}

/** Записати збій у журнал (error) і передати його хуку; сам ніколи не кидає. */
export function reportError(error: unknown, context: ErrorContext): void {
  try {
    log.error({ err: error, ...context }, `Збій: ${context.where}${context.what === undefined ? '' : ` (${context.what})`}`);
  } catch {
    // Журнал не має права покласти процес.
  }
  try {
    reporter?.(error, context);
  } catch {
    // Як і хук.
  }
}

/** Обгортка колбека (таймера, слухача): виняток іде в reportError, а не вгору, де він поклав би процес. */
export function guarded(context: ErrorContext, fn: () => void): () => void {
  return () => {
    try {
      fn();
    } catch (error) {
      reportError(error, context);
    }
  };
}
