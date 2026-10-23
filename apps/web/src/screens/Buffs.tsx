import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { LIMITS } from '@quiz/shared';
import type { Answer, BuffBlock, BuffKind, BuffSlot, BuffTag, HintRequest, OvertimeRow, PlayerActiveBuff, PlayerBuffs, PublicQuestion, Question, VotePrompt, VoteTally } from '@quiz/shared';
import { BUFF_ICONS, buffName } from '../buff-meta';
import { choiceLabel, signed } from '../format';
import { errorText, hasText, t, type TextKey } from '../i18n';
import { useTimeOver } from '../live/Timer';
import type { Send } from '../live/types';
import { AnswerInput } from './AnswerInput';

/** Скільки чекає підтвердження після першого дотику, мс. */
export const BUFF_CONFIRM_MS = 3000;

/** Скільки стоїть «Голос прийнято», мс. */
export const VOTE_THANKS_MS = 1500;

/** Рядок пояснень активного бафу, коли загального «діє на цьому запитанні» замало. */
const MINE: Partial<Record<BuffKind, string>> = {
  time: t('overtimeMine'),
  swap: t('swapMine'),
  audience: t('audienceMine'),
  hint: t('hintMine'),
};

/** Причина неактивної кнопки словами. */
function whyText(block: BuffBlock, kind: BuffKind): string {
  const specific = `buffWhy_${block}_${kind}`;
  return hasText(specific) ? t(specific) : t(`buffWhy_${block}` as TextKey, { name: buffName(kind) });
}

/**
 * Кнопка «?» і аркуш: що робить кожен дозволений баф і де діє. Нічого не надсилає — працює й на паузі.
 * Кнопка стоїть поза .buff-row: кнопок бафів лишається рівно стільки, скільки дозволено.
 */
