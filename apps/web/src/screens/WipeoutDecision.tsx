import { LIMITS, type PlayerView } from '@quiz/shared';
import { num } from '../format';
import { t } from '../i18n';
import { Timer } from '../live/Timer';

/** Телефон у вікні «Далі / Забрати»: дві великі кнопки з відліком; після рішення чи поза грою — рядок стану. */
export function WipeoutDecision({ view, offsetMs, onDecide }: { view: PlayerView; offsetMs: number; onDecide: (take: boolean) => void }) {
  const own = view.me.wipeout;
  if (own === null) return null;
  const bank = num(own.bank);
  if (own.decision === 'take' || own.status === 'took') return <p className="lead wipeout-state">{t('wipeoutTook', { bank })}</p>;
  if (own.status === 'burned') return <p className="lead wipeout-state is-burned">{t('wipeoutBurned')}</p>;
  if (own.status === 'survived') return <p className="lead wipeout-state">{t('wipeoutSurvived', { bank })}</p>;
  if (own.decision === 'stay') return <p className="lead wipeout-state">{t('wipeoutStayed')}</p>;
  const decide = view.wipeout?.decide ?? null;
  if (decide === null) return null;
  // На паузі сервер каже canDecide: false, але кнопки лишаються на місці, лише вимкнені.
  const disabled = view.paused || !own.canDecide;
  return (
    <section className="wipeout-decision">
      <Timer view={decide} offsetMs={offsetMs} status={view.paused ? 'paused' : null} />
      <button type="button" className="btn btn-primary wipeout-take" disabled={disabled} onClick={() => onDecide(true)}>
        {t('wipeoutTake', { bank })}
      </button>
      <button type="button" className="btn wipeout-go" disabled={disabled} onClick={() => onDecide(false)}>
        {t('wipeoutGo')}
      </button>
      <p className="meta">{t('wipeoutDefault', { seconds: LIMITS.wipeoutDecideSeconds })}</p>
    </section>
  );
}
