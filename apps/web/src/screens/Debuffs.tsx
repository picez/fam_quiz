import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import type { DebuffKind, PlayerView, PublicQuestion } from '@quiz/shared';
import { debuffName } from '../debuff-meta';
import { t, type TextKey } from '../i18n';
import { reducedMotion } from '../motion';
import { FogLayer, MudLayer } from './WipeLayers';

type Debuff = PlayerView['me']['debuff'];

/** Скільки висить банер «На вас наслано: …» від спрацювання, мс. */
export const BANNER_MS = 3000;
/** Як часто «Дзеркало» зсуває варіанти по колу, мс. */
export const MIRROR_SWAP_MS = 4000;
const FREEZE_MS = 5000;
/** Останні мілісекунди заморозки лід розсипається. */
const CRUMBLE_MS = 400;
const GUESTS = ['🐞', '🐈', '🐕', '🐞', '🐈'];
/** Цикл тремтіння, мс: поштовх — перші SHAKE_BURST частки, решта — спокій. CSS бере те саме число через --shake-cycle. */
export const SHAKE_CYCLE_MS = 2800;
export const SHAKE_BURST = 0.3;
/** Вібрація на початку поштовху: дзиж — пауза — дзиж. */
const SHAKE_BUZZ = [120, 60, 120];
const TIPS: Partial<Record<DebuffKind, TextKey>> = {
  fog: 'debuffTip_fog',
  mud: 'debuffTip_mud',
  freeze: 'debuffTip_freeze',
  flip: 'debuffTip_flip',
  torch: 'debuffTip_torch',
  sticky: 'debuffTip_sticky',
  noclock: 'debuffTip_noclock',
  bubbles: 'debuffTip_bubbles',
};
/** Радіус світла «Ліхтарика» (12h), px. CSS бере те саме число через --torch-r. */
export const TORCH_RADIUS_PX = 80;
/** Скільки бульбашок закривають відповіді (12h). */
export const BUBBLE_COUNT = 12;
/** Скільки висить «Ой, липко!» після липкого дотику (12h), мс. */
export const STICKY_NOTE_MS = 1200;
/** Сітка бульбашок: 3 стовпці × 4 рядки по нижніх 70 % зони. */
const BUBBLE_COLS = 3;
const BUBBLE_TOP = 0.3;

/** Позиції бульбашок у частках зони: сітка 3 × 4 по нижніх 70 % зони з детермінованим зсувом від seed (як GUESTS). */
export function bubbleSpots(seed: number): { x: number; y: number }[] {
  const rows = BUBBLE_COUNT / BUBBLE_COLS;
  const cellH = (1 - BUBBLE_TOP) / rows;
  // Зсув −k…k сотих частки; той самий seed — ті самі місця на кожному перемальовуванні.
  const jitter = (n: number, k: number) => ((((n % (2 * k + 1)) + 2 * k + 1) % (2 * k + 1)) - k) / 100;
  return Array.from({ length: BUBBLE_COUNT }, (_, i) => {
    const col = i % BUBBLE_COLS;
    const row = Math.floor(i / BUBBLE_COLS);
    return {
      x: (col + 0.5) / BUBBLE_COLS + jitter(seed * 37 + i * 23, 5),
      y: BUBBLE_TOP + (row + 0.5) * cellH + jitter(seed * 17 + i * 29, 3),
    };
  });
}

/** 5000 мс, але не більше половини часу запитання; без таймера — 5000. */
export function freezeMs(limitMs: number | null): number {
  return limitMs === null ? FREEZE_MS : Math.min(FREEZE_MS, Math.floor(limitMs / 2));
}

/** Зсув списку по колу на step позицій; той самий масив, якщо зсуву немає. */
function rotate<T>(items: T[], step: number): T[] {
  const n = items.length;
  const k = n === 0 ? 0 : ((step % n) + n) % n;
  return k === 0 ? items : [...items.slice(k), ...items.slice(0, k)];
}

/** Зсув варіантів по колу на step позицій (single/multi; у сортуванні — зони категорій; інші типи без змін). */
export function rotateChoices(question: PublicQuestion, step: number): PublicQuestion {
  // Стіна: позиції плиток мають лишатися справжніми, тож запитання не змінюється.
  if (question.type === 'wall') return question;
  if (question.type === 'sort' && question.sort !== null) {
    const categories = rotate(question.sort.categories, step);
    return categories === question.sort.categories ? question : { ...question, sort: { ...question.sort, categories } };
  }
  if (question.type !== 'single' && question.type !== 'multi') return question;
  const choices = rotate(question.choices, step);
  return choices === question.choices ? question : { ...question, choices };
}

