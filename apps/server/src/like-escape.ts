/** Зворотна скісна риска: через код символу, щоб її не з'їла жодна нормалізація тексту. */
const BACKSLASH = String.fromCharCode(92);

/** 63: шаблон «містить» для ilike — зворотна скісна риска, % і _ екрануються (стандартний ESCAPE у Postgres — та сама риска). */
export function containsPattern(q: string): string {
  return `%${[...q].map((c) => (c === BACKSLASH || c === '%' || c === '_' ? BACKSLASH + c : c)).join('')}%`;
}
