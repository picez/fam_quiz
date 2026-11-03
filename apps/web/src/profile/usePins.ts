import { useCallback, useEffect, useRef, useState } from 'react';
import { SHOWCASE_PIN_LIMITS, type ShowcasePin, type ShowcasePins } from '@quiz/shared';
import { getShowcasePins, pinToShowcase, unpinFromShowcase } from '../api';
import { errorText, t } from '../i18n';

const listOf = (pins: ShowcasePins, kind: ShowcasePin['kind']): string[] => (kind === 'prize' ? pins.prizes : pins.achievements);

/** «На вітрині вже 3 кубки…» / «…5 ачівок…»: число — завжди ліміт виду. */
const fullText = (kind: ShowcasePin['kind']) =>
  kind === 'prize' ? t('pinFullPrizes', { n: SHOWCASE_PIN_LIMITS.prize }) : t('pinFullAchievements', { n: SHOWCASE_PIN_LIMITS.achievement });

/**
 * Закріплене на вітрині. initial є — без запиту; немає — GET. Ліміт перевіряється до запиту (жодної мовчазної заміни),
 * 409 showcase_full — той самий текст. Поки запит триває, busy і другий toggle ігнорується (подвійний дотик).
 */
export function usePins(initial?: ShowcasePins): {
  pins: ShowcasePins | null;
  busy: boolean;
  message: string | null;
  isPinned: (pin: ShowcasePin) => boolean;
  toggle: (pin: ShowcasePin) => Promise<void>;
} {
  const [pins, setPins] = useState<ShowcasePins | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const running = useRef(false);
  const latest = useRef(pins);
  latest.current = pins;
  const hasInitial = initial !== undefined;

  useEffect(() => {
    if (hasInitial) return;
    let current = true;
    void getShowcasePins().then((result) => {
      if (!current) return;
      if (result.ok) setPins(result.data);
      else setMessage(errorText(result.error));
    });
    return () => {
      current = false;
    };
  }, [hasInitial]);

  const isPinned = useCallback((pin: ShowcasePin) => pins !== null && listOf(pins, pin.kind).includes(pin.id), [pins]);

  const toggle = useCallback(async (pin: ShowcasePin) => {
    const now = latest.current;
    if (running.current || now === null) return;
    const list = listOf(now, pin.kind);
    const pinned = list.includes(pin.id);
    if (!pinned && list.length >= SHOWCASE_PIN_LIMITS[pin.kind]) {
      setMessage(fullText(pin.kind));
      return;
    }
    running.current = true;
    setBusy(true);
    setMessage(null);
    const result = pinned ? await unpinFromShowcase(pin) : await pinToShowcase(pin);
    running.current = false;
    setBusy(false);
    if (result.ok) setPins(result.data);
    else setMessage(result.error === 'showcase_full' ? fullText(pin.kind) : errorText(result.error));
  }, []);

  return { pins, busy, message, isPinned, toggle };
}
