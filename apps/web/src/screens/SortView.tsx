import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from 'react';
import { SORT_TILT_MS, type Choice, PlayerSort, PublicQuestion, Question, SortColumn, SortInfo, SortLive, SortTilt, SortWordMark } from '@quiz/shared';
import { secondsText, signed } from '../format';
import { countText, errorText, t } from '../i18n';
import { secondsLeft } from '../clock';
import { reducedMotion } from '../motion';
import type { Send } from '../live/types';

export type ZonePosition = 'left' | 'right' | 'top' | 'bottom';

const ORDER: ZonePosition[] = ['left', 'right', 'top', 'bottom'];
/** Свайп від стількох пікселів веде картку в зону. */
const SWIPE_PX = 60;
/** Відстань, на якій нахил стає повним (1), px. */
export const TILT_FULL_PX = 120;
/** Менший рух ще не нахил: картка в центрі, px. */
const TILT_MIN_PX = 12;
const SHAKE_MS = 400;
/** Політ картки глядача після ходу, мс. */
export const FLY_MS = 450;
/** Скільки щойно влучене слово лишається позначеним, мс. */
export const LANDED_MS = 1500;
/** Відповідь на хід може не прийти (send без тайм-ауту): картка не лишається заблокованою назавжди. */
const PENDING_FALLBACK_MS = 3000;
const ARROWS: Record<string, ZonePosition> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'top', ArrowDown: 'bottom' };
/** Відмови, після яких свіжий зріз сервера сам усе показує: помилки гравцеві не пишемо. */
const QUIET = new Set(['sort_stale', 'sort_locked']);

/** Позиції зон за кількістю категорій: 2 → left, right; 3 → + top; 4 → + bottom. */
export function zonePositions(count: number): ZonePosition[] {
  return ORDER.slice(0, Math.max(0, Math.min(count, ORDER.length)));
}

/** Куди веде відпускання картки без зони під точкою: свайп ≥ 60 px за домінуючою віссю, якщо там є зона; інакше null. */
export function swipeTarget(dx: number, dy: number, positions: ZonePosition[]): ZonePosition | null {
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const distance = horizontal ? Math.abs(dx) : Math.abs(dy);
  if (distance < SWIPE_PX) return null;
  const pos: ZonePosition = horizontal ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'top' : 'bottom';
  return positions.includes(pos) ? pos : null;
}

/** Зона під точкою екрана (картка під пальцем теж там, тож дивимося весь стос елементів). */
function zoneAt(x: number, y: number): ZonePosition | null {
  if (typeof document.elementsFromPoint !== 'function') return null;
  for (const el of document.elementsFromPoint(x, y)) {
    const zone = el.closest<HTMLButtonElement>('button.sort-zone');
    if (zone !== null && !zone.disabled) return (zone.dataset.pos as ZonePosition | undefined) ?? null;
  }
  return null;
}

/** Нахил з руху пальця (11d): зона під пальцем — повний, інакше домінуюча вісь без порогу свайпу; amount 0…1 з кроком 0,05. */
export function tiltOf(
  dx: number,
  dy: number,
  positions: ZonePosition[],
  categories: Choice[],
  under: ZonePosition | null,
): { categoryId: string | null; amount: number } {
  const center = { categoryId: null, amount: 0 };
  if (under !== null) {
    const index = positions.indexOf(under);
    return index < 0 || categories[index] === undefined ? center : { categoryId: categories[index].id, amount: 1 };
  }
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const distance = horizontal ? Math.abs(dx) : Math.abs(dy);
  const pos: ZonePosition = horizontal ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'top' : 'bottom';
  const index = positions.indexOf(pos);
  if (index < 0 || categories[index] === undefined || distance < TILT_MIN_PX) return center;
  return { categoryId: categories[index].id, amount: Math.round(Math.min(1, distance / TILT_FULL_PX) * 20) / 20 };
}

type TiltValue = { categoryId: string | null; amount: number };
export type TiltSender = ((tilt: TiltValue) => void) & { release: () => void; cancel: () => void };

/**
 * Нахил на сервер (11d): не частіше SORT_TILT_MS, з хвостом, без повторів; release — одразу «в центр»; wordId — поточна картка,
 * seq — ходів зроблено (помилка на останньому слові лишає ту саму картку, але нахил треба слати заново).
 */
