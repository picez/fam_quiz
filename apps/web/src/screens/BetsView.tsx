import { useRef, useState, type FormEvent } from 'react';
import type { BetsInfo, Grade, HostBets, PlayerBets } from '@quiz/shared';
import { answerText, num, signed } from '../format';
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
  // Сервер міг змінити ставку (ведучий зняв бали — ставку зрізано до межі): нова ставка з вигляду скасовує свою пам'ять.
  const [seen, setSeen] = useState(mine.wager);
  if (seen !== mine.wager) {
    setSeen(mine.wager);
    setPlaced(null);
  }
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

/** Імена через кому: «Олена, Тарас». */
const names = (list: { nickname: string }[]) => list.map((entry) => entry.nickname).join(', ');

/** Рядок «Банк: N · Поставили: …» (або «Ще ніхто не поставив»): без жодної окремої суми. */
export function BetsStrip({ bets }: { bets: BetsInfo }) {
  const who = bets.placed.length === 0 ? t('betsNobodyYet') : t('betsPlacedNames', { names: names(bets.placed) });
  return (
    <p className="meta bets-strip" role="status">
      {t('betsBank', { bank: num(bets.bank) })} · {who}
    </p>
  );
}

/** Сцена під час ставок: тема, «Запитання k з n», початок тексту, мінімум і найбільша ставка, банк і хто поставив (без сум). */
export function BetsStage({ bets }: { bets: BetsInfo }) {
  return (
    <div className="stage-board bets-stage">
      {bets.theme !== '' && <h1 className="question wager-theme">{bets.theme}</h1>}
      <p className="meta">{t('betsQuestionOf', { index: bets.index + 1, total: bets.total })}</p>
      {bets.teaser !== null && bets.teaser !== '' && (
        <p className="question bets-stage-teaser" dir="auto">
          {bets.teaser}
        </p>
      )}
      <p className="lead">{t('betsMinimumStage', { min: num(bets.minimum) })}</p>
      {bets.maximum !== null && <p className="lead">{t('betsMaximumStage', { max: num(bets.maximum) })}</p>}
      <div className="bank-meter" role="status">
        <span className="bank-meter-text">{t('betsBank', { bank: num(bets.bank) })}</span>
      </div>
      <p className="meta bets-strip" role="status">
        {bets.placed.length === 0 ? t('betsNobodyYet') : t('betsPlacedNames', { names: names(bets.placed) })}
      </p>
    </div>
  );
}

/** Розкриття: кожен, хто грав, — ставка, ✓/✗ і бали; «Ставки повернуто»; нижче — хто пропускав. */
export function BetsResults({ bets, players }: { bets: BetsInfo; players: { id: string; nickname: string }[] }) {
  const rows = bets.rows ?? [];
  const skipping = players.filter((player) => !rows.some((entry) => entry.playerId === player.id));
  return (
    <>
      {bets.refund && (
        <div className="bank-meter" role="status">
          <span className="bank-meter-text">{t('betsRefundStage')}</span>
        </div>
      )}
      <ol className="rows wager-list wager-reveal bets-results">
        {rows.map((entry) => (
          <li key={entry.playerId}>
            <span className="wager-who">
              <span className="name" dir="auto">{entry.nickname}</span>
            </span>
            <span className="tag wager-stake">{t('betsRowStake', { wager: num(entry.wager) })}</span>
            <span className={entry.grade === 'correct' ? 'tag is-correct' : 'tag is-wrong'}>{entry.grade === 'correct' ? '✓' : '✗'}</span>
            <span className={bets.refund || entry.points === 0 ? 'wager-delta' : entry.points > 0 ? 'wager-delta is-up' : 'wager-delta is-down'} dir="ltr">
              {signed(entry.points)}
            </span>
          </li>
        ))}
      </ol>
      {skipping.length > 0 && <p className="meta bets-skipping">{t('betsSkipping', { names: names(skipping) })}</p>}
    </>
  );
}

/** Пульт: повне запитання з позначеним початком, який бачать гравці; ставки всіх із сумами й межами; «Відкрити запитання»; оцінка для ручної перевірки. */
export function HostBetsPanel({ bets, send, openButton = true, presented, onError }: { bets: HostBets; send: Send; openButton?: boolean; presented?: { id: string }[]; onError?: (text: string | null) => void }) {
  const wager = bets.teaser !== null;
  const text = bets.question.text;
  const seen = bets.teaser !== null && bets.teaser !== '' && text.startsWith(bets.teaser) ? bets.teaser : '';
  const grade = (playerId: string, value: Grade) =>
    void send('host:override', { playerId, grade: value }).then((result) => onError?.(result.ok ? null : errorText(result.error)));
  return (
    <>
      <section className="panel bets-host">
        <h2>{t('betsQuestionOf', { index: bets.index + 1, total: bets.total })}</h2>
        <p className="bets-host-text" dir="auto">
          {seen !== '' && <mark className="bets-cut-seen">{seen}</mark>}
          {text.slice(seen.length)}
        </p>
        {bets.teaser !== null && (
          <p className="meta">{`${t('betsHostCut')}: ${bets.teaser === '' ? bets.theme : bets.teaser}`}</p>
        )}
        <BetsStrip bets={bets} />
        {wager && (
          <ul className="rows wager-list">
            {bets.wagers.map((entry) => (
              <li key={entry.playerId}>
                <span className="name" dir="auto">{entry.nickname}</span>
                <span className="given">{entry.wager === null ? t('finalThinking') : num(entry.wager)}</span>
                <span className="meta">{entry.canBet ? t('betsHostLimit', { limit: num(entry.limit) }) : t('betsHostCannot')}</span>
              </li>
            ))}
          </ul>
        )}
        {wager && openButton && (
          <button type="button" className="btn btn-primary" onClick={() => void send('host:next', undefined)}>
            {t('betsOpen')}
          </button>
        )}
      </section>
      {bets.pending.length > 0 && (
        <section className="panel">
          <h2>{t('pendingTitle')}</h2>
          <ul className="rows">
            {bets.pending.map((entry) => (
              <li key={entry.playerId}>
                <span className="name" dir="auto">{entry.nickname}</span>
                <span className="given">{answerText(entry.answer, bets.question, presented)}</span>
                <span className="row-actions">
                  <button type="button" className="btn btn-small" onClick={() => grade(entry.playerId, 'correct')}>
                    {t('finalGradeCorrect')}
                  </button>
                  <button type="button" className="btn btn-small" onClick={() => grade(entry.playerId, 'wrong')}>
                    {t('finalGradeWrong')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
