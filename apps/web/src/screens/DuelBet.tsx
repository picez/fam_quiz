import type { DuelInfo, DuelSide, PlayerDuel } from '@quiz/shared';
import { num } from '../format';
import { t } from '../i18n';
import { useGuardedSend } from '../live/useGuardedSend';
import type { Send } from '../live/types';

/**
 * Ставка на дуелянта (39): два імені й «Без ставки»; вибір можна міняти, поки ставки відкриті.
 * can false при відкритих ставках і без паузи — лише некапітан команди: підпис, що ставить капітан.
 */
export function DuelBet({
  duel,
  bet,
  paused,
  send,
  onError,
}: {
  duel: DuelInfo;
  bet: NonNullable<PlayerDuel['bet']>;
  paused: boolean;
  send: Send;
  onError: (text: string | null) => void;
}) {
  const guard = useGuardedSend(send, onError);
  const bets = duel.bets;
  if (bets === null || !bets.open) return null;
  const off = !bet.can || paused || guard.busy;
  const choose = (side: DuelSide | null) => void guard.run('player:duel-bet', { side });
  const options: { side: DuelSide; nickname: string }[] = [
    { side: 'challenger', nickname: duel.challenger.nickname },
    { side: 'opponent', nickname: duel.opponent.nickname },
  ];
  return (
    <section className="duel-bet">
      <p className="lead">{t('duelBetTitle')}</p>
      <p className="meta">{t('duelBetStake', { stake: num(bets.stake) })}</p>
      <div className="duel-bet-sides">
        {options.map(({ side, nickname }) => (
          <button key={side} type="button" className={`btn duel-bet-side is-${side}`} aria-pressed={bet.side === side} disabled={off} onClick={() => choose(side)}>
            {nickname}
          </button>
        ))}
      </div>
      <button type="button" className="btn btn-quiet duel-bet-none" aria-pressed={bet.side === null} disabled={off} onClick={() => choose(null)}>
        {t('duelBetNone')}
      </button>
      {!bet.can && !paused && <p className="meta">{t('duelBetTeam')}</p>}
    </section>
  );
}

/** Бік переможця дуелі; null — нічия. */
export function winnerSide(duel: DuelInfo): DuelSide | null {
  if (duel.winner === null) return null;
  return duel.winner.playerId === duel.challenger.playerId ? 'challenger' : 'opponent';
}

/** Рядок ставця на підсумку: зіграла, не зіграла чи нічия; null — не ставив. */
export function DuelBetResult({ duel, bet }: { duel: DuelInfo; bet: PlayerDuel['bet'] }) {
  if (duel.bets === null || bet === null || bet.side === null) return null;
  const won = winnerSide(duel);
  const stake = num(duel.bets.stake);
  if (won === null) return <p className="duel-bet-result">{t('duelBetTie')}</p>;
  return won === bet.side ? (
    <p className="duel-bet-result is-won">{t('duelBetWon', { stake })}</p>
  ) : (
    <p className="duel-bet-result is-lost">{t('duelBetLost', { stake })}</p>
  );
}
