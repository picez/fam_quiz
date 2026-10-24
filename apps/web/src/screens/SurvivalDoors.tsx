import { DOOR_COUNT } from '@quiz/shared';
import { t } from '../i18n';

const DOORS = Array.from({ length: DOOR_COUNT }, (_, index) => index);

/** Троє дверей в один ряд: кожні великі, з номером; після закриття — пастка й вибрані двері (auto — вибрано самі). */
export function SurvivalDoors({
  picked,
  disabled,
  reveal,
  onPick,
  size,
}: {
  picked: number | null;
  disabled: boolean;
  reveal: { picked: number | null; auto: boolean; trap: number } | null;
  onPick?: (door: number) => void;
  size: 'stage' | 'phone';
}) {
  return (
    <div className={`survival-doors is-${size}`}>
      {DOORS.map((door) => {
        const chosen = reveal !== null ? reveal.picked === door : picked === door;
        const trap = reveal !== null && reveal.trap === door;
        const className = `survival-door${chosen ? ' is-picked' : ''}${trap ? ' is-trap' : ''}${reveal !== null ? ' is-open' : ''}`;
        return (
          <button
            key={door}
            type="button"
            className={className}
            aria-label={t('survivalDoor', { n: door + 1 })}
            aria-pressed={chosen}
            disabled={disabled || reveal !== null}
            onClick={() => onPick?.(door)}
          >
            <span className="survival-door-n" aria-hidden="true">
              {door + 1}
            </span>
            {trap && <span className="survival-door-note is-trap">{t('survivalTrap')}</span>}
            {chosen && reveal !== null && reveal.auto && <span className="survival-door-note">{t('survivalDoorAuto')}</span>}
          </button>
        );
      })}
    </div>
  );
}
