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
