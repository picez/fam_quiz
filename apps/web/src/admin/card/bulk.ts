import type { ApiResult } from '../../api';

/** Предмета вже немає (друга вкладка, другий адмін) — не помилка масової дії. */
const GONE = new Set(['not_found', 'gift_not_found']);

/** Результат масової дії; при помилці `done` — скільки встигло зробитись до неї (картка тоді вже застаріла). */
export type BulkResult = { ok: true; done: number; skipped: number } | { ok: false; error: string; done: number };

/** 69: масова дія — запити по черзі; предмета вже немає (not_found / gift_not_found) — пропуск, інша помилка — зупинка. */
export async function runEach<T>(items: readonly T[], run: (item: T) => Promise<ApiResult<object>>): Promise<BulkResult> {
  let done = 0;
  let skipped = 0;
  for (const item of items) {
    const result = await run(item);
    if (result.ok) done += 1;
    else if (GONE.has(result.error)) skipped += 1;
    else return { ok: false, error: result.error, done };
  }
  return { ok: true, done, skipped };
}