export function useTiltSender(send: Send, active: boolean, wordId: string | null, seq = 0): TiltSender {
  const pending = useRef<TiltValue | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sent = useRef('null:0');
  const sendRef = useRef(send);
  sendRef.current = send;
  const wordRef = useRef(wordId);
  wordRef.current = wordId;
  const activeRef = useRef(active);
  activeRef.current = active;
  const stop = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
  }, []);
  const out = useCallback((tilt: TiltValue) => {
    const word = wordRef.current;
    const key = `${tilt.categoryId}:${tilt.amount}`;
    if (word === null || key === sent.current) return;
    sent.current = key;
    void sendRef.current('player:sort-tilt', { wordId: word, categoryId: tilt.categoryId, amount: tilt.amount }).then((result) => {
      // Відмова: значення до глядачів не дійшло, тож наступне таке саме піде знову; «зарано» (дросель сервера) — ще раз хвостом.
      if (result.ok || sent.current !== key || wordRef.current !== word) return;
      sent.current = '';
      if (result.error === 'too_soon' && timer.current === null) sender.current?.(tilt);
    });
  }, []);
  // Нове слово, новий хід чи втрата права сортувати: хвіст не йде, а на сервері нахил уже скинуто.
  useEffect(() => {
    sent.current = 'null:0';
    stop();
    return stop;
  }, [wordId, active, seq, stop]);
  const sender = useRef<TiltSender | null>(null);
  if (sender.current === null) {
    const push = ((tilt: TiltValue) => {
      if (!activeRef.current) return;
      pending.current = tilt;
      if (timer.current !== null) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        const next = pending.current;
        pending.current = null;
        if (next !== null) out(next);
      }, SORT_TILT_MS);
    }) as TiltSender;
    push.cancel = stop;
    push.release = () => {
      stop();
      if (activeRef.current) out({ categoryId: null, amount: 0 });
    };
    sender.current = push;
  }
  return sender.current;
}

/** Сітка зон по краях і середина: однакова для того, хто сортує, і для глядачів. */
function Arena({
  categories,
  arenaRef,
  zone,
  children,
}: {
  categories: Choice[];
  arenaRef?: Ref<HTMLDivElement>;
  zone: (category: Choice, pos: ZonePosition) => ReactNode;
  children: ReactNode;
}) {
  const positions = zonePositions(categories.length);
  return (
    <div ref={arenaRef} className="sort-arena" data-zones={positions.length}>
      {positions.map((pos, index) => zone(categories[index], pos))}
      <div className="sort-center">{children}</div>
    </div>
  );
}

