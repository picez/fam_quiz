import { useRef, useState } from 'react';
import { errorText } from '../i18n';
import type { Send } from './types';

/** Один запит за раз: поки відповіді немає, другий дотик не йде; помилка — onError(текст), успіх — onError(null). */
export function useGuardedSend(send: Send, onError: (message: string | null) => void) {
  const [busy, setBusy] = useState(false);
  const ref = useRef(false);
  const run = async (event: Parameters<Send>[0], payload: unknown): Promise<boolean> => {
    if (ref.current) return false;
    const release = () => {
      ref.current = false;
      setBusy(false);
    };
    ref.current = true;
    setBusy(true);
    const fallback = setTimeout(release, 3000);
    try {
      const result = await send(event, payload);
      onError(result.ok ? null : errorText(result.error));
      return result.ok;
    } catch {
      onError(errorText('unknown'));
      return false;
    } finally {
      clearTimeout(fallback);
      release();
    }
  };
  return { busy, run };
}
