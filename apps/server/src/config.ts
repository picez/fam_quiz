const EXAMPLE_SECRET = 'change-me-to-a-long-random-string';
const MIN_SECRET_LENGTH = 32;

/** Чому секрет сесій не годиться, або null, якщо він придатний. */
export function secretProblem(secret: string): string | null {
  if (secret === EXAMPLE_SECRET) {
    return 'BETTER_AUTH_SECRET досі має значення з .env.example. Замініть його власним випадковим рядком.';
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    return `BETTER_AUTH_SECRET закороткий: потрібно щонайменше ${MIN_SECRET_LENGTH} символи.`;
  }
  return null;
}

interface NetworkAddress {
  address: string;
  family: string;
  internal: boolean;
}

/**
 * Адреси, за якими цей комп'ютер відкривають у локальній мережі. Потрібні під час розробки:
 * ведучий має могти увійти не лише через localhost, а й за адресою, яку бачать телефони.
 */
export function localOrigins(
  interfaces: Record<string, NetworkAddress[] | undefined>,
  port: number,
): { lan: string[]; all: string[] } {
  const lan = Object.values(interfaces)
    .flatMap((list) => list ?? [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => `http://${entry.address}:${port}`);
  return { lan, all: [`http://localhost:${port}`, `http://127.0.0.1:${port}`, ...lan] };
}

/**
 * Адреса, за якою відкривається застосунок: задана явно, видана сервісу на Render
 * або цей комп'ютер. Від неї залежать cookie сесії та перевірка походження запитів.
 */
export function baseUrl(env: Record<string, string | undefined>, port: number): string {
  const given = [env.BETTER_AUTH_URL, env.RENDER_EXTERNAL_URL].find((value) => value !== undefined && value !== '');
  return (given ?? `http://localhost:${port}`).replace(/\/+$/, '');
}

/**
 * Скільки проксі стоїть перед сервером (значення TRUST_PROXY). Число безпечніше за "true":
 * тоді адресою клієнта вважається та, яку дописав останній проксі, а не та, яку клієнт
 * сам вписав у X-Forwarded-For, щоб обійти обмеження частоти.
 */
export function proxyTrust(value: string | undefined): boolean | number {
  if (value === 'true') return true;
  return value !== undefined && /^[1-9]\d?$/.test(value) ? Number(value) : false;
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

const VAPID_PUBLIC = /^[A-Za-z0-9_-]{87}$/;
const VAPID_PRIVATE = /^[A-Za-z0-9_-]{43}$/;

/**
 * Ключі Web Push зі змінних середовища. Жодної з трьох: пуші вимкнені. Усі три правильні: ключі.
 * Інакше причина (українською, з назвами змінних), з якою main.ts виходить, як з GOOGLE_* і R2_*.
 */
export function pushKeys(env: Record<string, string | undefined>): { ok: true; keys: VapidKeys | null } | { ok: false; problem: string } {
  const names = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'] as const;
  // trim: власник вставляє ключі в Render, зайвий перенос рядка не має ламати запуск.
  const value = (name: (typeof names)[number]) => env[name]?.trim() ?? '';
  const [publicKey, privateKey, subject] = names.map(value);
  const missing = names.filter((name) => value(name) === '');
  if (missing.length === names.length) return { ok: true, keys: null };
  if (missing.length > 0) return { ok: false, problem: `Для Web Push потрібні всі три змінні: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY і VAPID_SUBJECT. Не задано: ${missing.join(', ')}.` };
  if (!VAPID_PUBLIC.test(publicKey!)) return { ok: false, problem: 'VAPID_PUBLIC_KEY має бути рядком base64url з 87 символів (pnpm --filter @quiz/server exec web-push generate-vapid-keys).' };
  if (!VAPID_PRIVATE.test(privateKey!)) return { ok: false, problem: 'VAPID_PRIVATE_KEY має бути рядком base64url з 43 символів (pnpm --filter @quiz/server exec web-push generate-vapid-keys).' };
  if (!subject!.startsWith('mailto:') && !subject!.startsWith('https://')) return { ok: false, problem: 'VAPID_SUBJECT має починатися з mailto: або https://.' };
  return { ok: true, keys: { publicKey: publicKey!, privateKey: privateKey!, subject: subject! } };
}
