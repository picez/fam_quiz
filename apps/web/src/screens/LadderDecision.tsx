import type { LadderInfo } from '@quiz/shared';
import { num } from '../format';
import { t } from '../i18n';

/** Рішення учасника: «Граю далі» і «Забрати {banked}» — великі, одна під одною; під ними, що гарантовано і за скільки наступне. */
export function LadderDecision({ info, disabled, onDecide }: { info: LadderInfo; disabled: boolean; onDecide: (take: boolean) => void }) {
  const next = info.steps[info.current + 1] ?? null;
  return (
    <section className="ladder-decision">
      <button type="button" className="btn btn-primary ladder-go" disabled={disabled} onClick={() => onDecide(false)}>
        {t('ladderGoOn')}
      </button>
      <button type="button" className="btn ladder-take" disabled={disabled} onClick={() => onDecide(true)}>
        {t('ladderTake', { points: num(info.banked) })}
      </button>
      <p className="meta">{t('ladderGuaranteed', { points: num(info.guaranteed) })}</p>
      {next !== null && <p className="meta">{t('ladderNextFor', { points: num(next.level) })}</p>}
    </section>
  );
}
