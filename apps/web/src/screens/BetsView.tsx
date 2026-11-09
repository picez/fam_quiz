import { useRef, useState, type FormEvent } from 'react';
import type { BetsInfo, PlayerBets } from '@quiz/shared';
import { num } from '../format';
import { errorText, t } from '../i18n';
import type { Send } from '../live/types';

/** Тема, «Запитання k з n» і початок тексту: спільна шапка ставки (і для того, хто лише дивиться). */
export function BetsHeader({ bets }: { bets: BetsInfo }) {
  return (
    <>
      {bets.theme !== '' && <p className="meta wager-theme">{bets.theme}</p>}
      <p className="meta">{t('betsQuestionOf', { index: bets.index + 1, total: bets.total })}</p>
      {bets.teaser !== null && bets.teaser !== '' && (
        <section className="bets-teaser">
          <p className="meta">{t('betsTeaserLabel')}</p>
          <p className="bets-teaser-text" dir="auto">{bets.teaser}</p>
        </section>
      )}
    </>
  );
}

/** Ставка гравця у «Ставках» (27a): тема, «Запитання k з n», початок тексту й поле від мінімуму до межі; low — лише пояснення. */
export function BetForm({ bets, mine, send }: { bets: BetsInfo; mine: PlayerBets; send: Send }) {
  const [value, setValue] = useState(mine.wager === null ? '' : String(mine.wager));
  const [placed, setPlaced] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const header = <BetsHeader bets={bets} />;
  if (mine.status === 'low') {
    return (
      <section className="wager-form bets-form">
        {header}
        <p className="lead bets-skip" role="status">{t('betsSkipLow', { min: num(mine.minimum) })}</p>
      </section>
    );
  }
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy.current || value.trim() === '') return;
    busy.current = true;
    const amount = Number(value);
    void send('player:wager', { amount })
      .then((result) => {
        setError(result.ok ? null : errorText(result.error));
        if (result.ok) setPlaced(amount);
      })
      .finally(() => {
        busy.current = false;
      });
  };
  const mineWager = placed ?? mine.wager;
  return (
    <section className="wager-form bets-form">
      {header}
      <form onSubmit={submit} noValidate>
        <p className="lead">{t('betsPrompt', { min: num(mine.minimum), limit: num(mine.limit) })}</p>
        <div className="wager-row">
          <label className="field">
            <span className="meta">{t('finalWagerLabel')}</span>
            <input
              type="number"
              inputMode="numeric"
              dir="ltr"
              min={mine.minimum}
              max={mine.limit}
              step={1}
              value={value}
              disabled={!mine.canBet}
              onChange={(event) => {
                setValue(event.target.value);
                setError(null);
              }}
            />
          </label>
          <button type="button" className="btn" disabled={!mine.canBet} onClick={() => setValue(String(mine.minimum))}>
            {t('betsMinimumButton')}
          </button>
        </div>
        <button type="submit" className="btn btn-primary" disabled={!mine.canBet}>
          {t('betsPlace')}
        </button>
        <p className="meta bets-error" role="status">{error}</p>
      </form>
      {mineWager !== null && <p className="wager-mine">{t('betsMine', { wager: num(mineWager) })}</p>}
    </section>
  );
}

/** Підсумок гравця на reveal: ставка й +бали / «у банк» / «повернуто»; хто пропускає — чому. До reveal нічого. */
export function BetResult({ bets, mine, playerId }: { bets: BetsInfo; mine: PlayerBets; playerId: string }) {
  if (mine.status === 'low') return <p className="lead bets-skip" role="status">{t('betsSkipLow', { min: num(mine.minimum) })}</p>;
  if (mine.status === 'late') return <p className="lead bets-skip" role="status">{t('betsSkipLate')}</p>;
  const row = bets.rows?.find((entry) => entry.playerId === playerId);
  if (row === undefined) return null;
  const wager = num(row.wager);
  const text = bets.refund
    ? t('betsRefunded')
    : row.grade !== 'correct'
      ? t('betsLost', { wager })
      : row.points > 0
        ? t('betsWon', { wager, points: num(row.points) })
        : t('betsKeptNoBank');
  return <p className="wager-note bets-result">{text}</p>;
}