export function BuffHelp({ kinds }: { kinds: BuffKind[] }) {
  const [open, setOpen] = useState(false);
  const openerRef = useRef<HTMLSpanElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      closeRef.current?.focus();
      wasOpen.current = true;
    } else if (wasOpen.current) {
      wasOpen.current = false;
      openerRef.current?.focus();
    }
  }, [open]);
  // Escape закриває; Tab і Shift+Tab ходять колом по кнопках аркуша.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (event.key !== 'Tab') return;
    const items = [...(sheetRef.current?.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])') ?? [])];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const here = document.activeElement;
    if (event.shiftKey && (here === first || !sheetRef.current?.contains(here))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (here === last || !sheetRef.current?.contains(here))) {
      event.preventDefault();
      first.focus();
    }
  };
  const openIt = () => setOpen(true);
  return (
    <>
      {/* Не <button>: під «Льодом» fieldset.debuff-content вимкнений, а довідка має працювати й тоді. */}
      <span
        ref={openerRef}
        role="button"
        tabIndex={0}
        className="buff-help"
        aria-label={t('buffHelpOpen')}
        aria-haspopup="dialog"
        onClick={openIt}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openIt();
          }
        }}
      >
        <span aria-hidden="true">?</span>
      </span>
      {open &&
        createPortal(
          <>
            <div className="buff-help-backdrop" onClick={() => setOpen(false)} />
            <div ref={sheetRef} className="buff-help-sheet" role="dialog" aria-modal="true" aria-labelledby="buff-help-title" onKeyDown={onKeyDown}>
              <h2 id="buff-help-title">{t('buffHelpTitle')}</h2>
              <p className="buff-help-rule">{t('buffHelpRule')}</p>
              <ul>
                {kinds.map((kind) => (
                  <li key={kind}>
                    <strong>
                      <span aria-hidden="true">{BUFF_ICONS[kind]}</span> {buffName(kind)}
                    </strong>
                    <span>{t(`buffGuide_${kind}` as TextKey)}</span>
                    <span className="buff-where">{t(`buffWhere_${kind}` as TextKey)}</span>
                  </li>
                ))}
              </ul>
              <p className="buff-help-none">{t('buffHelpNone')}</p>
              <button ref={closeRef} type="button" className="btn" onClick={() => setOpen(false)}>
                {t('buffHelpClose')}
              </button>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

/**
 * Причина, яку телефон показує сам: зріз не знає now, тож сплив власний час рахує телефон.
 * time ніколи не замінює used, taken, answered, paused; пауза на телефоні гасить і готові кнопки.
 */
function shownBlock(slot: BuffSlot, paused: boolean, timeOver: boolean, notStarted = false): BuffBlock | null {
  if (slot.state === 'active') return null;
  const block = slot.block;
  // Заставка запитання ще йде: сервер відмовив би not_started, тож готова кнопка пояснює це сама.
  if (notStarted && slot.state === 'ready') return 'not_started';
  if (timeOver && (slot.state === 'ready' || (block !== null && block.startsWith('unfit_')))) return 'time';
  if (slot.state === 'ready') return paused ? 'paused' : null;
  return block;
}

/**
 * Ряд кнопок-значків і рядок пояснень фіксованої висоти; перший дотик готової кнопки просить підтвердження,
 * другий (до 3 с) шле player:buff. Неактивні кнопки — aria-disabled, а не disabled: дотик пояснює причину.
 * Кнопок завжди стільки, скільки дозволених бафів, і рядок пояснень завжди на місці — ряд не змінює розміру.
 */
export function BuffRow({
  buffs,
  paused,
  timeOver = false,
  notStarted = false,
  send,
  onError,
}: {
  buffs: PlayerBuffs;
  paused: boolean;
  /** Власний час гравця сплив (особистий кінець або спільний). */
  timeOver?: boolean;
  /** Ще йде заставка запитання чи клітинки: запитання на сервері ще не почалося. */
  notStarted?: boolean;
  send: Send;
  onError: (message: string | null) => void;
}) {
  // Тимчасовий рядок: підтвердження або причина; null — рядок показує стан активного бафу.
  const [note, setNote] = useState<{ text: string; confirm: BuffKind | null } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const say = (text: string, confirm: BuffKind | null) => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    setNote({ text, confirm });
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setNote(null);
    }, BUFF_CONFIRM_MS);
  };
  const clear = () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    setNote(null);
  };

  const tap = (slot: BuffSlot) => {
    if (slot.state === 'active') {
      clear();
      return;
    }
    const block = shownBlock(slot, paused, timeOver, notStarted);
    if (block !== null) {
      say(whyText(block, slot.kind), null);
      return;
    }
    if (note?.confirm !== slot.kind) {
      say(t('buffConfirm', { name: buffName(slot.kind) }), slot.kind);
      return;
    }
    clear();
    if (sendingRef.current) return;
    sendingRef.current = true;
    void send('player:buff', { kind: slot.kind })
      .then((result) => {
        if (mountedRef.current) onError(result.ok ? null : errorText(result.error));
      })
      .finally(() => {
        sendingRef.current = false;
      });
  };

  // Бліц і бліц-клітинка: замість ряду кнопок один компактний рядок — щільний бліц-екран не зсувається.
  const kinds = buffs.slots.map((slot) => slot.kind);
  const blitzOff = buffs.slots.find((slot) => slot.block === 'off_blitz' || slot.block === 'off_blitz_cell');
  if (blitzOff !== undefined && blitzOff.block !== null) {
    return (
      <div className="buff-bar is-off">
        <div className="buff-line">
          <BuffHelp kinds={kinds} />
          <p className="buff-off">{whyText(blitzOff.block, blitzOff.kind)}</p>
        </div>
      </div>
    );
  }

  const active = buffs.active;
  // Рядок пояснень тримає й «Неправильно, ще одна спроба»: підказка не зсуває варіантів.
  const idle =
    active === null
      ? ''
      : active.retry === 'again'
        ? t('retryAgain')
        : (MINE[active.kind] ?? t('buffTaken', { icon: BUFF_ICONS[active.kind], name: buffName(active.kind) }));

  return (
    <div className="buff-bar">
      <div className="buff-row" role="group" aria-label={t('buffRowLabel')}>
        {buffs.slots.map((slot) => {
          const block = shownBlock(slot, paused, timeOver, notStarted);
          const classes = ['buff-btn'];
          if (slot.state === 'active') classes.push('is-active');
          if (slot.state === 'used') classes.push('is-used');
          if (note?.confirm === slot.kind) classes.push('is-confirm');
          return (
            <button
              type="button"
              key={slot.kind}
              className={classes.join(' ')}
              aria-label={buffName(slot.kind)}
              aria-disabled={slot.state === 'active' || block !== null}
              aria-pressed={slot.state === 'active'}
              title={buffName(slot.kind)}
              onClick={() => tap(slot)}
            >
              <span aria-hidden="true">{BUFF_ICONS[slot.kind]}</span>
            </button>
          );
        })}
      </div>
      <div className="buff-line">
        <BuffHelp kinds={kinds} />
        <p className="buff-why" aria-live="polite">
          {note?.text ?? idle}
        </p>
      </div>
    </div>
  );
}

