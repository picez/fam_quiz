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