/** Сортування на телефоні: зони категорій по краях, картка посередині; хід — перетягування, дотик до зони або стрілка. */
export function SortPlay({
  question,
  sort,
  paused,
  offsetMs,
  send,
}: {
  /** question.sort !== null; під «Дзеркалом» — уже обернене. */
  question: PublicQuestion;
  sort: PlayerSort;
  paused: boolean;
  offsetMs: number;
  send: Send;
}) {
  const categories = question.sort?.categories ?? [];
  const positions = zonePositions(categories.length);
  const arenaRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef(false);
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Номер поточного ходу: запізніла відповідь на старий хід (після запасного тайм-ауту) не звільняє новий.
  const tokenRef = useRef(0);
  const mountedRef = useRef(true);
  const dragRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const [fly, setFly] = useState<{ wordId: string; pos: ZonePosition } | null>(null);
  const [shaking, setShaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const tilt = useTiltSender(send, sort.watched && sort.canSort, sort.card?.id ?? null, sort.sorted + sort.misses);
  const prevMisses = useRef(sort.misses);

  // Секунди підвисання за годинником сервера; на паузі — збережений залишок.
  const nowMs = Date.now();
  const lockSeconds =
    secondsLeft({ endsAt: sort.lockedUntil, remainingMs: paused ? (sort.lockRemainingMs ?? 0) : sort.lockRemainingMs }, offsetMs, nowMs) ?? 0;
  const locked = lockSeconds > 0;
  const ticking = locked && !paused && sort.lockRemainingMs === null && sort.lockedUntil !== null;
  // Під час підвисання трусить і лежить саме те слово, що помилилося; далі — голова черги.
  const word = locked && sort.missed !== null ? sort.missed : sort.card;
  const done = sort.timeMs !== null;
  const zonesOff = paused || locked || !sort.canSort || sort.card === null;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (fallbackRef.current !== null) clearTimeout(fallbackRef.current);
    };
  }, []);

  // Відлік підвисання: перемальовування рівно на межі секунди й лише поки шар видно (на паузі залишок стоїть).
  useEffect(() => {
    if (!ticking || sort.lockedUntil === null) return;
    const left = sort.lockedUntil - (Date.now() + offsetMs);
    const id = setTimeout(() => setTick((n) => n + 1), ((Math.max(1, left) - 1) % 1000) + 1);
    return () => clearTimeout(id);
  });

  // Нова помилка трусить картку; перезавантаження сторінки з уже наявними помилками — ні.
  useEffect(() => {
    const grew = sort.misses > prevMisses.current;
    prevMisses.current = sort.misses;
    if (!grew || reducedMotion()) return;
    setShaking(true);
    const id = setTimeout(() => setShaking(false), SHAKE_MS);
    return () => clearTimeout(id);
  }, [sort.misses]);

  const blocked = () =>
    pendingRef.current || zonesOff || sort.card === null || arenaRef.current?.closest('fieldset')?.disabled === true;

  const release = (token: number) => {
    if (tokenRef.current !== token || !pendingRef.current) return;
    pendingRef.current = false;
    if (fallbackRef.current !== null) clearTimeout(fallbackRef.current);
    fallbackRef.current = null;
  };

  /** Хід у зону; false — хід не пішов (зайнято, підвисання, пауза). */
  const moveTo = (pos: ZonePosition): boolean => {
    const index = positions.indexOf(pos);
    const category = index < 0 ? undefined : categories[index];
    const card = sort.card;
    if (category === undefined || card === null || blocked()) return false;
    pendingRef.current = true;
    const token = ++tokenRef.current;
    fallbackRef.current = setTimeout(() => release(token), PENDING_FALLBACK_MS);
    if (!reducedMotion()) setFly({ wordId: card.id, pos });
    void send('player:sort', { wordId: card.id, categoryId: category.id })
      .then((result) => {
        // Відмова: картка лишилася, тож глядачі не мають бачити її нахиленою.
        if (!result.ok) tilt.release();
        if (!mountedRef.current || tokenRef.current !== token) return;
        setError(result.ok || QUIET.has(result.error) ? null : errorText(result.error));
      })
      .finally(() => {
        if (tokenRef.current !== token) return;
        release(token);
        if (mountedRef.current) setFly(null);
      });
    return true;
  };

  // Стрілки — на рівні документа, крім випадків, коли фокус у полі введення.
  const keyRef = useRef<(event: KeyboardEvent) => void>(() => {});
  keyRef.current = (event) => {
    const pos = ARROWS[event.key];
    if (pos === undefined) return;
    const target = event.target;
    if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]') !== null) return;
    if (!positions.includes(pos)) return;
    event.preventDefault();
    moveTo(pos);
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => keyRef.current(event);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (blocked()) return;
    dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ dx: 0, dy: 0 });
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragRef.current;
    if (start === null || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    setDrag({ dx, dy });
    tilt(tiltOf(dx, dy, positions, categories, zoneAt(event.clientX, event.clientY)));
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragRef.current;
    if (start === null || start.id !== event.pointerId) return;
    dragRef.current = null;
    setDrag(null);
    const pos = zoneAt(event.clientX, event.clientY) ?? swipeTarget(event.clientX - start.x, event.clientY - start.y, positions);
    if (pos !== null && moveTo(pos)) tilt.cancel();
    else tilt.release();
  };
  const onPointerCancel = () => {
    dragRef.current = null;
    setDrag(null);
    tilt.release();
  };

  const flying = fly !== null && word !== null && fly.wordId === word.id && !locked ? fly.pos : null;
  const cardClass = ['sort-card', shaking && 'is-shaking', drag !== null && 'is-dragging', flying !== null && `is-flying is-to-${flying}`]
    .filter(Boolean)
    .join(' ');

  return (
    <section className="sort-play">
      <Arena
        categories={categories}
        arenaRef={arenaRef}
        zone={(category, pos) => (
          <button
            key={pos}
            type="button"
            className="sort-zone"
            data-pos={pos}
            aria-label={t('sortZone', { name: category.text })}
            disabled={zonesOff}
            onClick={() => moveTo(pos)}
          >
            {category.text}
          </button>
        )}
      >
        {word !== null ? (
          <div
            key={word.id}
            className={cardClass}
            role="img"
            aria-label={t('sortCard', { word: word.text })}
            style={drag !== null ? { transform: `translate(${drag.dx}px, ${drag.dy}px)` } : undefined}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          >
            {word.text}
          </div>
        ) : (
          done && <p className="sort-done">{t('sortDone', { time: secondsText(sort.timeMs ?? 0) })}</p>
        )}
        {locked && (
          // Тонування під карткою й смуга відліку внизу середини: картка, що трусить, лишається видимою.
          <p className="sort-lock" role="status">
            <span className="sort-lock-text">{t('sortLocked', { seconds: lockSeconds })}</span>
          </p>
        )}
      </Arena>
      <p className="sort-progress">{t('sortProgress', { sorted: sort.sorted, total: sort.total })}</p>
      <p className="meta sort-hint">{t('sortHintPlayer')}</p>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** Нахил, що діє зараз (11d): той самий хід і слово, не пауза, є напрям; інакше null. */
export function liveTilt(live: SortLive, tilts: Record<string, SortTilt>, paused: boolean): SortTilt | null {
  const tilt = tilts[live.sorterId];
  if (tilt === undefined || paused || tilt.toward === null) return null;
  return tilt.seq === live.seq && live.card !== null && tilt.wordId === live.card.id ? tilt : null;
}

/** Зміщення картки до зони телефона-глядача. */
export function zoneOffset(pos: ZonePosition): { x: number; y: number } {
  if (pos === 'left') return { x: -1, y: 0 };
  if (pos === 'right') return { x: 1, y: 0 };
  if (pos === 'top') return { x: 0, y: -1 };
  return { x: 0, y: 1 };
}

/** Зміщення картки до стовпця сцени: стовпці стоять в ряд під карткою. */
export function columnOffset(index: number, count: number): { x: number; y: number } {
  return { x: ((index + 0.5) / Math.max(1, count) - 0.5) * 2, y: 1 };
}

/** CSS-змінні нахилу картки глядача. */
export function tiltVars(offset: { x: number; y: number }, amount: number): CSSProperties {
  return { '--tilt-x': offset.x, '--tilt-y': offset.y, '--tilt': amount } as CSSProperties;
}

type Flight = { wordId: string; to: string; hit: boolean };

/** Політ після ходу й щойно влучене слово: перший рендер не анімує; на reduced-motion — лише позначка влучання. */
export function useSortFlight(live: SortLive): { flight: Flight | null; landed: string | null } {
  const [flight, setFlight] = useState<Flight | null>(null);
  const [landed, setLanded] = useState<string | null>(null);
  const prevSeq = useRef(live.seq);
  const flightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const landedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const grew = live.seq > prevSeq.current;
    prevSeq.current = live.seq;
    const last = live.last;
    if (!grew || last === null) return;
    // Помилка без картки (час скінчився): трусити нічого.
    if (!last.hit && live.card === null) return;
    if (!reducedMotion()) {
      if (flightTimer.current !== null) clearTimeout(flightTimer.current);
      setFlight({ wordId: last.wordId, to: last.to, hit: last.hit });
      flightTimer.current = setTimeout(() => setFlight(null), FLY_MS);
    }
    if (last.hit) {
      if (landedTimer.current !== null) clearTimeout(landedTimer.current);
      setLanded(last.wordId);
      landedTimer.current = setTimeout(() => setLanded(null), LANDED_MS);
    }
  }, [live.seq, live.last, live.card]);
  useEffect(
    () => () => {
      if (flightTimer.current !== null) clearTimeout(flightTimer.current);
      if (landedTimer.current !== null) clearTimeout(landedTimer.current);
    },
    [],
  );
  return { flight, landed };
}

