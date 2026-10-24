import { useEffect, useRef, useState } from 'react';
import type { PlayerWall, PublicQuestion, PublicWall } from '@quiz/shared';
import { errorText, t } from '../i18n';
import { reducedMotion } from '../motion';
import type { Send } from '../live/types';
import { WallGrid } from './WallGrid';

const SHAKE_MS = 400;

/** Стіна на телефоні: дотик вибирає плитку, «Перевірити» надсилає позиції; помилки — кружечками. */
export function WallInput({
  question,
  wall,
  paused,
  send,
}: {
  question: PublicQuestion & { wall: PublicWall };
  wall: PlayerWall;
  paused: boolean;
  send: Send;
}) {
  const size = question.wall.size;
  const [selected, setSelected] = useState<number[]>([]);
  const [shake, setShake] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const prev = useRef({ mistakes: wall.mistakes, found: wall.found.length });

  // Нова помилка трусить вибране й знімає вибір; знайдена група теж знімає. Перезавантаження з наявним станом — ні.
  useEffect(() => {
    const before = prev.current;
    prev.current = { mistakes: wall.mistakes, found: wall.found.length };
    if (wall.mistakes > before.mistakes) {
      const hit = selectedRef.current;
      setSelected([]);
      setError(null);
      if (reducedMotion() || hit.length === 0) return;
      setShake(hit);
      const id = setTimeout(() => setShake([]), SHAKE_MS);
      return () => clearTimeout(id);
    }
    if (wall.found.length > before.found) {
      setSelected([]);
      setError(null);
    }
  }, [wall.mistakes, wall.found.length]);

  const ended = wall.locked || wall.solved;
  const off = paused || !wall.canGuess || ended;

  const toggle = (position: number) => {
    if (off) return;
    setError(null);
    setSelected((now) => (now.includes(position) ? now.filter((p) => p !== position) : now.length >= size ? now : [...now, position]));
  };

  const check = () => {
    if (off || pending || selected.length !== size) return;
    setPending(true);
    void send('player:wall', { tiles: selected })
      .then((result) => setError(result.ok ? null : errorText(result.error)))
      .finally(() => setPending(false));
  };

  return (
    <section className="wall-play">
      <WallGrid wall={question.wall} found={wall.found} selected={selected} onToggle={toggle} shake={shake} disabled={off} />
      <span className="wall-mistakes" role="img" aria-label={t('wallMistakes', { used: wall.mistakes, max: wall.maxMistakes })}>
        {Array.from({ length: wall.maxMistakes }, (_, index) => (
          <span key={index} className={index < wall.mistakes ? 'wall-dot is-used' : 'wall-dot'} aria-hidden="true" />
        ))}
      </span>
      {wall.locked ? (
        <p className="lead wall-end" role="status">
          {t('wallLocked', { found: wall.found.length })}
        </p>
      ) : wall.solved ? (
        <p className="lead wall-end" role="status">
          {t('wallSolved')}
        </p>
      ) : (
        <>
          <p className="meta wall-picked">{t('wallPicked', { picked: selected.length, size })}</p>
          <button type="button" className="btn btn-primary" disabled={off || pending || selected.length !== size} onClick={check}>
            {t('wallCheck')}
          </button>
        </>
      )}
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
