/** Невеликий словник у sessionStorage вкладки з обмеженням розміру: найстаріші записи випадають першими. */
export function sessionMap<T>(name: string, limit: number) {
  let cache: Record<string, T> | null = null;
  const read = (): Record<string, T> => {
    if (cache !== null) return cache;
    try {
      const raw = sessionStorage.getItem(name);
      const parsed: unknown = raw === null ? null : JSON.parse(raw);
      cache = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, T>) : {};
    } catch {
      cache = {};
    }
    return cache;
  };
  const write = () => {
    try {
      sessionStorage.setItem(name, JSON.stringify(cache ?? {}));
    } catch {
      // Сховище недоступне: памʼятаємо лише до перезавантаження.
    }
  };
  return {
    get: (key: string): T | undefined => read()[key],
    set: (key: string, value: T) => {
      const map = read();
      delete map[key];
      map[key] = value;
      const keys = Object.keys(map);
      for (const old of keys.slice(0, Math.max(0, keys.length - limit))) delete map[old];
      write();
    },
    remove: (key: string) => {
      const map = read();
      if (!(key in map)) return;
      delete map[key];
      write();
    },
    clear: () => {
      cache = {};
      try {
        sessionStorage.removeItem(name);
      } catch {
        // Нічого прибирати.
      }
    },
  };
}
