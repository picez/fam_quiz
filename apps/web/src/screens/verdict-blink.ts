import { useEffect, useRef, useState } from 'react';
import type { BlitzRow, Spotlight } from '@quiz/shared';

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

/**
 * playerId рядків черги, у яких вердикт з'явився менше ніж BLINK_MS тому; під час першого показу — порожньо.
 * scope — номер запитання: той самий вердикт того самого гравця в наступному запитанні знову мигає.
 */
export function useBlinkingRows(rows: BlitzRow[], scope: number): ReadonlySet<string> {
  const graded = rows.filter((row) => row.grade !== null).map((row) => ({ key: `${scope}|${row.playerId}|${row.grade}`, playerId: row.playerId }));
  const signature = graded.map((row) => row.key).join(' ');
  const seen = useRef<Set<string> | null>(null);
  if (seen.current === null) seen.current = new Set(graded.map((row) => row.key));
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [blinking, setBlinking] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    const known = seen.current ?? new Set<string>();
    const fresh = graded.filter((row) => !known.has(row.key));
    if (fresh.length === 0) return;
    for (const row of fresh) known.add(row.key);
    setBlinking((current) => new Set([...current, ...fresh.map((row) => row.playerId)]));
    // Кожен рядок гасне за власним відліком: новий вердикт посеред миготіння не продовжує чужий.
    for (const { playerId } of fresh) {
      clearTimeout(timers.current.get(playerId));
      timers.current.set(
        playerId,
        setTimeout(() => {
          timers.current.delete(playerId);
          setBlinking((current) => new Set([...current].filter((id) => id !== playerId)));
        }, BLINK_MS),
      );
    }
    // graded виводиться з signature.
  }, [signature]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  return blinking;
}