/** Друга спроба: «Неправильно, ще одна спроба» (again) або вибір «Залишити» / «Ще спроба» (choice); на паузі вибір вимкнено. */
export function RetryPrompt({
  active,
  send,
  onError,
  paused = false,
}: {
  active: PlayerActiveBuff;
  /** Запитання, на яке друга спроба (для майбутніх підказок; поки не показується). */
  question: PublicQuestion;
  send: Send;
  onError: (message: string | null) => void;
  /** Гра на паузі: сервер однаково відмовив би, тож кнопки чекають. */
  paused?: boolean;
}) {
  const [sending, setSending] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  if (active.retry === 'again') return <p className="lead buff-retry">{t('retryAgain')}</p>;
  if (active.retry !== 'choice') return null;
  const choose = (keep: boolean) => {
    if (sending || paused) return;
    setSending(true);
    void send('player:retry', { keep })
      .then((result) => {
        if (mountedRef.current) onError(result.ok ? null : errorText(result.error));
      })
      .finally(() => {
        if (mountedRef.current) setSending(false);
      });
  };
  return (
    <section className="buff-retry">
      <p className="lead">{t('retryChoice', { points: signed(active.first?.points ?? 0) })}</p>
      <div className="buff-retry-actions">
        <button type="button" className="btn btn-primary" disabled={sending || paused} onClick={() => choose(true)}>
          {t('retryKeep')}
        </button>
        <button type="button" className="btn" disabled={sending || paused} onClick={() => choose(false)}>
          {t('retryMore')}
        </button>
      </div>
    </section>
  );
}

/** 24 000 мс → «0:24», 65 000 → «1:05»; секунди вгору, як на табло. */
function clockText(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Залишок до кінця голосування за годинником сервера; на паузі — сталий залишок. Оновлюється, поки йде. */
function useLeftMs(clock: { endsAt: number | null; remainingMs: number | null }, offsetMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  const running = clock.remainingMs === null && clock.endsAt !== null;
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running, clock.endsAt]);
  if (clock.remainingMs !== null) return clock.remainingMs;
  if (clock.endsAt === null) return 0;
  return Math.max(0, clock.endsAt - (now + offsetMs));
}

/** Рядки варіантів для відсотків: single/multi — варіанти запитання, boolean — «Так»/«Ні». */
function voteOptions(question: PublicQuestion): { id: string; text: string }[] {
  if (question.type === 'boolean') {
    return [
      { id: 'true', text: t('yes') },
      { id: 'false', text: t('no') },
    ];
  }
  return question.choices.map((choice, index) => ({ id: choice.id, text: choiceLabel(choice, index) }));
}

