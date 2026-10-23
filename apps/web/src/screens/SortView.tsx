import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from 'react';
import type { Choice, PlayerSort, PublicQuestion, SortInfo } from '@quiz/shared';
import { secondsText } from '../format';
import { errorText, t } from '../i18n';
import { secondsLeft } from '../clock';
import { reducedMotion } from '../motion';
import type { Send } from '../live/types';

export type ZonePosition = 'left' | 'right' | 'top' | 'bottom';

const ORDER: ZonePosition[] = ['left', 'right', 'top', 'bottom'];
/** Свайп від стількох пікселів веде картку в зону. */
const SWIPE_PX = 60;
const SHAKE_MS = 400;
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
  const mountedRef = useRef(true);
  const dragRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const [fly, setFly] = useState<{ wordId: string; pos: ZonePosition } | null>(null);
  const [shaking, setShaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);
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

  const release = () => {
    pendingRef.current = false;
    if (fallbackRef.current !== null) clearTimeout(fallbackRef.current);
    fallbackRef.current = null;
  };

  const moveTo = (pos: ZonePosition) => {
    const index = positions.indexOf(pos);
    const category = index < 0 ? undefined : categories[index];
    const card = sort.card;
    if (category === undefined || card === null || blocked()) return;
    pendingRef.current = true;
    fallbackRef.current = setTimeout(release, PENDING_FALLBACK_MS);
    if (!reducedMotion()) setFly({ wordId: card.id, pos });
    void send('player:sort', { wordId: card.id, categoryId: category.id })
      .then((result) => {
        if (!mountedRef.current) return;
        setError(result.ok || QUIET.has(result.error) ? null : errorText(result.error));
      })
      .finally(() => {
        release();
        if (mountedRef.current) setFly(null);
      });
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
    setDrag({ dx: event.clientX - start.x, dy: event.clientY - start.y });
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragRef.current;
    if (start === null || start.id !== event.pointerId) return;
    dragRef.current = null;
    setDrag(null);
    const pos = zoneAt(event.clientX, event.clientY) ?? swipeTarget(event.clientX - start.x, event.clientY - start.y, positions);
    if (pos !== null) moveTo(pos);
  };
  const onPointerCancel = () => {
    dragRef.current = null;
    setDrag(null);
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
          <p className="sort-lock" role="status">
            {t('sortLocked', { seconds: lockSeconds })}
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

/** Поле, глядач: категорії без кнопок і прогрес того, хто сортує; картки немає. */
export function SortWatch({ question, info }: { question: PublicQuestion; info: SortInfo }) {
  const row = info.rows[0];
  return (
    <section className="sort-play is-watching">
      <Arena
        categories={question.sort?.categories ?? []}
        zone={(category, pos) => (
          <div key={pos} className="sort-zone" data-pos={pos}>
            {category.text}
          </div>
        )}
      >
        {row !== undefined && <p className="sort-watching">{t('sortWatching', { name: row.nickname })}</p>}
      </Arena>
      <p className="sort-progress">{t('sortProgress', { sorted: row?.sorted ?? 0, total: info.total })}</p>
    </section>
  );
}