/** Картка глядача: поточне слово (під підвисання — помилкове), нахил, політ, трусіння й відлік підвисання. */
export function SortLiveCard({
  live,
  categories,
  tilt,
  flight,
  paused,
  offsetMs,
  layout,
}: {
  live: SortLive;
  categories: Choice[];
  tilt: SortTilt | null;
  flight: Flight | null;
  paused: boolean;
  offsetMs: number;
  layout: 'phone' | 'stage';
}) {
  const [, setTick] = useState(0);
  // Підвисання й трусіння лише на запитанні з карткою: card === null — locked чи reveal, там застарілий відлік не показуємо.
  const active = live.card !== null;
  const nowMs = Date.now();
  const lockSeconds = active
    ? (secondsLeft({ endsAt: live.lockedUntil, remainingMs: paused ? (live.lockRemainingMs ?? 0) : live.lockRemainingMs }, offsetMs, nowMs) ?? 0)
    : 0;
  const locked = lockSeconds > 0;
  const ticking = locked && !paused && live.lockRemainingMs === null && live.lockedUntil !== null;
  useEffect(() => {
    if (!ticking || live.lockedUntil === null) return;
    const left = live.lockedUntil - (Date.now() + offsetMs);
    const id = setTimeout(() => setTick((n) => n + 1), ((Math.max(1, left) - 1) % 1000) + 1);
    return () => clearTimeout(id);
  });
  // Читач екрана чує підвисання глядача раз, на його початку (помилка — нова), а не щосекунди.
  const announced = useRef<{ misses: number; seconds: number } | null>(null);
  if (!locked) announced.current = null;
  else if (announced.current?.misses !== live.misses) announced.current = { misses: live.misses, seconds: lockSeconds };

  const flyingHit = flight !== null && flight.hit && live.last !== null && live.last.wordId === flight.wordId ? live.last : null;
  const flyingMiss = flight !== null && !flight.hit && active;
  const word = flyingHit !== null ? { id: flyingHit.wordId, text: flyingHit.text } : locked && live.missed !== null ? live.missed : live.card;
  if (word === null) return null;

  const toward = flight !== null ? flight.to : (tilt?.toward ?? null);
  const index = toward === null ? -1 : categories.findIndex((category) => category.id === toward);
  const offset =
    index < 0 ? { x: 0, y: 0 } : layout === 'stage' ? columnOffset(index, categories.length) : zoneOffset(zonePositions(categories.length)[index] ?? 'left');
  const amount = flight !== null ? 1 : (tilt?.amount ?? 0);
  const className = [
    'sort-live-card',
    layout === 'stage' && 'is-stage',
    flight === null && tilt !== null && 'is-tilting',
    flight !== null && 'is-flying',
    flyingHit !== null && 'is-hit',
    flyingMiss && 'is-miss',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <>
      <div
        className={className}
        role="img"
        aria-label={t('sortLiveCard', { word: word.text })}
        data-toward={toward ?? undefined}
        data-to={flight?.to}
        style={tiltVars(offset, amount)}
      >
        {word.text}
      </div>
      {locked && (
        <p className="sort-lock" aria-live="off">
          <span className="sort-lock-text" aria-hidden="true">
            {t('sortLocked', { seconds: lockSeconds })}
          </span>
          <span className="sr-only" role="status">
            {t('sortLockedOnce', { seconds: announced.current?.seconds ?? lockSeconds })}
          </span>
        </p>
      )}
    </>
  );
}