/** Результати голосування: відсотки за варіантами або здогадки; правильної відповіді тут немає. */
function VoteResults({ votes, question, offsetMs }: { votes: VoteTally; question: PublicQuestion; offsetMs: number }) {
  const left = useLeftMs(votes, offsetMs);
  const over = votes.closed || left <= 0;
  const typed = question.type === 'text' || question.type === 'numeric';
  return (
    <>
      <p className="vote-head">
        <span>{votes.cast === 0 ? t('votesWaiting') : ''}</span>
        <span className="vote-time">{over ? t('votesClosed') : t('votesLeft', { time: clockText(left) })}</span>
      </p>
      {votes.cast > 0 &&
        (typed ? (
          <p className="vote-guesses">
            {t('votesGuesses', { list: votes.guesses.map((guess) => `${guess.text} ×${guess.count}`).join(', ') })}
          </p>
        ) : (
          <ul className="vote-rows">
            {voteOptions(question).map((option) => {
              const pct = Math.round(((votes.counts[option.id] ?? 0) / votes.cast) * 100);
              return (
                <li key={option.id} className="vote-row">
                  <span className="vote-bar" style={{ width: `${pct}%` }} aria-hidden="true" />
                  <span className="vote-text" title={option.text}>{option.text}</span> <span className="vote-pct">{`${pct} %`}</span>
                </li>
              );
            })}
          </ul>
        ))}
    </>
  );
}

/**
 * Блок сталої висоти під рядом бафів для власного hint або audience: «Ведучий думає…» → текст,
 * «Чекаємо голосів…» → відсотки чи здогадки. З'являється лише з власним бафом; усе нове — всередині блоку.
 */
export function BuffPanel({ active, question, offsetMs }: { active: PlayerActiveBuff; question: PublicQuestion; offsetMs: number }) {
  if (active.kind !== 'hint' && active.kind !== 'audience') return null;
  const hint = active.hint;
  return (
    <section className="buff-panel" aria-live="polite">
      {active.kind === 'hint'
        ? hint !== null && (
            <p className="hint-text">
              {hint.state === 'waiting' ? t('hintWaiting') : hint.state === 'aloud' ? t('hintAloud') : `${BUFF_ICONS.hint} ${hint.text ?? ''}`}
            </p>
          )
        : active.votes !== null && <VoteResults votes={active.votes} question={question} offsetMs={offsetMs} />}
    </section>
  );
}

/**
 * Нижній аркуш position: fixed — «Оля питає зал: як думаєте?», відлік, варіанти або поле, «Голосувати», «Пропустити».
 * Під ним нічого не зсувається. «Пропустити» ховає аркуш до запрошення від іншого гравця;
 * PlayerScreen дає ключ запитання, тож на новому запитанні стан чистий.
 */
