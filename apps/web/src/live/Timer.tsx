import { useEffect, useState } from 'react';
import { secondsLeft } from '../clock';

interface Props {
  view: { endsAt: number | null; remainingMs: number | null };
  offsetMs: number;
}

/** Табло відліку: кожна цифра на окремій пластині. */
export function Timer({ view, offsetMs }: Props) {
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
  return (
    <div className="timer" role="timer" aria-label={String(seconds)}>
      {String(seconds)
        .padStart(2, '0')
        .split('')
        .map((digit, index) => (
          <span className="flap" key={index} aria-hidden="true">
            {digit}
          </span>
        ))}
    </div>
  );
}