/** Поле, глядач: категорії без кнопок; з live — картка того, хто сортує, стовпці розкладених слів і чипи решти. */
export function SortWatch({
  question,
  info,
  live: liveProp,
  tilts = {},
  paused = false,
  offsetMs = 0,
  team = false,
}: {
  question: PublicQuestion;
  info: SortInfo;
  live?: SortLive | null;
  tilts?: Record<string, SortTilt>;
  paused?: boolean;
  offsetMs?: number;
  team?: boolean;
}) {
  const live = liveProp === undefined ? info.live : liveProp;
  const categories = question.sort?.categories ?? [];
  if (live === null) {
    const row = info.rows[0];
    return (
      <section className="sort-play is-watching">
        <Arena
          categories={categories}
          zone={(category, pos) => (
            <div key={pos} className="sort-zone" data-pos={pos}>
              {category.text}
            </div>
          )}
        >
          {row !== undefined && <p className="sort-watching">{t('sortWatching', { name: row.nickname })}</p>}
        </Arena>
        <p className="sort-progress">{t('sortProgress', { sorted: row?.sorted ?? 0, total: info.total })}</p>
        {info.words !== null && <SortWords words={info.words} />}
      </section>
    );
  }
  return <SortWatchLive question={question} info={info} live={live} tilts={tilts} paused={paused} offsetMs={offsetMs} team={team} />;
}