export function VoteSheet({
  prompt,
  question,
  paused,
  offsetMs,
  send,
  onError,
}: {
  prompt: VotePrompt | null;
  question: PublicQuestion;
  paused: boolean;
  offsetMs: number;
  send: Send;
  onError: (message: string | null) => void;
}) {
  // Гравці, чиє запрошення тут уже закрито: пропущено або проголосовано.
  const [done, setDone] = useState<string[]>([]);
  const [thanks, setThanks] = useState(false);
  const [sending, setSending] = useState(false);
  // Згорнутий аркуш — лише рядок запрошення; нове запрошення (інший гравець) знову розгорнуте.
  const [collapsed, setCollapsed] = useState(false);
  const askerId = prompt?.asker.playerId ?? null;
  const [collapsedFor, setCollapsedFor] = useState(askerId);
  if (collapsedFor !== askerId) {
    setCollapsedFor(askerId);
    setCollapsed(false);
  }
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);
  const timeOver = useTimeOver(prompt?.endsAt ?? null, prompt?.remainingMs ?? null, offsetMs);
  const left = useLeftMs(prompt ?? { endsAt: null, remainingMs: null }, offsetMs);

  const open = prompt !== null && !timeOver && !done.includes(prompt.asker.playerId);
  const ask = prompt === null ? '' : t('voteAsk', { name: prompt.asker.nickname });
  // Живий регіон стоїть постійно (поки є запитання): поява аркуша й «Голос прийнято» читаються вголос,
  // хоча самі аркуші монтуються й зникають.
  const live = (
    <p className="sr-only vote-live" aria-live="polite" aria-atomic="true">
      {thanks ? t('voteThanks') : open ? ask : ''}
    </p>
  );

  if (thanks) {
    return (
      <>
        {live}
        <section className="vote-sheet">
          <p className="lead vote-thanks" aria-hidden="true">
            {t('voteThanks')}
          </p>
        </section>
      </>
    );
  }
  if (!open || prompt === null) return live;
  const asker = prompt.asker.playerId;

  const vote = (answer: Answer) => {
    if (sending || paused) return;
    setSending(true);
    void send('player:vote', { askerId: asker, answer })
      .then((result) => {
        if (!mountedRef.current) return;
        // Голос прийнято чи ні — запрошення цього гравця закрито: повторний голос сервер однаково не прийме.
        setDone((now) => [...now, asker]);
        if (!result.ok) {
          onError(errorText(result.error));
          return;
        }
        onError(null);
        setThanks(true);
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          setThanks(false);
        }, VOTE_THANKS_MS);
      })
      .finally(() => {
        if (mountedRef.current) setSending(false);
      });
  };

  return (
    <>
      {live}
      <section className={collapsed ? 'vote-sheet is-collapsed' : 'vote-sheet'} aria-label={ask}>
        <p className="vote-sheet-head">
          <strong>{ask}</strong>
          <span className="vote-time">{t('votesLeft', { time: clockText(left) })}</span>
          <button type="button" className="btn btn-small vote-toggle" aria-expanded={!collapsed} onClick={() => setCollapsed((now) => !now)}>
            {t(collapsed ? 'voteExpand' : 'voteCollapse')}
          </button>
        </p>
        {!collapsed && (
          <>
            <fieldset className="inputs" disabled={paused || sending}>
              <AnswerInput key={asker} question={question} onSubmit={vote} submitLabel={t('voteSend')} autoFocus={false} />
            </fieldset>
            <button type="button" className="btn vote-skip" onClick={() => setDone((now) => [...now, asker])}>
              {t('voteSkip')}
            </button>
          </>
        )}
      </section>
    </>
  );
}

/**
 * «Чекаємо: Оля · 0:24» — для сцени, пульта й телефонів, коли спільний час сплив.
 * Кілька гравців — в одному рядку («…, Петро · 0:12») з трикрапкою: рядок не росте вниз.
 * Трикрапка з'їдає імена, а не відлік: останній « · 0:12» — окремий шматок, що не стискається.
 */
export function OvertimeLine({ rows, offsetMs }: { rows: OvertimeRow[]; offsetMs: number }) {
  const [now, setNow] = useState(() => Date.now());
  const running = rows.some((row) => row.deadline !== null);
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);
  if (rows.length === 0) return null;
  const timeOf = (row: OvertimeRow) => clockText(row.remainingMs ?? (row.deadline === null ? 0 : row.deadline - (now + offsetMs)));
  const [first, ...rest] = rows;
  const text =
    t('overtimeWait', { name: first.nickname, time: timeOf(first) }) +
    rest.map((row) => `, ${t('overtimeWaitMore', { name: row.nickname, time: timeOf(row) })}`).join('');
  // Обидва шаблони закінчуються на « · {time}»: відрізаємо відлік останнього гравця.
  const time = ` · ${timeOf(rows[rows.length - 1])}`;
  return (
    <p className="buff-wait" title={text} aria-label={text}>
      <span className="buff-wait-names">{text.slice(0, text.length - time.length)}</span>
      <span className="buff-wait-time">{time}</span>
    </p>
  );
}

/**
 * «Чекаємо …» для сцени й пульта: рядки overtime є в зрізі, щойно баф узято,
 * а показуються лише після спільного кінця (за годинником сервера).
 */
