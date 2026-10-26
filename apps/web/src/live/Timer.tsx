import { useEffect, useState } from 'react';
import { secondsLeft } from '../clock';
import { t } from '../i18n';

export type TimerStatus = 'paused' | 'held' | 'heldAuto' | 'listening' | null;

/** Чому годинник стоїть: пауза гри або відповідь, що чекає на ведучого (у грі без ведучого — на перевірку за ключем). */
export function timerStatus(view: { paused: boolean; held: boolean; autopilot?: boolean }): TimerStatus {
  return view.paused ? 'paused' : view.held ? (view.autopilot === true ? 'heldAuto' : 'held') : null;
}

const STATUS_TEXT = { paused: 'timerPaused', listening: 'timerListening', held: 'timerHeld', heldAuto: 'timerHeldAuto' } as const;

interface Props {
  view: { endsAt: number | null; remainingMs: number | null };
  offsetMs: number;
  /** Повний час, мс; з ним видно «/ 60 с» і смужку. */
  total?: number | null;
  status?: TimerStatus;
  /** На скільки мс довший фрагмент відкладає відлік: поки фрагмент грає, табло стоїть на повному часі запитання. */
  leadMs?: number;
}

/** Табло відліку: кожна цифра на окремій пластині. */
export function Timer({ view, offsetMs, total = null, status: given = null, leadMs = 0 }: Props) {
  // Стан лише будить перемальовування; час читається під час кожного рендера,
  // тож перемальовування з іншої причини (зсув годинника) не показує застарілий відлік.
  const [, setTick] = useState(0);
  const running = view.endsAt !== null;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((tick) => tick + 1), 200);
    return () => clearInterval(id);
  }, [running, view.endsAt]);

  const left = secondsLeft(view, offsetMs, Date.now());
  if (left === null) return null;
  // Повний час запитання без фрагмента, що ще грає: відлік іде саме від нього.
  const whole = total === null ? null : total - leadMs;
  const listening = whole !== null && leadMs > 0 && left * 1000 > whole;
  // Не більше за повний час: «31 / 30 с» не буває.
  const seconds = whole === null ? left : Math.min(left, Math.ceil(whole / 1000));
  const pct = whole === null || whole <= 0 ? 0 : Math.min(100, Math.max(0, ((seconds * 1000) / whole) * 100));
  const totalText = whole === null ? '' : t('timerOf', { seconds: Math.round(whole / 1000) });
  // Пауза й утримання важливіші за «Слухайте».
  const status: TimerStatus = given ?? (listening ? 'listening' : null);
  return (
    <div className="timer" role="timer" aria-label={String(seconds)}>
      <span className="timer-flaps">
        {String(seconds)
          .padStart(2, '0')
          .split('')
          .map((digit, index) => (
            <span className="flap" key={index} aria-hidden="true">
              {digit}
            </span>
          ))}
      </span>
      {/* Стан стає на місце «/ 30 с». Невидимі ::before і ::after завжди тримають місце під обидва написи,
          тож табло однакове й без стану, і зі станом: екран не стрибає. */}
      {(total !== null || status !== null) && (
        <span className="timer-label" data-held={t('timerHeld')} data-total={totalText}>
          {status !== null ? (
            <span className="timer-status">{t(STATUS_TEXT[status])}</span>
          ) : (
            <span className="timer-total">{totalText}</span>
          )}
        </span>
      )}
      {total !== null && (
        <span className="timer-bar" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </span>
      )}
    </div>
  );
}

/**
 * true, коли час уже вийшов: endsAt у минулому за годинником сервера (той самий offsetMs, що й у Timer)
 * або на паузі не лишилося ні мілісекунди. Перемикається таймером, без щосекундних перемальовувань.
 */
export function useTimeOver(endsAt: number | null, remainingMs: number | null, offsetMs: number): boolean {
  const passed = () => (remainingMs !== null ? remainingMs <= 0 : endsAt !== null && endsAt <= Date.now() + offsetMs);
  const [over, setOver] = useState(passed);
  useEffect(() => {
    setOver(passed());
    if (remainingMs !== null || endsAt === null) return;
    const left = endsAt - (Date.now() + offsetMs);
    if (left <= 0) return;
    const id = setTimeout(() => setOver(true), left);
    return () => clearTimeout(id);
    // passed читає лише ці три значення.
  }, [endsAt, remainingMs, offsetMs]);
  return over;
}
