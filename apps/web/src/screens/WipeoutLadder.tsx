import type { WipeoutInfo, WipeoutRow, WipeoutStatus } from '@quiz/shared';
import { num } from '../format';
import { t } from '../i18n';

type Size = 'stage' | 'host' | 'phone';

const GROUPS: { status: WipeoutStatus; title: 'wipeoutGroupIn' | 'wipeoutGroupTook' | 'wipeoutGroupBurned' | 'wipeoutGroupSurvived' }[] = [
  { status: 'in', title: 'wipeoutGroupIn' },
  { status: 'took', title: 'wipeoutGroupTook' },
  { status: 'survived', title: 'wipeoutGroupSurvived' },
  { status: 'burned', title: 'wipeoutGroupBurned' },
];

/** Позначка рішення у вікні: сцена й телефон бачать лише «вирішив», пульт — вибір наживо. */
function decisionMark(row: WipeoutRow, size: Size): string | null {
  if (row.decision === 'decided') return t('wipeoutDecidedMark');
  // Вибір наживо лише на пульті, навіть якщо зріз його містить.
  if (size !== 'host') return row.decision === 'pending' ? t('wipeoutPendingMark') : null;
  if (row.decision === 'take') return t('wipeoutChoseTake');
  if (row.decision === 'stay') return t('wipeoutChoseStay');
  if (row.decision === 'pending') return t('wipeoutPendingMark');
  return null;
}

/** Гравці за станом: у грі (банк), забрали, донесли, згоріли; у вікні рішення — позначка. */
export function WipeoutPlayers({ info, size, highlightId }: { info: WipeoutInfo; size: Size; highlightId?: string }) {
  return (
    <div className={`wipeout-players is-${size}`}>
      {info.decide !== null && <p className="meta wipeout-decided">{t('wipeoutDecided', { n: info.decide.decided, total: info.decide.total })}</p>}
      {GROUPS.map(({ status, title }) => {
        const rows = info.rows.filter((row) => row.status === status);
        if (rows.length === 0) return null;
        return (
          <section key={status} className={`wipeout-group is-${status}`}>
            <h3 className="meta">{t(title)}</h3>
            <ul>
              {rows.map((row) => {
                const mark = status === 'in' ? decisionMark(row, size) : null;
                return (
                  <li key={row.playerId} className={row.playerId === highlightId ? 'is-me' : undefined}>
                    <span className="name">{row.nickname}</span>
                    {mark !== null && <span className={`wipeout-mark is-${row.decision}`}>{mark}</span>}
                    {status !== 'burned' && <span className="score">{num(row.bank)}</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** Драбина «Ва-банк»: сходинки цін знизу вгору з поточною, а під нею гравці за станом. */
export function WipeoutLadder({ info, size, highlightId, players = true }: { info: WipeoutInfo; size: Size; highlightId?: string; players?: boolean }) {
  const steps = info.ladder.map((price, index) => ({ price, index })).reverse();
  return (
    <section className={`wipeout-ladder is-${size}`} aria-label={t('wipeoutLadderTitle')}>
      <ol className="wipeout-steps">
        {steps.map(({ price, index }) => {
          const current = index === info.current;
          const done = index < info.done;
          return (
            <li
              key={index}
              className={`wipeout-step${done ? ' is-done' : ''}${current ? ' is-current' : ''}`}
              aria-current={current ? 'step' : undefined}
            >
              <span className="wipeout-price">{num(price)}</span>
              <span className="sr-only">{t('wipeoutStepOf', { index: index + 1, total: info.ladder.length })}</span>
            </li>
          );
        })}
      </ol>
      {players && <WipeoutPlayers info={info} size={size} highlightId={highlightId} />}
    </section>
  );
}
