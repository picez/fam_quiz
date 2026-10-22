import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { DebuffKind, PlayerView, PublicQuestion } from '@quiz/shared';
import { debuffName } from '../debuff-meta';
import { t, type TextKey } from '../i18n';
import { reducedMotion } from '../motion';

type Debuff = PlayerView['me']['debuff'];

/** Скільки висить банер «На вас наслано: …» від спрацювання, мс. */
export const BANNER_MS = 3000;
/** Як часто «Дзеркало» зсуває варіанти по колу, мс. */
export const MIRROR_SWAP_MS = 4000;
const FREEZE_MS = 5000;
/** Останні мілісекунди заморозки лід розсипається. */
const CRUMBLE_MS = 400;
const GUESTS = ['🐞', '🐈', '🐕', '🐞'];
const TIPS: Partial<Record<DebuffKind, TextKey>> = { fog: 'debuffTip_fog', mud: 'debuffTip_mud', freeze: 'debuffTip_freeze' };

/** 5000 мс, але не більше половини часу запитання; без таймера — 5000. */
export function freezeMs(limitMs: number | null): number {
  return limitMs === null ? FREEZE_MS : Math.min(FREEZE_MS, Math.floor(limitMs / 2));
}

/** Зсув варіантів по колу на step позицій (лише single/multi; інші типи без змін). */
export function rotateChoices(question: PublicQuestion, step: number): PublicQuestion {
  if (question.type !== 'single' && question.type !== 'multi') return question;
  const n = question.choices.length;
  const k = n === 0 ? 0 : ((step % n) + n) % n;
  if (k === 0) return question;
  return { ...question, choices: [...question.choices.slice(k), ...question.choices.slice(0, k)] };
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
  const freezeFor = freezeMs(limitMs);
  const marks =
    kind === 'freeze'
      ? [BANNER_MS, freezeFor / 3, (freezeFor * 2) / 3, freezeFor - CRUMBLE_MS, freezeFor].sort((a, b) => a - b)
      : [BANNER_MS];
  const elapsed = useElapsed(debuff?.since ?? null, marks, offsetMs);
  const calm = kind !== null && reducedMotion();

  const banner = elapsed !== null && kind !== null && elapsed < BANNER_MS;
  const frozen = kind === 'freeze' && elapsed !== null && elapsed < freezeFor;
  const iceStage =
    elapsed === null ? 0 : elapsed < freezeFor / 3 ? 0 : elapsed < (freezeFor * 2) / 3 ? 1 : elapsed < freezeFor - CRUMBLE_MS ? 2 : 3;
  const tip = kind !== null ? TIPS[kind] : undefined;

  const className = ['debuff-zone', kind !== null && `is-${kind}`, calm && 'is-calm'].filter(Boolean).join(' ');
  return (
    <div className={className} data-debuff={kind ?? undefined}>
      <fieldset className="debuff-content" disabled={frozen}>
        {children}
      </fieldset>
      {frozen && <Ice stage={iceStage} />}
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
          <strong>{t('debuffCast', { name: debuffName(kind) })}</strong>
          {tip !== undefined && <span>{t(tip)}</span>}
        </p>
      )}
    </div>
  );
}