export function SharedOvertime({ view, offsetMs }: { view: { endsAt: number | null; remainingMs: number | null; overtime: OvertimeRow[] }; offsetMs: number }) {
  const over = useTimeOver(view.endsAt, view.remainingMs, offsetMs);
  if (!over) return null;
  return <OvertimeLine rows={view.overtime} offsetMs={offsetMs} />;
}

/**
 * Значки сцени: «½ Оля» біля кожного гравця, що взяв баф на це запитання; що баф зробив, сцена не знає.
 * Заміна в класиці — лише «⇄ Оля відповідає на запасне» (запасного в зрізі сцени немає);
 * на полі запасне вже на сцені як запитання клітинки — «⇄ Оля: запасне запитання».
 */
export function StageBuffs({ buffs, board = false }: { buffs: BuffTag[]; board?: boolean }) {
  if (buffs.length === 0) return null;
  const text = (tag: BuffTag) =>
    tag.kind === 'swap'
      ? `${BUFF_ICONS.swap} ${t(board ? 'stageSpareBoard' : 'stageSpare', { name: tag.nickname })}`
      : `${BUFF_ICONS[tag.kind]} ${tag.nickname}`;
  return (
    <ul className="stage-buffs" aria-label={t('stageBuffsLabel')}>
      {buffs.map((tag) => (
        <li key={tag.playerId} className={tag.kind === 'swap' ? 'is-swap' : undefined} title={buffName(tag.kind)}>
          {text(tag)}
        </li>
      ))}
    </ul>
  );
}

/** Позначка відповіді на запасне (пульт, історія): «запасне» з текстом запасного в title. */
export function SpareMark({ spare }: { spare: Question }) {
  return (
    <span className="spare-tag" title={spare.text}>
      {t('spareMark')}
    </span>
  );
}

/** Картка одного запиту: поле для тексту, «Надіслати» (неактивна з порожнім полем) і «Підказав уголос». */
function HintCard({ request, send, onError }: { request: HintRequest; send: Send; onError: (message: string | null) => void }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const give = (hint: string | null) => {
    if (sending) return;
    setSending(true);
    void send('host:hint', { playerId: request.playerId, text: hint })
      .then((result) => {
        if (mountedRef.current) onError(result.ok ? null : errorText(result.error));
      })
      .finally(() => {
        if (mountedRef.current) setSending(false);
      });
  };
  const trimmed = text.trim();
  return (
    <article className="hint-request">
      <h3>{t('hintRequest', { name: request.nickname })}</h3>
      <label className="field">
        <span>{t('hintField')}</span>
        <textarea value={text} maxLength={LIMITS.hintText} rows={2} onChange={(event) => setText(event.target.value)} />
      </label>
      <div className="actions">
        <button type="button" className="btn btn-primary" disabled={trimmed === '' || sending} onClick={() => give(trimmed)}>
          {t('hintSend')}
        </button>
        <button type="button" className="btn" disabled={sending} onClick={() => give(null)}>
          {t('hintAloudBtn')}
        </button>
      </div>
    </article>
  );
}

/** Запити підказки на пульті: «Оля просить підказку», поле, «Надіслати», «Підказав уголос». Гра на них не чекає. */
export function HintRequests({ hints, send, onError }: { hints: HintRequest[]; send: Send; onError: (message: string | null) => void }) {
  if (hints.length === 0) return null;
  return (
    <div className="hint-requests">
      {hints.map((request) => (
        <HintCard key={request.playerId} request={request} send={send} onError={onError} />
      ))}
    </div>
  );
}

/** Значок бафу біля відповіді (пульт, історія): «🛡» з назвою в підказці. */
export function BuffBadge({ kind }: { kind: BuffKind }) {
  const name = buffName(kind);
  return (
    <span className="buff-tag" title={name} aria-label={t('buffTagLabel', { name })}>
      {BUFF_ICONS[kind]}
    </span>
  );
}
