import { useRef, useState, type FormEvent } from 'react';
import type { AuctionInfo, Grade, HostAuction, PlayerAuction } from '@quiz/shared';
import { answerText, num, signed } from '../format';
import { errorText, t } from '../i18n';
import { Timer } from '../live/Timer';
import type { Send } from '../live/types';

/** Причина відмови ставки: «час вийшов» на торгу — це «Торг уже закрито». */
const bidError = (code: string) => errorText(code === 'time_over' ? 'time_over:bid' : code);

/** Годинник торгу з підписом; поза торгом (endsAt і remainingMs порожні) — нічого. */
function AuctionClock({ auction, offsetMs }: { auction: AuctionInfo; offsetMs: number }) {
  if (auction.teaser === null || (auction.endsAt === null && auction.remainingMs === null)) return null;
  return (
    <div className="auction-clock">
      <span className="meta">{t('auctionTimerLabel')}</span>
      <Timer view={{ endsAt: auction.endsAt, remainingMs: auction.remainingMs }} offsetMs={offsetMs} total={auction.totalMs} />
    </div>
  );
}

/** «Найбільша ставка: 300 — Олена» або «Ставок ще немає». */
function TopBid({ auction }: { auction: AuctionInfo }) {
  return (
    <p className="lead auction-top" role="status">
      {auction.leader === null || auction.bid <= 0 ? t('auctionNoBids') : t('auctionTopBid', { bid: num(auction.bid), nickname: auction.leader.nickname })}
    </p>
  );
}

/** Шапка торгу для всіх: тема, «Запитання k з n», ціна, початок тексту, найбільша ставка й автор, годинник. */
export function AuctionHeader({ auction, offsetMs }: { auction: AuctionInfo; offsetMs: number }) {
  return (
    <section className="auction-head">
      {auction.theme !== '' && <p className="meta wager-theme">{auction.theme}</p>}
      <p className="meta">{t('betsQuestionOf', { index: auction.index + 1, total: auction.total })}</p>
      <p className="meta auction-price">{t('auctionPrice', { price: num(auction.price) })}</p>
      {auction.teaser !== null && auction.teaser !== '' && (
        <section className="bets-teaser">
          <p className="meta">{t('betsTeaserLabel')}</p>
          <p className="bets-teaser-text" dir="auto">{auction.teaser}</p>
        </section>
      )}
      {auction.teaser !== null && <TopBid auction={auction} />}
      <AuctionClock auction={auction} offsetMs={offsetMs} />
    </section>
  );
}

/** Телефон на wager: step — одна кнопка «Поставити {next}»; free — поле (next…limit) і «Поставити»; leading/short/none — рядок без дії. */
export function BidForm({ auction, mine, send }: { auction: AuctionInfo; mine: PlayerAuction; send: Send }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Нова чужа (чи власна) ставка знімає стару причину відмови, але не введене число.
  const [seenBid, setSeenBid] = useState(auction.bid);
  if (seenBid !== auction.bid) {
    setSeenBid(auction.bid);
    setError(null);
  }
  const busy = useRef(false);
  if (mine.status === 'leading') return <p className="lead auction-line" role="status">{t('auctionLeading')}</p>;
  if (mine.status === 'short') return <p className="lead auction-line" role="status">{t('auctionShort', { limit: num(mine.limit) })}</p>;
  if (mine.status === 'none') return <p className="lead auction-line" role="status">{t('auctionNone')}</p>;
  if (mine.status !== 'bidding') return null;
  const place = (amount: number) => {
    if (busy.current) return;
    busy.current = true;
    void send('player:wager', { amount })
      .then((result) => setError(result.ok ? null : bidError(result.error)))
      .finally(() => {
        busy.current = false;
      });
  };
  const status = <p className="meta auction-error" role="status">{error}</p>;
  if (auction.mode === 'step') {
    return (
      <section className="wager-form auction-form">
        <button type="button" className="btn btn-primary auction-raise" disabled={!mine.canBid} onClick={() => place(auction.next)}>
          {t('auctionRaise', { amount: num(auction.next) })}
        </button>
        {status}
      </section>
    );
  }
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim() === '') return;
    place(Number(value));
  };
  return (
    <section className="wager-form auction-form">
      <form onSubmit={submit} noValidate>
        <p className="lead">{t('auctionBidPrompt', { min: num(auction.next), limit: num(mine.limit) })}</p>
        <div className="wager-row">
          <label className="field">
            <span className="meta">{t('auctionBidLabel')}</span>
            <input
              type="number"
              inputMode="numeric"
              dir="ltr"
              min={auction.next}
              max={mine.limit}
              step={1}
              value={value}
              disabled={!mine.canBid}
              onChange={(event) => {
                setValue(event.target.value);
                setError(null);
              }}
            />
          </label>
        </div>
        <button type="submit" className="btn btn-primary" disabled={!mine.canBid}>
          {t('auctionBidPlace')}
        </button>
        {status}
      </form>
    </section>
  );
}

