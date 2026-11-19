import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n';
import { STATUS_TEXT, timerFace, type TimerInput } from './Timer';

export type StickySize = 'phone' | 'host';

interface StickyContext {
  report: (id: number, input: TimerInput | null) => void;
}

const Sticky = createContext<StickyContext | null>(null);

/** Порядкові номери табло: менший — старше табло (основне табло запитання). */
let nextTimerId = 0;

/**
 * Смужка з часом угорі екрана, поки табло запитання прокручене вище екрана (55).
 * Табло всередині самі повідомляють, чи їх сховано; смужка показує найстарше сховане.
 */
export function StickyTimerProvider({ size, children }: { size: StickySize; children: ReactNode }) {
  const [hidden, setHidden] = useState<ReadonlyMap<number, TimerInput>>(() => new Map());
  const report = useCallback((id: number, input: TimerInput | null) => {
    setHidden((prev) => {
      if (input === null && !prev.has(id)) return prev;
      const next = new Map(prev);
      if (input === null) next.delete(id);
      else next.set(id, input);
      return next;
    });
  }, []);
  const value = useMemo(() => ({ report }), [report]);
  let oldest: number | null = null;
  for (const id of hidden.keys()) if (oldest === null || id < oldest) oldest = id;
  return (
    <Sticky.Provider value={value}>
      {children}
      {oldest !== null && createPortal(<StickyStrip size={size} input={hidden.get(oldest)!} />, document.body)}
    </Sticky.Provider>
  );
}

/** Викликає Timer. Поза провайдером — нічого (жодного IntersectionObserver). */
export function useStickyTimer(element: HTMLElement | null, input: TimerInput): void {
  const sticky = useContext(Sticky);
  const [id] = useState(() => ++nextTimerId);
  const [above, setAbove] = useState(false);

  useEffect(() => {
    if (sticky === null || element === null || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry === undefined) return;
        // Лише табло вище екрана: нижче екрана воно ще попереду, смужка не потрібна.
        setAbove(!entry.isIntersecting && entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? 0));
      },
      { threshold: 0 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      setAbove(false);
    };
  }, [sticky, element]);

  const { endsAt, remainingMs } = input.view;
  const { offsetMs, total, status, leadMs } = input;
  const shown = sticky !== null && element !== null && above;
  useEffect(() => {
    if (!shown || sticky === null) return;
    sticky.report(id, { view: { endsAt, remainingMs }, offsetMs, total, status, leadMs });
    return () => sticky.report(id, null);
    // Лише примітиви: щотіковий рендер табло реєстр не смикає.
  }, [sticky, id, shown, endsAt, remainingMs, offsetMs, total, status, leadMs]);
}

/** 40 px угорі: секунди, стан і смужка з тієї самої timerFace, що й табло; рахує час сама. */
function StickyStrip({ size, input }: { size: StickySize; input: TimerInput }) {
  const [, setTick] = useState(0);
  const endsAt = input.view.endsAt;
  useEffect(() => {
    if (endsAt === null) return;
    const id = setInterval(() => setTick((tick) => tick + 1), 200);
    return () => clearInterval(id);
  }, [endsAt]);

  const face = timerFace(input, Date.now());
  if (face === null) return null;
  const className = 'timer-sticky' + (size === 'host' ? ' is-host' : '') + (face.ending ? ' is-ending' : '');
  return (
    <div className={className} aria-hidden="true">
      <div className="timer-sticky-row">
        <span className="timer-sticky-left" dir="ltr">
          {t('timerLeft', { seconds: face.seconds })}
        </span>
        {face.status !== null && <span className="timer-sticky-status">{t(STATUS_TEXT[face.status])}</span>}
      </div>
      {face.pct !== null && (
        <span className="timer-sticky-bar">
          <span style={{ width: `${face.pct}%` }} />
        </span>
      )}
    </div>
  );
}
