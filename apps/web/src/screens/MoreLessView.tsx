import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { MoreLessInfo, MoreLessPairView, MoreLessSide, PlayerMoreLess, PublicQuestion } from '@quiz/shared';
import { signed } from '../format';
import { errorText, t } from '../i18n';
import type { Send } from '../live/types';

/**
 * Після переходу до наступного порівняння кнопки на мить гаснуть: нові кнопки стоять на місці старих,
 * тож другий дотик подвійного натиску інакше відповів би за наступну пару.
 */
export const MORELESS_TAP_GAP_MS = 350;

/** Відмови, про які телефон мовчить: другий натиск на вже пройдене порівняння (сервер уже має цей вибір). */
const QUIET = new Set(['moreless_stale']);

const SIDES: MoreLessSide[] = ['a', 'b'];

/** Клавіші вибору: 1/← — перший варіант, 2/→ — другий. */
function keySide(key: string): MoreLessSide | null {
  if (key === '1' || key === 'ArrowLeft') return 'a';
  if (key === '2' || key === 'ArrowRight') return 'b';
  return null;
}

/** Поле, де клавіші 1/2 і стрілки належать самому полю. */
function typing(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
}

/**
 * Телефон: одне порівняння за раз — запитання, лічильник «3 / 8» і дві кнопки на всю ширину.
 * Натиск одразу показує наступне порівняння (оптимістично): місце — max(своє, info.done). Правильності до відкриття немає.
 * Подвійний дотик відповідає лише раз: натиск рахується з pointerdown (чи клавіші), click того самого дотику — ні,
 * а після переходу кнопки гаснуть на MORELESS_TAP_GAP_MS. moreless_stale мовчить; інші відмови показують текст
 * і повертають телефон на місце сервера.
 */