/** Рядок результату переможця: «Правильно: +600» / «Помилка: −400». */
function resultLine(result: { grade: Grade; points: number }) {
  return t(result.grade === 'correct' ? 'auctionResultRight' : 'auctionResultWrong', { points: signed(result.points) });
}

/** Телефон на question…reveal: winner — «Ви купили за {bid}»; watching — «Відповідає {nickname}»; open — «Ніхто не купив»; на reveal — бали переможця. */
export function AuctionResult({ auction, mine }: { auction: AuctionInfo; mine: PlayerAuction }) {
  const who =
    mine.status === 'winner'
      ? t('auctionWinnerYou', { bid: num(auction.bid) })
      : mine.status === 'watching' && auction.leader !== null
        ? t('auctionWinnerOther', { nickname: auction.leader.nickname, bid: num(auction.bid) })
        : mine.status === 'open'
          ? t('auctionOpenAll')
          : null;
  if (who === null) return null;
  return (
    <section className="auction-result">
      <p className="lead auction-who" role="status">{who}</p>
      {auction.result !== null && (
        <p className={auction.result.grade === 'correct' ? 'wager-note auction-points is-up' : 'wager-note auction-points is-down'}>{resultLine(auction.result)}</p>
      )}
    </section>
  );
}

/** Сцена на wager: велика ставка й автор, годинник, тема без схованого. */
export function AuctionStage({ auction, offsetMs }: { auction: AuctionInfo; offsetMs: number }) {
  const bid = auction.leader !== null && auction.bid > 0;
  return (
    <div className="stage-board auction-stage">
      {auction.theme !== '' && <h1 className="question wager-theme">{auction.theme}</h1>}
      <p className="meta">{t('betsQuestionOf', { index: auction.index + 1, total: auction.total })}</p>
      <p className="lead auction-price">{t('auctionPrice', { price: num(auction.price) })}</p>
      {auction.teaser !== null && auction.teaser !== '' && (
        <p className="question bets-stage-teaser" dir="auto">
          {auction.teaser}
        </p>
      )}
      <div className="auction-stage-bid" role="status">
        {bid && auction.leader !== null ? (
          <>
            <span className="auction-stage-amount" dir="ltr">{num(auction.bid)}</span>
            <span className="auction-stage-leader" dir="auto">{auction.leader.nickname}</span>
          </>
        ) : (
          <span className="auction-stage-none">{t('auctionNoBids')}</span>
        )}
      </div>
      <AuctionClock auction={auction} offsetMs={offsetMs} />
    </div>
  );
}

/** Смуга на question/locked: «Продано: {nickname} за {bid}» або «Ніхто не купив — відповідають усі». */
export function AuctionStrip({ auction }: { auction: AuctionInfo }) {
  return (
    <p className="meta auction-strip" role="status">
      {auction.leader !== null && auction.bid > 0 ? t('auctionSoldTo', { nickname: auction.leader.nickname, bid: num(auction.bid) }) : t('auctionOpenAll')}
    </p>
  );
}