function SortWatchLive({
  question,
  info,
  live,
  tilts,
  paused,
  offsetMs,
  team,
}: {
  question: PublicQuestion;
  info: SortInfo;
  live: SortLive;
  tilts: Record<string, SortTilt>;
  paused: boolean;
  offsetMs: number;
  team: boolean;
}) {
  const categories = question.sort?.categories ?? [];
  const { flight, landed } = useSortFlight(live);
  const tilt = liveTilt(live, tilts, paused);
  const toward = flight !== null ? flight.to : (tilt?.toward ?? null);
  // Наповнення — у самому «хресті»: лічильник у зоні й щойно влучене слово з галочкою; стовпці зі словами — лише на розкритті.
  const landedIn = landed === null ? null : (live.columns.find((column) => column.words.some((word) => word.id === landed)) ?? null);
  const landedWord = landedIn?.words.find((word) => word.id === landed) ?? null;
  const rest = info.words === null ? null : waiting(info.words, live, flight);
  return (
    <section className="sort-play is-watching is-live">
      <p className="sort-watching">{t(team ? 'sortWatchingTeam' : 'sortWatching', { name: live.nickname })}</p>
      <Arena
        categories={categories}
        zone={(category, pos) => (
          <div key={pos} className={category.id === toward ? 'sort-zone is-toward' : 'sort-zone'} data-pos={pos}>
            <span className="sort-zone-name">
              {category.text}
              <span className="sort-zone-count">{t('sortZoneCount', { count: live.columns.find((column) => column.id === category.id)?.words.length ?? 0 })}</span>
            </span>
            {landedWord !== null && landedIn?.id === category.id && (
              <span className="sort-zone-landed">
                {landedWord.text}
                <span className="sort-landed" aria-hidden="true">
                  ✓
                </span>
              </span>
            )}
          </div>
        )}
      >
        <SortLiveCard live={live} categories={categories} tilt={tilt} flight={flight} paused={paused} offsetMs={offsetMs} layout="phone" />
      </Arena>
      <p className="sort-progress">{t('sortProgress', { sorted: live.sorted, total: live.total })}</p>
      {rest !== null && rest.length > 0 && (
        <details className="sort-rest">
          <summary>{countText('sortRest', rest.length, { count: rest.length })}</summary>
          <SortWords words={rest} />
        </details>
      )}
    </section>
  );
}

/** Слова, що ще не лежать у стовпцях. */
function unplaced(words: { id: string; text: string }[], columns: SortColumn[]): { id: string; text: string }[] {
  const placed = new Set(columns.flatMap((column) => column.words.map((word) => word.id)));
  return words.filter((word) => !placed.has(word.id));
}

/** Чипи глядача: ще не розкладені слова без того, що зараз на картці, помилкового й того, що летить. */
function waiting(words: { id: string; text: string }[], live: SortLive, flight: Flight | null): { id: string; text: string }[] {
  return unplaced(words, live.columns).filter((word) => word.id !== live.card?.id && word.id !== live.missed?.id && word.id !== flight?.wordId);
}

/** Сцена, звичайна клітинка поля (11d): смуга з карткою, стовпці й чипи нерозкладених; на розкритті — стовпці з позначками. */
export function SortStage({
  question,
  info,
  live,
  reveal,
  tilts,
  paused,
  offsetMs,
  team = false,
  headed = false,
}: {
  question: PublicQuestion;
  info: SortInfo;
  live: SortLive;
  reveal: Extract<Question, { type: 'sort' }> | null;
  tilts: Record<string, SortTilt>;
  paused: boolean;
  offsetMs: number;
  team?: boolean;
  /** Заголовок сцени вже каже «Відповідає …»: рядок «… сортує слова» зайвий. */
  headed?: boolean;
}) {
  const categories = question.sort?.categories ?? [];
  const { flight, landed } = useSortFlight(live);
  if (reveal !== null) {
    return (
      <div className="stage-sort-live">
        <SortReveal categories={categories} question={reveal} total={live.total} marks={live.marks} />
      </div>
    );
  }
  const tilt = liveTilt(live, tilts, paused);
  const toward = flight !== null ? flight.to : (tilt?.toward ?? null);
  return (
    <div className="stage-sort-live">
      <div className="sort-live-strip">
        {!headed && <p className="sort-watching">{t(team ? 'sortWatchingTeam' : 'sortWatching', { name: live.nickname })}</p>}
        <div className="sort-live-slot">
          <SortLiveCard live={live} categories={categories} tilt={tilt} flight={flight} paused={paused} offsetMs={offsetMs} layout="stage" />
        </div>
      </div>
      <SortReveal categories={categories} question={null} total={live.total} placed={live.columns} toward={toward} landed={landed} />
      {info.words !== null && <SortWords words={waiting(info.words, live, flight)} />}
    </div>
  );
}

