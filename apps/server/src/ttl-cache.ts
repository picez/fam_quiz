/** Кеш одного значення на ttlMs: один запит на всіх, хто чекає; збій не кешується. */
export function ttlCache<T>(load: () => Promise<T>, ttlMs: number, clock: () => number): { get(): Promise<T>; clear(): void } {
  let value: { at: number; data: T } | null = null;
  let pending: Promise<T> | null = null;
  let generation = 0;
  return {
    get() {
      if (value !== null && clock() - value.at < ttlMs) return Promise.resolve(value.data);
      if (pending !== null) return pending;
      const mine = generation;
      const started = clock();
      const loading = load().then(
        (data) => {
          if (mine === generation) value = { at: started, data };
          if (pending === loading) pending = null;
          return data;
        },
        (error: unknown) => {
          if (pending === loading) pending = null;
          throw error;
        },
      );
      pending = loading;
      return loading;
    },
    clear() {
      generation += 1;
      value = null;
      pending = null;
    },
  };
}
