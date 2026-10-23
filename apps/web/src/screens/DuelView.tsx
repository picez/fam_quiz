import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { DuelInfo, PlayerDuel, PlayerView } from '@quiz/shared';
import { num } from '../format';
import { errorText, t } from '../i18n';
import { Timer, timerStatus } from '../live/Timer';
import type { Send } from '../live/types';
import { reducedMotion } from '../motion';

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
  /** Кнопка вимкнена через паузу, а не через чужу дуель: інша підказка. */
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
  useEffect(() => {
    if (!canDeclare) setOpen(false);
  }, [canDeclare]);

  // Фокус — на перший варіант; після закриття повертається на кнопку.
  useEffect(() => {
    if (!open) return;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const back = trigger.current;
    return () => back?.focus();
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

  // Escape закриває; Tab ходить по колу всередині діалогу.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
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
        disabled={!canDeclare}
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

/** Закріплена смуга оголошеної дуелі (stage 'declared'); position: fixed — нічого не зсуває. */
export function DuelBanner({ duel }: { duel: DuelInfo | null }) {
  if (duel === null || duel.stage !== 'declared') return null;
  return (
    <div className={reducedMotion() ? 'duel-banner' : 'duel-banner is-pulsing'} role="status" aria-live="polite">
      {t('duelBanner', { challenger: duel.challenger.nickname, opponent: duel.opponent.nickname })}
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
  const duel = view.duel;
  if (duel === null) return <></>;
  const mine = view.me.duel;
  const duelist = view.me.id === duel.challenger.playerId || view.me.id === duel.opponent.playerId;

  const pick = async (categoryId: string) => {
    const result = await send('player:duel-category', { categoryId });
    onError(result.ok ? null : errorText(result.error));
  };

  const loser = duel.winner === null ? null : duel.winner.playerId === duel.challenger.playerId ? duel.opponent : duel.challenger;

  return (
    <section className="duel">
      <h2 className="duel-title">{t('duelTitle')}</h2>
      <p className="duel-score">{duelScoreText(duel)}</p>

      {duel.stage === 'category' &&
        (mine?.canPick === true ? (
          <>
            <p className="lead">{t('duelChooseCategory')}</p>
            <ul className="duel-categories">
              {duel.categories.map((category) => (
                <li key={category.id}>
                  <button type="button" className="btn" disabled={category.left === 0} onClick={() => void pick(category.id)}>
                    {t('duelCategoryLeft', { title: category.title, left: category.left })}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="lead">{t('duelChoosing', { name: duel.challenger.nickname })}</p>
        ))}

      {(duel.stage === 'question' || duel.stage === 'answer') && (
        <>
          <div className="question-head">
            <p className="meta">{t('duelQuestionOf', { index: duel.number, total: duel.total, category: duel.category ?? '' })}</p>
            {duel.stage === 'question' && <Timer view={view} offsetMs={offsetMs} total={view.limitMs} status={timerStatus(view)} />}
          </div>
          {duel.question !== null && <h1 className="question">{duel.question}</h1>}
        </>
      )}

      {duel.stage === 'question' && (
        <>
          {duelist && (
            <>
              <DuelAnswer key={duel.number} enabled={mine?.canAnswer === true} send={send} onError={onError} />
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
        </section>
      )}
    </section>
  );
}
