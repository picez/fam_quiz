import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { BlitzPlayer, DuelBets, DuelInfo, HostView, Phase, PlayerDuel, PlayerView, StageView } from '@quiz/shared';
import { num, questionClass } from '../format';
import { countText, errorText, t, type TextKey } from '../i18n';
import { useSplash } from '../live/Splash';
import { Timer, timerStatus } from '../live/Timer';
import type { Send } from '../live/types';
import { reducedMotion } from '../motion';
import { DuelBet, DuelBetResult, winnerSide } from './DuelBet';
import { LiveAnswers } from './LiveAnswers';
import { memberName } from './TeamBar';

/** «Оля 1 : 0 Петро». */
export function duelScoreText(duel: DuelInfo): string {
  return t('duelScore', {
    challenger: duel.challenger.nickname,
    a: duel.wins.challenger,
    b: duel.wins.opponent,
    opponent: duel.opponent.nickname,
  });
}

/** Кнопка в шапці; null без rights. Відкриває діалог вибору суперника. */
export function DuelButton({
  duel,
  paused = false,
  send,
  onError,
}: {
  duel: PlayerDuel | null;
  /** Пауза або заставка: кнопка вимкнена (крізь шар заставки не натиснути наосліп); на паузі — інша підказка. */
  paused?: boolean;
  send: Send;
  onError: (text: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const rights = duel?.rights ?? null;
  const canDeclare = rights?.canDeclare === true;

  // Право зникло (хтось уже оголосив, пауза, вікно закрилося) — діалог закривається сам.
  // Діалог (z 80) стоїть над заставкою (65), тож заставка його не закриває: вибір у ньому видно.
  useEffect(() => {
    if (!canDeclare) setOpen(false);
  }, [canDeclare]);

  // Фокус — на перший варіант; після закриття повертається на кнопку.
  useEffect(() => {
    if (!open) return;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const back = trigger.current;
    // Escape закриває діалог, навіть коли фокус уже не в ньому.
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
    };
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('keydown', onEscape);
      back?.focus();
    };
  }, [open]);

  if (rights === null) return null;

  const close = () => setOpen(false);

  const declare = async (opponentId: string) => {
    setSending(true);
    const result = await send('player:duel', { opponentId });
    setSending(false);
    setOpen(false);
    onError(result.ok ? null : errorText(result.error));
  };

  // Tab ходить по колу всередині діалогу.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || dialog.current === null) return;
    const buttons = [...dialog.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    if (buttons.length === 0) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="duel-button"
        disabled={!canDeclare || paused}
        title={canDeclare ? undefined : t(paused ? 'paused' : 'duelBusy')}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {t('duelButton')}
      </button>
      {open && (
        <div className="duel-backdrop" onClick={(event) => event.target === event.currentTarget && close()}>
          <div ref={dialog} className="duel-dialog" role="dialog" aria-modal="true" aria-labelledby="duel-pick-title" onKeyDown={onKeyDown}>
            <h2 id="duel-pick-title">{t('duelPickTitle')}</h2>
            <p className="meta">{t('duelPickHint')}</p>
            <ul className="duel-opponents">
              {rights.opponents.map((opponent) => (
                <li key={opponent.playerId}>
                  <button type="button" className="btn" disabled={sending} onClick={() => void declare(opponent.playerId)}>
                    {opponent.nickname}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-quiet" onClick={close}>
              {t('cancel')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** Коли почнеться оголошена дуель: після відкритого запитання, після наступного (з поля) або щойно ведучий продовжить. */
function duelStartText(phase: Phase, autopilot: boolean): TextKey {
  if (phase === 'question' || phase === 'locked') return 'duelStartsAfterQuestion';
  if (phase === 'board') return 'duelStartsAfterNext';
  return autopilot ? 'duelStartsSoon' : 'duelStartsOnContinue';
}

/** Закріплена смуга оголошеної дуелі (stage 'declared'); position: fixed — нічого не зсуває. */
export function DuelBanner({ duel, phase, autopilot = false }: { duel: DuelInfo | null; phase: Phase; autopilot?: boolean }) {
  if (duel === null || duel.stage !== 'declared') return null;
  const bets = duel.bets?.open === true ? duel.bets : null;
  const base = reducedMotion() ? 'duel-banner' : 'duel-banner is-pulsing';
  return (
    <div className={bets !== null ? `${base} has-bets` : base} role="status" aria-live="polite">
      {t('duelBanner', { challenger: duel.challenger.nickname, opponent: duel.opponent.nickname, start: t(duelStartText(phase, autopilot)) })}
      {bets !== null && (
        <span className="duel-banner-bets">
          {t('duelBetsBanner', { challenger: duel.challenger.nickname, a: bets.challenger.length, opponent: duel.opponent.nickname, b: bets.opponent.length })}
        </span>
      )}
    </div>
  );
}

/** Поле відповіді дуелянта: після прийнятої спроби очищується й лишається у фокусі. */
function DuelAnswer({ enabled, send, onError }: { enabled: boolean; send: Send; onError: (text: string | null) => void }) {
  const [text, setText] = useState('');
  const sending = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const answer = text.trim();
    if (sending.current || answer === '') return;
    sending.current = true;
    const result = await send('player:duel-answer', { text: answer });
    sending.current = false;
    if (result.ok) {
      setText('');
      input.current?.focus();
    }
    onError(result.ok ? null : errorText(result.error));
  };

  return (
    <form className="duel-answer" onSubmit={(event) => void submit(event)}>
      <label className="field">
        <span>{t('duelAnswerLabel')}</span>
        <input
          ref={input}
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={!enabled}
          maxLength={200}
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="send"
        />
      </label>
      <button type="submit" className="btn btn-primary" disabled={!enabled}>
        {t('duelSend')}
      </button>
    </form>
  );
}

/** Екран етапу duel на телефоні: дуелянт відповідає, решта дивиться. */
export function DuelPlay({
  view,
  offsetMs,
  send,
  onError,
}: {
  view: PlayerView;
  offsetMs: number;
  send: Send;
  onError: (text: string | null) => void;
}) {
  // Поки вибір категорії летить, другий дотик не надсилає вдруге: ref — від подвійного дотику, стан — вимикає кнопки.
  const picking = useRef(false);
  const [pickPending, setPickPending] = useState(false);
  // Шар заставки «Дуель!» пропускає дотики: категорії й поле вимкнені, доки вона йде (ведучий може вибрати за претендента).
  const splashNow = useSplash(view.splash, view.paused, offsetMs);
  const duel = view.duel;
  if (duel === null) return <></>;
  const mine = view.me.duel;
  const duelist = view.me.id === duel.challenger.playerId || view.me.id === duel.opponent.playerId;
  // Команда: категорію вибирає капітан, відповідає вибраний дуелянт; решті команди — рядок, хто відповідає.
  const team = view.team;
  const mayAct = team === null || team.canAct;

  const pick = async (categoryId: string) => {
    if (picking.current) return;
    picking.current = true;
    setPickPending(true);
    const result = await send('player:duel-category', { categoryId });
    picking.current = false;
    setPickPending(false);
    onError(result.ok ? null : errorText(result.error));
  };

  const loser = duel.winner === null ? null : duel.winner.playerId === duel.challenger.playerId ? duel.opponent : duel.challenger;

  return (
    <section className="duel">
      <h2 className="duel-title">{t('duelTitle')}</h2>
      <p className="duel-score">{duelScoreText(duel)}</p>

      {duel.stage === 'category' &&
        (mine?.canPick === true && mayAct ? (
          <>
            <p className="lead">{t('duelChooseCategory')}</p>
            <ul className="duel-categories">
              {duel.categories.map((category) => (
                <li key={category.id}>
                  <button type="button" className="btn" disabled={pickPending || category.left === 0 || splashNow !== null} onClick={() => void pick(category.id)}>
                    {t('duelCategoryLeft', { title: category.title, left: category.left })}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="lead">{t('duelChoosing', { name: duel.challenger.nickname })}</p>
        ))}

      {duel.stage === 'category' && mine !== null && mine.bet !== null && (
        <DuelBet duel={duel} bet={mine.bet} paused={view.paused} send={send} onError={onError} />
      )}

      {(duel.stage === 'question' || duel.stage === 'answer') && (
        <>
          <div className="question-head">
            <p className="meta">{t('duelQuestionOf', { index: duel.number, total: duel.total, category: duel.category ?? '' })}</p>
            {duel.stage === 'question' && <Timer view={view} offsetMs={offsetMs} total={view.limitMs} status={timerStatus(view)} />}
          </div>
          {duel.question !== null && <h1 className={questionClass(duel.question)} dir="auto">{duel.question}</h1>}
        </>
      )}

      {duel.stage === 'question' && (
        <>
          {duelist && !mayAct && (
            <p className="lead team-duelist-answers">{t('teamDuelistAnswers', { name: memberName(view, team?.duelistId ?? null) })}</p>
          )}
          {duelist && mayAct && (
            <>
              <DuelAnswer key={duel.number} enabled={mine?.canAnswer === true && splashNow === null} send={send} onError={onError} />
              {/* Фіксована висота з прокруткою: нова спроба не зсуває екран. */}
              <ul className="duel-tries" aria-live="polite">
                {(mine?.tries ?? []).map((text, index) => (
                  <li key={index}>{t('duelWrongTry', { text })}</li>
                ))}
              </ul>
            </>
          )}
          <p className="meta">
            {t('duelTries', {
              challenger: duel.challenger.nickname,
              a: duel.tries.challenger,
              opponent: duel.opponent.nickname,
              b: duel.tries.opponent,
            })}
          </p>
        </>
      )}

      {duel.stage === 'answer' && (
        <section className={`result ${duel.questionWinner !== null ? 'is-correct' : 'is-wrong'}`}>
          {duel.accepted !== null && duel.accepted.length > 0 && <p>{t('duelCorrect', { answer: duel.accepted[0] })}</p>}
          <h2>
            {duel.questionWinner !== null
              ? t('duelQuestionWon', { name: duel.questionWinner.nickname, answer: duel.winningAnswer ?? '' })
              : t('duelNobody')}
          </h2>
        </section>
      )}

      {duel.stage === 'result' && (
        <section className="result duel-result">
          {duel.winner === null || loser === null ? (
            <h2>{t('duelTie')}</h2>
          ) : (
            <>
              <h2>{t('duelWinner', { name: duel.winner.nickname })}</h2>
              <p className="wager-delta">
                {duel.stake > 0
                  ? t('duelTransfer', { winner: duel.winner.nickname, loser: loser.nickname, stake: num(duel.stake) })
                  : t('duelNoStake')}
              </p>
            </>
          )}
          <DuelBetResult duel={duel} bet={mine?.bet ?? null} />
        </section>
      )}
    </section>
  );
}

/** Найдовший шматок імені, що не переноситься: слово між пробілами або до дефіса разом із дефісом. */
function longestPiece(nickname: string): number {
  return Math.max(1, ...(nickname.match(/[^\s-]+-?|-/g) ?? []).map((piece) => piece.length));
}

/** Клас імені збоку сцени: шрифт менший за найдовшим шматком, щоб він влізв у стовпець цілим. */
export function sideClass(side: 'is-challenger' | 'is-opponent', nickname: string): string {
  const piece = longestPiece(nickname);
  const size = piece > 11 ? ' is-longer' : piece > 6 ? ' is-long' : '';
  return `duel-stage-side ${side}${size}`;
}

/** Понад стільки ставців на одного дуелянта — щільний список (дрібніше, у дві колонки): 22 ставці вміщаються на 1280×720. */
export const MANY_BETS = 8;

/** Хто поставив на одного дуелянта: «Поставили n» і (поки ставки відкриті) імена. */
function StageBets({ players, names }: { players: BlitzPlayer[]; names: boolean }) {
  return (
    <div className={players.length > MANY_BETS ? 'duel-stage-bets is-many' : 'duel-stage-bets'}>
      <p className="duel-stage-bets-count">{countText('duelBetsCount', players.length, { count: players.length })}</p>
      {names && players.length > 0 && (
        <ul>
          {players.map((player) => (
            <li key={player.playerId} dir="auto">
              {player.nickname}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const nicknames = (players: BlitzPlayer[]) => players.map((player) => player.nickname).join(', ');

/** Підсумок ставок: хто вгадав і хто ні; нічия — без змін; ніхто не ставив — так і сказано. */
export function DuelBetsOutcome({ duel, bets, className }: { duel: DuelInfo; bets: DuelBets; className: string }) {
  if (bets.challenger.length === 0 && bets.opponent.length === 0) return <p className={className}>{t('duelBetsNobody')}</p>;
  const won = winnerSide(duel);
  if (won === null) return <p className={className}>{t('duelBetsTie')}</p>;
  const winners = bets[won];
  const losers = bets[won === 'challenger' ? 'opponent' : 'challenger'];
  const stake = num(bets.stake);
  return (
    <>
      {winners.length > 0 && <p className={`${className} is-won`}>{t('duelBetsWinners', { names: nicknames(winners), stake })}</p>}
      {losers.length > 0 && <p className={`${className} is-lost`}>{t('duelBetsLosers', { names: nicknames(losers), stake })}</p>}
    </>
  );
}

/** Дуель на великому екрані: імена один проти одного, рахунок, категорія, запитання, таймер, кількість спроб, розкриття, підсумок. */
export function DuelStage({ view, offsetMs }: { view: StageView; offsetMs: number }) {
  const duel = view.duel;
  if (duel === null) return <></>;
  const loser = duel.winner === null ? null : duel.winner.playerId === duel.challenger.playerId ? duel.opponent : duel.challenger;
  const picking = duel.stage === 'category';
  const playing = duel.stage === 'question' || duel.stage === 'answer';
  const bets = duel.bets;
  // Підсумок ставок: понад MANY_BETS імен разом — дрібніше, щоб два рядки з 22 іменами вмістилися на 1280×720.
  const outcomeClass = bets !== null && bets.challenger.length + bets.opponent.length > MANY_BETS ? 'lead duel-stage-bet-outcome is-many' : 'lead duel-stage-bet-outcome';
  return (
    <section className="duel-stage">
      <div className="duel-stage-flank">
        <p className={sideClass('is-challenger', duel.challenger.nickname)}>{duel.challenger.nickname}</p>
        {bets !== null && <StageBets players={bets.challenger} names={bets.open} />}
      </div>
      <div className="duel-stage-center">
        <p className="duel-stage-mark" aria-hidden="true">
          ⚔
        </p>
        <p className="duel-stage-score">{`${duel.wins.challenger} : ${duel.wins.opponent}`}</p>
        <p className="meta">{playing ? t('duelQuestionOf', { index: duel.number, total: duel.total, category: duel.category ?? '' }) : t('duelTitle')}</p>
        {/* Блок змісту має сталу висоту: між етапами нічого не стрибає. */}
        <div className="duel-stage-body">
          {picking && (
            <>
              <p className="lead">{t('duelChoosing', { name: duel.challenger.nickname })}</p>
              <ul className="duel-stage-categories">
                {duel.categories.map((category) => (
                  <li key={category.id} className={category.left === 0 ? 'is-empty' : undefined}>
                    {t('duelCategoryLeft', { title: category.title, left: category.left })}
                  </li>
                ))}
              </ul>
            </>
          )}
          {playing && duel.question !== null && <h1 className={`${questionClass(duel.question)} duel-stage-question`} dir="auto">{duel.question}</h1>}
          {duel.stage === 'question' && (
            <>
              <Timer view={view} offsetMs={offsetMs} total={view.limitMs} status={timerStatus(view)} />
              <p className="meta">
                {t('duelTries', {
                  challenger: duel.challenger.nickname,
                  a: duel.tries.challenger,
                  opponent: duel.opponent.nickname,
                  b: duel.tries.opponent,
                })}
              </p>
            </>
          )}
          {duel.stage === 'answer' && (
            <div className={`duel-stage-answer ${duel.questionWinner !== null ? 'is-correct' : 'is-wrong'}`}>
              {duel.accepted !== null && duel.accepted.length > 0 && <p className="lead">{t('duelCorrect', { answer: duel.accepted[0] })}</p>}
              <p className="lead">
                {duel.questionWinner !== null
                  ? t('duelQuestionWon', { name: duel.questionWinner.nickname, answer: duel.winningAnswer ?? '' })
                  : t('duelNobody')}
              </p>
            </div>
          )}
          {duel.stage === 'result' &&
            (duel.winner === null || loser === null ? (
              <h1 className="question">{t('duelTie')}</h1>
            ) : (
              <>
                <h1 className="question">{t('duelWinner', { name: duel.winner.nickname })}</h1>
                <p className="lead wager-delta">
                  {duel.stake > 0
                    ? t('duelTransfer', { winner: duel.winner.nickname, loser: loser.nickname, stake: num(duel.stake) })
                    : t('duelNoStake')}
                </p>
              </>
            ))}
          {duel.stage === 'result' && bets !== null && <DuelBetsOutcome duel={duel} bets={bets} className={outcomeClass} />}
        </div>
      </div>
      <div className="duel-stage-flank">
        <p className={sideClass('is-opponent', duel.opponent.nickname)}>{duel.opponent.nickname}</p>
        {bets !== null && <StageBets players={bets.opponent} names={bets.open} />}
      </div>
    </section>
  );
}

/** Панель дуелі в пульті: оголошена (скасувати), вибір категорії за гравця, відповіді й спроби, пропуск, скасування. */
export function HostDuelPanel({
  view,
  offsetMs,
  send,
  onError,
}: {
  view: HostView;
  offsetMs: number;
  send: Send;
  onError: (text: string | null) => void;
}) {
  const duel = view.duel;
  if (duel === null) return null;
  const act = async (event: 'host:duel-category' | 'host:duel-skip' | 'host:duel-cancel', payload?: { categoryId: string }) => {
    const result = await send(event, payload);
    onError(result.ok ? null : errorText(result.error));
  };
  const cancel = () => {
    if (window.confirm(t('duelCancelConfirm'))) void act('host:duel-cancel');
  };
  const tries = [
    { player: duel.challenger, texts: duel.tryTexts.challenger },
    { player: duel.opponent, texts: duel.tryTexts.opponent },
  ];
  return (
    <section className="panel duel-host">
      <h2>{t('duelTitle')}</h2>
      {duel.stage === 'declared' ? (
        <p>{t('duelDeclared', { challenger: duel.challenger.nickname, opponent: duel.opponent.nickname })}</p>
      ) : (
        <p className="duel-score">{duelScoreText(duel)}</p>
      )}
      {duel.stage === 'category' && (
        <>
          <p className="meta">{t('duelHostPick', { name: duel.challenger.nickname })}</p>
          <ul className="duel-categories">
            {duel.categories.map((category) => (
              <li key={category.id}>
                <button type="button" className="btn" disabled={category.left === 0} onClick={() => void act('host:duel-category', { categoryId: category.id })}>
                  {t('duelCategoryLeft', { title: category.title, left: category.left })}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {(duel.stage === 'question' || duel.stage === 'answer') && (
        <>
          <p className="meta">{t('duelQuestionOf', { index: duel.number, total: duel.total, category: duel.category ?? '' })}</p>
          {duel.question !== null && <p>{duel.question}</p>}
          {duel.stage === 'question' && <Timer view={view} offsetMs={offsetMs} total={view.limitMs} status={timerStatus(view)} />}
          {duel.accepted !== null && duel.accepted.length > 0 && <p className="meta">{t('duelAccepted', { list: duel.accepted.join(', ') })}</p>}
          {view.live?.kind === 'duel' ? (
            <LiveAnswers view={view} live={view.live} compact />
          ) : (
            tries.map(
              ({ player, texts }) =>
                texts.length > 0 && (
                  <p key={player.playerId} className="meta duel-host-tries">
                    {t('duelTryTexts', { name: player.nickname, list: texts.join(', ') })}
                  </p>
                ),
            )
          )}
        </>
      )}
      {duel.bets !== null && (
        <div className="duel-host-bets">
          {[
            { player: duel.challenger, on: duel.bets.challenger },
            { player: duel.opponent, on: duel.bets.opponent },
          ].map(({ player, on }) => (
            <p key={player.playerId} className="meta">
              {`${player.nickname}: ${countText('duelBetsCount', on.length, { count: on.length })}`}
              {on.length > 0 && ` (${nicknames(on)})`}
            </p>
          ))}
          {duel.stage === 'result' && <DuelBetsOutcome duel={duel} bets={duel.bets} className="duel-host-bet-outcome" />}
        </div>
      )}
      <div className="panel-actions">
        {duel.stage === 'question' && (
          <button type="button" className="btn" onClick={() => void act('host:duel-skip')}>
            {t('duelSkip')}
          </button>
        )}
        {duel.stage !== 'result' && (
          <button type="button" className="btn btn-danger" onClick={cancel}>
            {t('duelCancel')}
          </button>
        )}
      </div>
    </section>
  );
}
