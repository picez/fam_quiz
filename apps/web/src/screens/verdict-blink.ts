import { useEffect, useRef, useState } from 'react';
import type { Spotlight } from '@quiz/shared';

/** Скільки мигає вердикт: шість циклів по 0,5 с. */
export const BLINK_MS = 3000;

/** Ключ вердикту: гравець, оцінка й відповідь; без оцінки null. */
function verdictKey(spotlight: Spotlight | null): string | null {
  if (spotlight === null || spotlight.grade === null) return null;
  return `${spotlight.playerId}|${spotlight.grade}|${JSON.stringify(spotlight.answer)}`;
}

/**
 * true впродовж BLINK_MS після появи вердикту у відповіді одного гравця; під час першого показу — false.
 * Хук стоїть на рівні екрана, щоб пережити зміну гілки JSX між question і reveal.
 */
export function useVerdictBlink(spotlight: Spotlight | null): boolean {
  const key = verdictKey(spotlight);
  const seen = useRef(key);
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    if (key === seen.current) return;
    seen.current = key;
    if (key === null) {
      setBlink(false);
      return;
    }
    setBlink(true);
    const stop = setTimeout(() => setBlink(false), BLINK_MS);
    return () => clearTimeout(stop);
  }, [key]);

  return blink;
}
