import { useEffect, useState } from 'react';

/**
 * Значення, що «вляглося»: нове показується лише через ms після останньої зміни (кожна зміна переносить строк).
 * ms 0 — те саме значення в тому самому рендері. Значення порівнюються за Object.is, тож об'єкт має бути стабільним
 * між рендерами (useMemo), інакше кожен рендер переносить строк.
 */
export function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (ms <= 0) {
      setSettled(() => value);
      return;
    }
    const timer = setTimeout(() => setSettled(() => value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return ms <= 0 ? value : settled;
}