/** Слова сортування чипами (лише показ): глядачі поля й сцена до розкриття. */
export function SortWords({ words }: { words: { id: string; text: string }[] }) {
  return (
    <ul className="chips sort-words" aria-label={t('sortWords')}>
      {words.map((word) => (
        <li key={word.id}>{word.text}</li>
      ))}
    </ul>
  );
}

/**
 * Рядки прогресу на сцені й пульті: «Оля ▮▮▮▯ 7/12», після закінчення — час; на reveal — бали.
 * Усі комірки є завжди (порожні — без тексту): на сцені це сітка зі сталими стовпцями, тож нічого не стрибає.
 */
export function SortBoard({ sort, reveal }: { sort: SortInfo; reveal: boolean }) {
  return (
    <ol className="rows sort-board">
      {sort.rows.map((row) => {
        const share = sort.total === 0 ? 0 : Math.min(1, row.sorted / sort.total);
        return (
          <li key={row.playerId}>
            <span className="name">{row.nickname}</span>
            <span className="sort-bar" aria-hidden="true">
              <span className="sort-bar-fill" style={{ '--sort-share': share } as CSSProperties} />
            </span>
            <span className="tag sort-count">{t('sortRow', { sorted: row.sorted, total: sort.total })}</span>
            <span className="tag sort-time">{row.timeMs !== null ? t('sortRowTime', { time: secondsText(row.timeMs) }) : ''}</span>
            <span className="tag sort-misses">{row.misses > 0 ? t('sortMisses', { misses: row.misses }) : ''}</span>
            <span className="score">{reveal && row.points !== null ? signed(row.points) : ''}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Категорії стовпцями; зі словами — розкриття, без question — назви (з placed — розкладені під час гри, 11d).
 * total (слів у запитанні) резервує висоту стовпців: блок не росте, коли слова з'являються.
 */
export function SortReveal({
  categories,
  question,
  total = 0,
  placed,
  toward = null,
  landed = null,
  marks = null,
}: {
  categories: Choice[];
  question: Extract<Question, { type: 'sort' }> | null;
  total?: number;
  placed?: SortColumn[];
  toward?: string | null;
  landed?: string | null;
  marks?: SortWordMark[] | null;
}) {
  const biggest = question === null ? 0 : Math.max(0, ...categories.map((category) => question.words.filter((word) => word.categoryId === category.id).length));
  const rows = Math.max(biggest, Math.ceil(total / Math.max(1, categories.length)));
  const style = { '--sort-rows': rows } as CSSProperties;
  const markOf = (wordId: string) => marks?.find((mark) => mark.wordId === wordId);
  const className = question !== null ? 'sort-reveal is-open' : placed !== undefined ? 'sort-reveal is-live' : 'sort-reveal';
  return (
    <div className={className} data-cols={categories.length} style={style}>
      {categories.map((category) => (
        <section key={category.id} className={category.id === toward ? 'sort-reveal-col is-toward' : 'sort-reveal-col'}>
          <h3>{category.text}</h3>
          <ul>
            {question !== null
              ? question.words
                  .filter((word) => word.categoryId === category.id)
                  .map((word) => {
                    const mark = markOf(word.id);
                    return (
                      <li key={word.id} className={mark?.late ? 'is-late' : undefined}>
                        {word.text}
                        {mark !== undefined && mark.misses > 0 && (
                          <span className="sort-mark" aria-label={t('sortMarkLabel', { n: mark.misses })}>
                            {t('sortMarkMisses', { n: mark.misses })}
                          </span>
                        )}
                        {mark?.late === true && <span className="sort-late">{t('sortLate')}</span>}
                      </li>
                    );
                  })
              : placed
                  ?.find((column) => column.id === category.id)
                  ?.words.map((word) => (
                    <li key={word.id} className={word.id === landed ? 'is-landed' : undefined}>
                      {word.text}
                      {word.id === landed && (
                        <span className="sort-landed" aria-hidden="true">
                          ✓
                        </span>
                      )}
                    </li>
                  ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
