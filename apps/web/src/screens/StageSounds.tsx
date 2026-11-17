import { t } from '../i18n';
import type { StageSoundsControl } from '../live/useStageSounds';

/**
 * Звуки сцени (40) у куті сцени: рівно одне з — нічого (немає Web Audio), підпис «вимкнув ведучий»,
 * кнопка «Увімкнути звуки» (поки звук не розблоковано) або перемикач пристрою.
 */
export function StageSoundsButton({ control }: { control: StageSoundsControl }) {
  if (!control.supported) return null;
  if (!control.hostOn) return <span className="meta stage-sounds-off">{t('stageSoundsOffByHost')}</span>;
  if (control.device && !control.ready) {
    return (
      // Різні key: клік, що будить звук ще в фазі перехоплення, не дістанеться перемикача на місці тієї самої кнопки.
      <button key="unlock" type="button" className="btn btn-small stage-sounds-unlock" onClick={control.unlock}>
        {t('stageSoundsUnlock')}
      </button>
    );
  }
  return (
    <button key="toggle" type="button" className="btn btn-small stage-sounds-toggle" aria-pressed={control.device} onClick={control.toggle}>
      {t('stageSoundsToggle')}
    </button>
  );
}