/** Запитання для показу: під «Дзеркалом» варіанти зсуваються кожні MIRROR_SWAP_MS; інакше те саме запитання. */
export function useDebuffQuestion(question: PublicQuestion | null, debuff: Debuff): PublicQuestion | null {
  // Ключ — мить спрацювання: новий дебаф починає з нульового зсуву.
  const key = debuff?.kind === 'mirror' ? debuff.since : null;
  const [state, setState] = useState<{ key: number | null; step: number }>({ key, step: 0 });
  const step = state.key === key ? state.step : 0;
  useEffect(() => {
    if (key === null) return;
    const id = setInterval(() => setState((s) => ({ key, step: (s.key === key ? s.step : 0) + 1 })), MIRROR_SWAP_MS);
    return () => clearInterval(id);
  }, [key]);
  return useMemo(() => (question === null || key === null ? question : rotateChoices(question, step)), [question, key, step]);
}

/**
 * Скільки мс минуло від since за годинником сервера; перемальовує зону рівно на позначках marks,
 * без щосекундних таймерів.
 */
function useElapsed(since: number | null, marks: number[], offsetMs: number): number | null {
  const [, setTick] = useState(0);
  const elapsed = since === null ? null : Date.now() + offsetMs - since;
  useEffect(() => {
    if (elapsed === null) return;
    const next = marks.find((mark) => mark > elapsed);
    if (next === undefined) return;
    const id = setTimeout(() => setTick((n) => n + 1), next - elapsed);
    return () => clearTimeout(id);
  });
  return elapsed;
}

/** Фаза циклу тремтіння від since за годинником сервера, мс (0…SHAKE_CYCLE_MS). */
function shakePhase(since: number, offsetMs: number): number {
  return Math.max(0, Date.now() + offsetMs - since) % SHAKE_CYCLE_MS;
}

/**
 * Вібрація на початку кожного поштовху (якщо є navigator.vibrate і не зменшена анімація);
 * since — мить спрацювання за годинником сервера. Перший поштовх — у мить спрацювання, далі за фазою циклу.
 */
export function useShakeBuzz(active: boolean, since: number | null, offsetMs: number): void {
  useEffect(() => {
    if (!active || since === null || reducedMotion()) return;
    if (typeof navigator.vibrate !== 'function') return;
    const buzz = () => navigator.vibrate(SHAKE_BUZZ);
    let id: ReturnType<typeof setTimeout> | undefined;
    const schedule = (early: boolean) => {
      let wait = SHAKE_CYCLE_MS - shakePhase(since, offsetMs);
      // Таймер спрацював трохи раніше межі циклу — не дзижчати двічі поспіль.
      if (early && wait < SHAKE_CYCLE_MS / 2) wait += SHAKE_CYCLE_MS;
      id = setTimeout(() => {
        buzz();
        schedule(true);
      }, wait);
    };
    // Уже йде поштовх (зокрема в мить спрацювання) — дзижчимо одразу.
    if (shakePhase(since, offsetMs) < SHAKE_CYCLE_MS * SHAKE_BURST) buzz();
    schedule(false);
    return () => clearTimeout(id);
  }, [active, since, offsetMs]);
}

/** Лід заморозки: тріщини проявляються за етапами, на останньому лід розсипається. */
function Ice({ stage }: { stage: number }) {
  return (
    <div className="debuff-layer debuff-ice" data-stage={stage} aria-hidden="true">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <path className="crack" data-n="1" d="M8 0 L22 18 L16 34 L30 52" />
        <path className="crack" data-n="2" d="M100 22 L78 30 L70 48 L84 66 L74 84" />
        <path className="crack" data-n="3" d="M0 78 L20 70 L38 82 L56 72 L62 100" />
      </svg>
    </div>
  );
}

