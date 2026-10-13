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
  return value !== undefined && /^[1-9]d?$/.test(value) ? Number(value) : false;
}
