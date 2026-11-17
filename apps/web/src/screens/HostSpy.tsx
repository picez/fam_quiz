import type { HostSpy as HostSpyInfo } from '@quiz/shared';
import { t } from '../i18n';
import { SpyOutcome, SpyRows } from './SpyBoard';

/**
 * Пульт «Шпигуна» (38): з відкриття — шпигун і обидва слова, лічильник етапу, асоціації й голоси наживо (хто за кого), позначка шпигуна;
 * після закриття — викрито чи ні, останній шанс і бали. Етапи перемикає наявна «Закрити» (host:lock).
 */
export function HostSpy({ spy }: { spy: HostSpyInfo }) {
  const closed = spy.rows.some((row) => row.points !== null);
  return (
    <div className="spy-host">
      {spy.spyName === null ? <p className="lead spy-gone">{t('spyGone')}</p> : <p className="lead spy-title" dir="auto">{t('spyRevealSpy', { name: spy.spyName })}</p>}
      <p className="spy-words" dir="auto">
        {t('spyRevealWords', { players: spy.playersWord, spy: spy.spyWord })}
      </p>
      <p className="meta">{spy.stage === 'words' ? t('answeredOf', { answered: spy.written, total: spy.total }) : t('votedOf', { voted: spy.voted, total: spy.total })}</p>
      {spy.stage === 'guess' && !closed && <p className="lead spy-guess-stage">{t('spyGuessStage')}</p>}
      {closed && <SpyOutcome info={spy} />}
      <SpyRows rows={spy.rows} />
    </div>
  );
}