/** «Бульбашки»: кнопки над зоною ловлять дотик самі, тож варіант під бульбашкою не натискається, поки її не лопнуто. */
function BubblesLayer({ seed, calm }: { seed: number; calm: boolean }) {
  const [popped, setPopped] = useState<ReadonlySet<number>>(() => new Set());
  return (
    <>
      {bubbleSpots(seed).map((spot, i) => {
        const style = { left: `${(spot.x * 100).toFixed(1)}%`, top: `${(spot.y * 100).toFixed(1)}%`, '--delay': `${((i * 0.7) % 3).toFixed(1)}s` } as CSSProperties;
        if (popped.has(i))
          // Лопнута бульбашка лишається тінню на час анімації; зі «Зменшити рух» зникає одразу.
          return calm ? null : <span key={i} className="debuff-layer debuff-bubble is-popped" aria-hidden="true" style={style} />;
        return (
          <button
            key={i}
            type="button"
            className="debuff-layer debuff-bubble"
            aria-label={t('bubblePop')}
            style={style}
            onClick={() => setPopped((set) => new Set(set).add(i))}
          />
        );
      })}
    </>
  );
}

/** Що липне: кнопка, підпис чи [role=button] у самому вмісті, поза рядом бафів і поза полями введення. */
function stickyTarget(target: EventTarget, content: HTMLElement): Element | null {
  if (!(target instanceof Element) || !content.contains(target)) return null;
  const typing = 'input:not([type="checkbox"]):not([type="radio"]), textarea, select';
  if (target.closest(typing) !== null) return null;
  const hit = target.closest('button, label, [role="button"]');
  if (hit === null || !content.contains(hit) || hit.closest('.buff-bar') !== null) return null;
  // Підпис поля: дотик ставить курсор у поле, а не відповідає.
  if (hit.matches('label') && hit.querySelector(typing) !== null) return null;
  return hit;
}

/** «Липкі кнопки»: кожна кнопка спрацьовує з другого дотику, перший показує «Ой, липко!». Стан — на запитання. */
function useSticky(active: boolean, questionIndex: number) {
  // Кнопки, що вже «відлипли»; нове запитання — новий набір.
  const unstuck = useRef<{ key: number; set: WeakSet<Element> }>({ key: questionIndex, set: new WeakSet() });
  if (unstuck.current.key !== questionIndex) unstuck.current = { key: questionIndex, set: new WeakSet() };
  // Новий об'єкт на кожен липкий дотик: плашка висить STICKY_NOTE_MS від останнього.
  const [note, setNote] = useState<{ key: number } | null>(null);
  useEffect(() => {
    if (note === null) return;
    const id = setTimeout(() => setNote(null), STICKY_NOTE_MS);
    return () => clearTimeout(id);
  }, [note]);
  const onClickCapture = (event: MouseEvent<HTMLFieldSetElement>) => {
    const hit = stickyTarget(event.target, event.currentTarget);
    if (hit === null || unstuck.current.set.has(hit)) return;
    unstuck.current.set.add(hit);
    event.preventDefault();
    event.stopPropagation();
    setNote({ key: questionIndex });
  };
  return { shown: active && note !== null && note.key === questionIndex, onClickCapture: active ? onClickCapture : undefined };
}

/** «Без годинника»: на місці табло — пісочний годинник тієї самої висоти, без role="timer". */
export function NoClock({ bar }: { bar: boolean }) {
  return (
    <p className="timer is-noclock" role="img" aria-label={t('noClockLabel')}>
      <span className="timer-flaps" aria-hidden="true">
        <span className="flap">⌛</span>
      </span>
      {/* Порожня смужка тримає висоту табло зі смужкою часу. */}
      {bar && <span className="timer-bar" aria-hidden="true" />}
    </p>
  );
}

