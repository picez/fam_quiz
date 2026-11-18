import { useEffect, useRef } from 'react';
import { t } from '../i18n';
import type { StageSoundsControl } from '../live/useStageSounds';

/**
 * Звуки сцени (40) у куті сцени: рівно одне з — нічого (немає Web Audio), підпис «вимкнув ведучий»,
 * кнопка «Увімкнути звуки» (поки звук не розблоковано) або перемикач пристрою.
 */
export function StageSoundsButton({ control }: { control: StageSoundsControl }) {
  const toggleRef = useRef<HTMLButtonElement>(null);
  // Чи мала фокус кнопка «Увімкнути звуки»: коли звук розблоковано, на її місці монтується перемикач, і фокус не має впасти на body.
  // Фокус, що пішов на інший елемент (relatedTarget), скидає позначку; зникнення самого вузла blur не викликає.
  const unlockFocused = useRef(false);
  const showToggle = control.supported && control.hostOn && !(control.device && !control.ready);
  useEffect(() => {
    if (showToggle && unlockFocused.current) {
      unlockFocused.current = false;
      toggleRef.current?.focus();
    }
  }, [showToggle]);

  if (!control.supported) return null;
  if (!control.hostOn) return <span className="meta stage-sounds-off">{t('stageSoundsOffByHost')}</span>;
  if (control.device && !control.ready) {
    return (
      // Різні key: клік, що будить звук ще в фазі перехоплення, не дістанеться перемикача на місці тієї самої кнопки.
      <button
        key="unlock"
        type="button"
        className="btn btn-small stage-sounds-unlock"
        onFocus={() => {
          unlockFocused.current = true;
        }}
        onBlur={(event) => {
          if (event.relatedTarget !== null) unlockFocused.current = false;
        }}
        onClick={control.unlock}
      >
        {t('stageSoundsUnlock')}
      </button>
    );
  }
  return (
    <button key="toggle" ref={toggleRef} type="button" className="btn btn-small stage-sounds-toggle" aria-pressed={control.device} onClick={control.toggle}>
      {t('stageSoundsToggle')}
    </button>
  );
}