/** Рядок reveal проданого: переможець · ставка · ✓/✗ · бали. */
export function AuctionResults({ auction }: { auction: AuctionInfo }) {
  if (auction.result === null || auction.leader === null) return null;
  const { result } = auction;
  return (
    <ol className="rows wager-list wager-reveal auction-results">
      <li>
        <span className="wager-who">
          <span className="name" dir="auto">{auction.leader.nickname}</span>
        </span>
        <span className="tag wager-stake">{t('betsRowStake', { wager: num(auction.bid) })}</span>
        <span className={result.grade === 'correct' ? 'tag is-correct' : 'tag is-wrong'}>{result.grade === 'correct' ? '✓' : '✗'}</span>
        <span className={result.points === 0 ? 'wager-delta' : result.points > 0 ? 'wager-delta is-up' : 'wager-delta is-down'} dir="ltr">
          {signed(result.points)}
        </span>
      </li>
    </ol>
  );
}

/** Пульт: повне запитання з позначеним обрізом, межі всіх, лідер, «Продано» (host:next) на wager; оцінка для manual. */
export function HostAuctionPanel({
  auction,
  send,
  onError,
  sellButton = true,
  presented,
  offsetMs = 0,
}: {
  auction: HostAuction;
  send: Send;
  onError?: (text: string | null) => void;
  /** false — «Продано» стоїть головною кнопкою пульта. */
  sellButton?: boolean;
  presented?: { id: string }[];
  offsetMs?: number;
}) {
  const wager = auction.teaser !== null;
  const text = auction.question.text;
  const seen = auction.teaser !== null && auction.teaser !== '' && text.startsWith(auction.teaser) ? auction.teaser : '';
  const report = (result: { ok: true } | { ok: false; error: string }) => onError?.(result.ok ? null : errorText(result.error));
  const grade = (playerId: string, value: Grade) => void send('host:override', { playerId, grade: value }).then(report);
  return (
    <>
      <section className="panel auction-host">
        <h2>{t('betsQuestionOf', { index: auction.index + 1, total: auction.total })}</h2>
        <p className="meta auction-price">{t('auctionPrice', { price: num(auction.price) })}</p>
        <p className="auction-host-text" dir="auto">
          {seen !== '' && <mark className="bets-cut-seen">{seen}</mark>}
          {text.slice(seen.length)}
        </p>
        {wager && <p className="meta">{`${t('betsHostCut')}: ${auction.teaser === '' ? auction.theme : auction.teaser}`}</p>}
        {wager ? <TopBid auction={auction} /> : <AuctionStrip auction={auction} />}
        <AuctionClock auction={auction} offsetMs={offsetMs} />
        {wager && (
          <ul className="rows wager-list auction-limits">
            {auction.limits.map((entry) => {
              const leading = auction.leader?.playerId === entry.playerId;
              return (
                <li key={entry.playerId} className={leading ? 'is-leader' : undefined}>
                  <span className="name" dir="auto">{entry.nickname}</span>
                  {leading && <span className="given" dir="ltr">{num(auction.bid)}</span>}
                  <span className="meta">
                    {t('auctionHostLimit', { limit: num(entry.limit) })}
                    {!entry.canBid && !leading && ` · ${t('auctionHostCannot')}`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {wager && sellButton && (
          <button type="button" className="btn btn-primary" onClick={() => void send('host:next', undefined).then(report)}>
            {t('auctionSold')}
          </button>
        )}
      </section>
      {auction.pending.length > 0 && (
        <section className="panel">
          <h2>{t('pendingTitle')}</h2>
          <ul className="rows">
            {auction.pending.map((entry) => (
              <li key={entry.playerId}>
                <span className="name" dir="auto">{entry.nickname}</span>
                <span className="given">{answerText(entry.answer, auction.question, presented)}</span>
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
