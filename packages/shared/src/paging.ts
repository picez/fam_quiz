/** Скільки сторінок по size для total рядків; щонайменше одна. */
export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size));
}

/** Зсув рядків для сторінки з номером від 1. */
export function pageOffset(page: number, size: number): number {
  return (page - 1) * size;
}

/** Зсув наступної сторінки, коли запит брав size + 1 рядків; null — сторінок більше немає. */
export function nextOffset(fetched: number, offset: number, size: number): number | null {
  return fetched > size ? offset + size : null;
}

/** Рівні сторінки: не більше most, але без майже порожньої останньої (45 при 40 → 23). */
export function evenPageSize(n: number, most: number): number {
  if (n <= most) return Math.max(1, n);
  return Math.ceil(n / Math.ceil(n / most));
}

/** Сторінка з номером від 0. */
export function pageSlice<T>(items: readonly T[], page: number, size: number): T[] {
  return items.slice(page * size, page * size + size);
}
