import { useEffect, useState } from 'react';

/** Сцена, якої нема вже STAGE_GONE_MS: короткий розрив (перепідключення, оновлення сцени) не вмикає звук деінде. */
export const STAGE_GONE_MS = 3000;

export function useStageGone(stageOnline: boolean): boolean {
  // Якщо сцени немає вже при відкритті екрана, чекати нічого.
  const [gone, setGone] = useState(!stageOnline);
  useEffect(() => {
    if (stageOnline) {
      setGone(false);
      return;
    }
    const id = setTimeout(() => setGone(true), STAGE_GONE_MS);
    return () => clearTimeout(id);
  }, [stageOnline]);
  return gone && !stageOnline;
}
