import { useEffect, useRef, useState } from 'react';
import type { DiceInfo, DiceRow } from '@quiz/shared';
import { t } from '../i18n';

/** Скільки крутиться кубик після кидка, мс. */
export const ROLL_MS = 1200;
const FACE_MS = 120;
const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * id гравців, чий кубик зараз крутиться: кількість кидків зросла після першого показу.
 * Перший показ (і перепідключення) не крутить; з reduce-motion завжди порожньо.
 */
export function useDiceSpin(rows: DiceRow[]): ReadonlySet<string> {
  const seen = useRef<Map<string, number> | null>(null);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const [spinning, setSpinning] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    const previous = seen.current;
    seen.current = new Map(rows.map((r) => [r.playerId, r.throws.length]));
    if (previous === null || reducedMotion()) return;
    const grown = rows.filter((r) => r.throws.length > (previous.get(r.playerId) ?? r.throws.length));
    for (const { playerId } of grown) {
      setSpinning((s) => new Set(s).add(playerId));
      const timer = setTimeout(() => {
        timers.current.delete(timer);
        setSpinning((s) => {
          const next = new Set(s);
          next.delete(playerId);
          return next;
        });
      }, ROLL_MS);
      timers.current.add(timer);
    }
  }, [rows]);

  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer);
      timers.current.clear();
    },
    [],
  );

  return spinning;
}

export function DicePanel({ dice, spinning, meId }: { dice: DiceInfo; spinning: ReadonlySet<string>; meId?: string }) {
  const [face, setFace] = useState(0);
  const anySpin = spinning.size > 0;
  useEffect(() => {
    if (!anySpin) return;
    const id = setInterval(() => setFace(Math.floor(Math.random() * 6)), FACE_MS);
    return () => clearInterval(id);
  }, [anySpin]);

  const names = dice.rows
    .filter((r) => r.waiting)
    .map((r) => r.nickname)
    .join(', ');
  const status = dice.done ? t('diceStatusDone') : names === '' ? '' : t(dice.tieBreak ? 'diceStatusTie' : 'diceStatusWaiting', { names });

  return (
    <div className="dice-panel">
      <p className="dice-status" role="status">
        {status}
      </p>
      <ul className="dice-rows">
        {dice.rows.map((r) => {
          const last = r.throws.length > 0 ? r.throws[r.throws.length - 1]! : null;
          const rolling = spinning.has(r.playerId);
          const classes = [r.playerId === meId ? 'is-me' : '', r.waiting ? 'is-waiting' : ''].filter(Boolean).join(' ');
          return (
            <li key={r.playerId} className={classes || undefined}>
              <span className="name">{r.nickname}</span>
              {r.throws.length > 1 && <span className="dice-throws">{`${r.throws.slice(0, -1).join(' · ')} →`}</span>}
              {last === null ? (
                <span className="die is-empty" />
              ) : rolling ? (
                <span className="die is-rolling" role="img" aria-label={t('diceLabel')}>
                  {FACES[face]}
                </span>
              ) : (
                <span className="die" role="img" aria-label={t('diceResult', { value: last })}>
                  {FACES[last - 1]}
                </span>
              )}
              <span className="dice-value">{last === null || rolling ? '' : last}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