/** Обгортка запитання на телефоні: однакова для всіх, з дебафом додає класи, шари й банер. */
export function DebuffZone({
  debuff,
  limitMs,
  offsetMs,
  questionIndex,
  children,
}: {
  debuff: Debuff;
  limitMs: number | null;
  offsetMs: number;
  /** Ключ запитання: стан шарів скидається з новим запитанням. */
  questionIndex: number;
  children: ReactNode;
}) {
  const kind = debuff?.kind ?? null;
  // Хто наслав: нікнейм покупця; null — ведучий або покупця вилучено.
  const by = debuff?.by ?? null;
  const freezeFor = freezeMs(limitMs);
  const marks =
    kind === 'freeze'
      ? [BANNER_MS, freezeFor / 3, (freezeFor * 2) / 3, freezeFor - CRUMBLE_MS, freezeFor].sort((a, b) => a - b)
      : [BANNER_MS];
  const elapsed = useElapsed(debuff?.since ?? null, marks, offsetMs);
  const calm = kind !== null && reducedMotion();
  const shakeSince = kind === 'shake' ? (debuff?.since ?? null) : null;
  useShakeBuzz(kind === 'shake', shakeSince, offsetMs);
  // Фаза на мить спрацювання: CSS-поштовх іде в такт із вібрацією, перемальовування його не зсувають.
  const phase = useMemo(() => (shakeSince === null ? null : shakePhase(shakeSince, offsetMs)), [shakeSince, offsetMs]);
  const zoneRef = useRef<HTMLDivElement>(null);
  const sticky = useSticky(kind === 'sticky', questionIndex);

  const banner = elapsed !== null && kind !== null && elapsed < BANNER_MS;
  const frozen = kind === 'freeze' && elapsed !== null && elapsed < freezeFor;
  const iceStage =
    elapsed === null ? 0 : elapsed < freezeFor / 3 ? 0 : elapsed < (freezeFor * 2) / 3 ? 1 : elapsed < freezeFor - CRUMBLE_MS ? 2 : 3;
  const tip = kind !== null ? TIPS[kind] : undefined;

  const className = ['debuff-zone', kind !== null && `is-${kind}`, calm && 'is-calm'].filter(Boolean).join(' ');
  const style =
    phase !== null
      ? ({ '--shake-cycle': `${SHAKE_CYCLE_MS}ms`, '--shake-phase': `${phase}ms` } as CSSProperties)
      : kind === 'torch'
        ? ({ '--torch-r': `${TORCH_RADIUS_PX}px` } as CSSProperties)
        : undefined;
  // «Ліхтарик»: світло йде за пальцем; координати пишуться прямо в стиль зони, без перемальовувань.
  const light = (event: PointerEvent<HTMLDivElement>) => {
    const el = zoneRef.current;
    if (el === null) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--tx', `${Math.round(event.clientX - rect.left)}px`);
    el.style.setProperty('--ty', `${Math.round(event.clientY - rect.top)}px`);
  };
  return (
    <div
      ref={zoneRef}
      className={className}
      data-debuff={kind ?? undefined}
      style={style}
      onPointerDown={kind === 'torch' ? light : undefined}
      onPointerMove={kind === 'torch' ? light : undefined}
    >
      <fieldset className="debuff-content" disabled={frozen} onClickCapture={sticky.onClickCapture}>
        {children}
      </fieldset>
      {frozen && <Ice stage={iceStage} />}
      {kind === 'torch' && <div className="debuff-layer debuff-torch" aria-hidden="true" />}
      {kind === 'bubbles' && <BubblesLayer key={questionIndex} seed={questionIndex} calm={calm} />}
      {sticky.shown && (
        <p className="sticky-note" role="status">
          {t('stickyNote')}
        </p>
      )}
      {kind === 'fog' && <FogLayer key={questionIndex} zone={zoneRef} />}
      {kind === 'mud' && <MudLayer key={questionIndex} zone={zoneRef} seed={questionIndex} />}
      {kind === 'guests' &&
        GUESTS.map((emoji, i) => (
          <span
            key={`${questionIndex}-${i}`}
            className="debuff-layer debuff-guest"
            aria-hidden="true"
            style={
              {
                '--lane': `${((questionIndex * 37 + i * 23) % 70) + 5}%`,
                '--spot': `${((questionIndex * 17 + i * 29) % 70) + 5}%`,
                '--delay': `${(i * 1.3 + (questionIndex % 3) * 0.4).toFixed(1)}s`,
              } as CSSProperties
            }
          >
            {emoji}
          </span>
        ))}
      {banner && kind !== null && (
        <p className="debuff-banner" role="status">
          <strong>{by !== null ? t('debuffCastBy', { by, name: debuffName(kind) }) : t('debuffCast', { name: debuffName(kind) })}</strong>
          {tip !== undefined && <span>{t(tip)}</span>}
        </p>
      )}
    </div>
  );
}

/** Команда: ефект дебафа лише на телефоні того, хто відповідає; решта команди бачить смугу (answerer — відповідає не капітан, 12g). */
export function DebuffStrip({ debuff, answerer = false }: { debuff: NonNullable<Debuff>; answerer?: boolean }) {
  return (
    <p className="team-debuff-strip" role="status">
      {t(answerer ? 'teamAnswererDebuff' : 'teamCaptainDebuff', { name: debuffName(debuff.kind) })}
    </p>
  );
}
