const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/**
 * Чи можна зберегти рядок у PostgreSQL. База не приймає нульовий символ і «половинки»
 * символів поза основною площиною; один такий рядок зірвав би збереження всієї гри.
 */
export function isStorable(value: string): boolean {
  return !value.includes('\u0000') && !LONE_SURROGATE.test(value);
}

export const UNSTORABLE = 'unstorable_text';
