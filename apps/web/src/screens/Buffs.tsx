import { useEffect, useRef, useState } from 'react';
import type { BuffBlock, BuffKind, BuffSlot, BuffTag, OvertimeRow, PlayerActiveBuff, PlayerBuffs, PublicQuestion } from '@quiz/shared';
import { BUFF_ICONS, buffName } from '../buff-meta';
import { signed } from '../format';
import { errorText, t, type TextKey } from '../i18n';
import { useTimeOver } from '../live/Timer';
import type { Send } from '../live/types';

/** Скільки чекає підтвердження після першого дотику, мс. */
export const BUFF_CONFIRM_MS = 3000;

/** Причина неактивної кнопки словами. */
function whyText(block: BuffBlock, kind: BuffKind): string {
  return t(`buffWhy_${block}` as TextKey, { name: buffName(kind) });
}

/**
 * Причина, яку телефон показує сам: зріз не знає now, тож сплив власний час рахує телефон.
 * time ніколи не замінює used, taken, answered, paused; пауза на телефоні гасить і готові кнопки.
 */
function shownBlock(slot: BuffSlot, paused: boolean, timeOver: boolean): BuffBlock | null {
  if (slot.state === 'active') return null;
  const block = slot.block;
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
  send,
  onError,
}: {
  buffs: PlayerBuffs;
  paused: boolean;
  /** Власний час гравця сплив (особистий кінець або спільний). */
  timeOver?: boolean;
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
    const block = shownBlock(slot, paused, timeOver);
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

  const active = buffs.active;
  // Рядок пояснень тримає й «Неправильно, ще одна спроба»: підказка не зсуває варіантів.
  const idle =
    active === null
      ? ''
      : active.retry === 'again'
        ? t('retryAgain')
        : active.kind === 'time'
          ? t('overtimeMine')
          : t('buffTaken', { icon: BUFF_ICONS[active.kind], name: buffName(active.kind) });

  return (
    <div className="buff-bar">
      <div className="buff-row" role="group" aria-label={t('buffRowLabel')}>
        {buffs.slots.map((slot) => {
          const block = shownBlock(slot, paused, timeOver);
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
      <p className="buff-why" aria-live="polite">
        {note?.text ?? idle}
      </p>
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

/** Значки сцени: «½ Оля» біля кожного гравця, що взяв баф на це запитання; що баф зробив, сцена не знає. */
export function StageBuffs({ buffs }: { buffs: BuffTag[] }) {
  if (buffs.length === 0) return null;
  return (
    <ul className="stage-buffs" aria-label={t('stageBuffsLabel')}>
      {buffs.map((tag) => (
        <li key={tag.playerId} title={buffName(tag.kind)}>{`${BUFF_ICONS[tag.kind]} ${tag.nickname}`}</li>
      ))}
    </ul>
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