export function MoreLessPlay({ info, question, paused, timeUp, send }: { info: PlayerMoreLess; question: PublicQuestion; paused: boolean; timeUp: boolean; send: Send }) {
  const pairs = question.moreless?.pairs ?? [];
  const total = pairs.length;
  const [local, setLocal] = useState(info.done);
  const index = Math.max(local, info.done);
  const [gap, setGap] = useState(false);
  const [status, setStatus] = useState('');
  const [slide, setSlide] = useState(false);
  const indexNow = useRef(index);
  indexNow.current = index;
  const doneNow = useRef(info.done);
  doneNow.current = info.done;
  /** Порівняння, на які вже пішов запит: один запит на порівняння. */
  const sent = useRef(new Set<number>());
  /** Кнопка, у якій почався дотик: click того самого дотику вже не рахується. */
  const pressed = useRef<MoreLessSide | null>(null);
  const gapNow = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef<HTMLButtonElement>(null);
  /** Фокус був на кнопці попереднього порівняння — переходить на першу кнопку нового. */
  const refocus = useRef(false);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
      if (slideTimer.current !== null) clearTimeout(slideTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    first.current?.focus();
  }, [index]);

  const over = index >= total;
  const off = paused || timeUp || !info.canPick || over;
  const offNow = useRef(off);
  offNow.current = off;

  const choose = (pick: MoreLessSide) => {
    const at = indexNow.current;
    if (offNow.current || gapNow.current || at >= total || sent.current.has(at)) return;
    sent.current.add(at);
    const active = document.activeElement;
    refocus.current = active instanceof HTMLElement && active.classList.contains('moreless-option');
    setStatus('');
    setLocal(at + 1);
    gapNow.current = true;
    setGap(true);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      gapNow.current = false;
      setGap(false);
    }, MORELESS_TAP_GAP_MS);
    setSlide(true);
    if (slideTimer.current !== null) clearTimeout(slideTimer.current);
    slideTimer.current = setTimeout(() => setSlide(false), 200);
    void send('player:moreless', { index: at, pick }).then(
      (result) => {
        if (result.ok || QUIET.has(result.error)) return;
        refuse(at, errorText(result.error));
      },
      () => refuse(at, t('err_unknown')),
    );
  };

  /** Відмова: текст і назад на місце сервера; порівняння від відхиленого знову можна вибрати. */
  const refuse = (at: number, text: string) => {
    setStatus(text);
    for (const i of [...sent.current]) if (i >= at) sent.current.delete(i);
    setLocal(Math.min(at, doneNow.current));
  };

  // Клавіші 1/2 і стрілки — і коли фокус не на кнопці (але не в полі введення).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || typing(event.target)) return;
      const side = keySide(event.key);
      if (side === null) return;
      event.preventDefault();
      choose(side);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const pair = pairs[index];
  const text = (side: MoreLessSide) => (pair === undefined ? '' : side === 'a' ? pair.a : pair.b);

  const onPointerDown = (side: MoreLessSide) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    // Лише основна кнопка миші; у дотику й пера button — 0.
    if (event.button > 0) return;
    pressed.current = side;
    choose(side);
  };
  const onClick = (side: MoreLessSide) => (event: ReactMouseEvent<HTMLButtonElement>) => {
    // click після власного pointerdown — той самий дотик, він уже врахований; detail 0 — Enter чи пробіл на кнопці.
    const own = pressed.current !== null;
    pressed.current = null;
    if (own || event.detail !== 0) return;
    choose(side);
  };
  if (question.moreless === undefined) return null;

  return (
    <section className="moreless-play">
      {over ? (
        <p className="lead moreless-done">{t('morelessDone')}</p>
      ) : (
        <div key={index} className={slide ? 'moreless-card is-slide' : 'moreless-card'}>
          <p className="meta moreless-counter" dir="ltr">
            {t('morelessCounter', { n: index + 1, total })}
          </p>
          <h2 className="moreless-prompt" dir="auto">
            {pair?.prompt}
          </h2>
          <div className="moreless-options">
            {SIDES.map((side) => (
              <button
                key={side}
                ref={side === 'a' ? first : undefined}
                type="button"
                className="moreless-option"
                dir="auto"
                aria-label={t('morelessPick', { option: text(side) })}
                aria-disabled={off || gap}
                onPointerDown={onPointerDown(side)}
                onClick={onClick(side)}
              >
                {text(side)}
              </button>
            ))}
          </div>
          {timeUp && <p className="lead moreless-late">{t('morelessLate', { done: index, total })}</p>}
        </div>
      )}
      {/* Завжди в DOM: нове порівняння й відмова озвучуються, а поява тексту не зсуває кнопок. */}
      <p className="sr-only" aria-live="polite">
        {over || pair === undefined ? '' : t('morelessNext', { n: index + 1, prompt: pair.prompt })}
      </p>
      <p className="moreless-status" role="status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}

/** Позначка вибору для ведучого: ✓ чи ✗ щодо правильного варіанта. */
function PickMarks({ picks, pairs }: { picks: MoreLessSide[]; pairs: MoreLessPairView[] }) {
  return (
    <span className="moreless-picks" dir="ltr">
      {picks.map((pick, i) => {
        const pair = pairs[i];
        const right = pair !== undefined && pair.correct === pick;
        return (
          <span key={i} className={right ? 'moreless-pick is-right' : 'moreless-pick is-wrong'} title={pair === undefined ? undefined : `${i + 1}. ${pick === 'a' ? pair.a.text : pair.b.text}`}>
            {right ? '✓' : '✗'}
          </span>
        );
      })}
    </span>
  );
}

/**
 * Рядки гравців: «3 / 8»; ведучому — ще й правильні й вибори кожного наживо; на reveal — «правильно 5 з 8» і бали.
 * me — підсвітити власний рядок.
 */
export function MoreLessBoard({ info, reveal, me }: { info: MoreLessInfo; reveal: boolean; me?: string }) {
  return (
    <ol className="rows moreless-board">
      {info.rows.map((row) => {
        const picks = info.picks?.[row.playerId] ?? null;
        return (
          <li key={row.playerId} className={me !== undefined && row.playerId === me ? 'is-mine' : undefined}>
            <span className="name" dir="auto">
              {row.nickname}
            </span>
            {!reveal && (
              <span className="tag" dir="ltr">
                {t('morelessProgress', { done: row.done, total: row.total })}
              </span>
            )}
            {row.right !== null && (reveal || info.picks !== null) && <span className="tag moreless-right-of">{t('morelessRightOf', { right: row.right, total: row.total })}</span>}
            {reveal && row.points !== null && (
              <span className="score" dir="ltr">
                {signed(row.points)}
              </span>
            )}
            {picks !== null && info.pairs !== null && picks.length > 0 && <PickMarks picks={picks} pairs={info.pairs} />}
          </li>
        );
      })}
    </ol>
  );
}

const MARK_KEY = { right: 'morelessMarkRight', wrong: 'morelessMarkWrong', late: 'morelessMarkLate' } as const;

/**
 * Таблиця порівнянь: запитання, обидва варіанти зі значеннями, правильний підсвічено, «Правильно: N».
 * marks — позначки гравця на телефоні; compact — телефон і пульт (один стовпець); на сцені понад 10 порівнянь — два стовпці.
 */
export function MoreLessReveal({ pairs, marks, compact = false }: { pairs: MoreLessPairView[]; marks?: PlayerMoreLess['marks']; compact?: boolean }) {
  const className = ['moreless-reveal', compact ? 'is-compact' : '', !compact && pairs.length > 10 ? 'is-two' : ''].filter(Boolean).join(' ');
  return (
    <section className="moreless-table">
      <h2 className="meta">{t('morelessTitle')}</h2>
      <ol className={className}>
        {pairs.map((pair, i) => {
          const mark = marks?.[i] ?? null;
          return (
            <li key={pair.id} className={mark === null ? undefined : `is-${mark}`}>
              <span className="moreless-row-prompt" dir="auto">
                <span className="moreless-row-n" dir="ltr">
                  {i + 1}.
                </span>{' '}
                {pair.prompt}
              </span>
              {SIDES.map((side) => {
                const option = side === 'a' ? pair.a : pair.b;
                return (
                  <span key={side} className={pair.correct === side ? 'moreless-side moreless-right' : 'moreless-side'}>
                    <span className="moreless-side-text" dir="auto">
                      {option.text}
                    </span>
                    <span className="moreless-side-value" dir="auto">
                      {option.value}
                    </span>
                  </span>
                );
              })}
              <span className="tag moreless-row-count">{t('morelessRightCount', { n: pair.right })}</span>
              {mark !== null && <span className={`moreless-mark is-${mark}`}>{t(MARK_KEY[mark])}</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
