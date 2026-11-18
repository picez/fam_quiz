/** Код Postgres для порушення унікальності. */
export const UNIQUE_VIOLATION = '23505';

/** Скільки разів пробувати новий випадковий код при колізії (23505), перш ніж віддати помилку. */
export const CODE_ATTEMPTS = 3;

/** Унікальне порушення (23505): драйвер кладе код у саму помилку чи в її cause. */
export function isUniqueViolation(error: unknown): boolean {
  for (let current = error; current && typeof current === 'object'; current = (current as { cause?: unknown }).cause) {
    if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
  }
  return false;
}

/** Код Postgres для порушення зовнішнього ключа. */
export const FOREIGN_KEY_VIOLATION = '23503';

/** Порушення зовнішнього ключа (23503): рядок, на який посилались, зник; код — у помилці чи в її cause. */
export function isForeignKeyViolation(error: unknown): boolean {
  for (let current = error; current && typeof current === 'object'; current = (current as { cause?: unknown }).cause) {
    if ((current as { code?: unknown }).code === FOREIGN_KEY_VIOLATION) return true;
  }
  return false;
}
