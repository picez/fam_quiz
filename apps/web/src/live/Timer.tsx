import { useEffect, useState } from 'react';
import { secondsLeft } from '../clock';
import { t } from '../i18n';

export type TimerStatus = 'paused' | 'held' | null;

/** Чому годинник стоїть: пауза гри або відповідь, що чекає на ведучого. */
export function timerStatus(view: { paused: boolean; held: boolean }): TimerStatus {
  return view.paused ? 'paused' : view.held ? 'held' : null;
}

interface Props {
  view: { endsAt: number | null; remainingMs: number | null };
  offsetMs: number;
  /** Повний час, мс; з ним видно «/ 60 с» і смужку. */
  total?: number | null;
  status?: TimerStatus;
}

/** Табло відліку: кожна цифра на окремій пластині. */
export function Timer({ view, offsetMs, total = null, status = null }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const running = view.endsAt !== null;

  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [running, view.endsAt]);

  const seconds = secondsLeft(view, offsetMs, now);
  if (seconds === null) return null;
  const pct = total === null ? 0 : Math.min(100, Math.max(0, ((seconds * 1000) / total) * 100));
  const totalText = total === null ? '' : t('timerOf', { seconds: Math.round(total / 1000) });
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
            <span className="timer-status">{t(status === 'paused' ? 'timerPaused' : 'timerHeld')}</span>
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
