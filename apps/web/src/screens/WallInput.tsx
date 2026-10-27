import { useEffect, useRef, useState } from 'react';
import type { PlayerWall, PublicQuestion, PublicWall } from '@quiz/shared';
import { errorText, t } from '../i18n';
import { reducedMotion } from '../motion';
import type { Send } from '../live/types';
import { WallGrid } from './WallGrid';
import type { DraftInput } from './TeamWatch';

const SHAKE_MS = 400;

/** Стіна на телефоні: дотик вибирає плитку, «Перевірити» надсилає позиції; помилки — кружечками. */
export function WallInput({
  question,
  wall,
  paused,
  send,
  onDraft,
}: {
  question: PublicQuestion & { wall: PublicWall };
  wall: PlayerWall;
  paused: boolean;
  send: Send;
  /** Живий вибір (12b): виділені плитки до «Перевірити»; жодної — null. */
  onDraft?: DraftInput;
}) {
  const size = question.wall.size;
  const [selected, setSelected] = useState<number[]>([]);
  const [shake, setShake] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const sentRef = useRef<number[]>([]);
  // Поточний вибір для відповіді сервера, що приходить пізніше.
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const draftRef = useRef(onDraft);
  draftRef.current = onDraft;
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prev = useRef({ mistakes: wall.mistakes, found: wall.found.length });

  // Нова помилка трусить вибране й знімає вибір; знайдена група теж знімає. Перезавантаження з наявним станом — ні.
  useEffect(() => {
    const before = prev.current;
    prev.current = { mistakes: wall.mistakes, found: wall.found.length };
    if (wall.mistakes > before.mistakes) {
      // Трусимо останній надісланий набір: поточного вибору гравець міг уже торкнутися.
      const hit = sentRef.current;
      setSelected([]);
      setError(null);
      if (reducedMotion() || hit.length === 0) return;
      setShake(hit);
      if (shakeTimer.current !== null) clearTimeout(shakeTimer.current);
      shakeTimer.current = setTimeout(() => {
        shakeTimer.current = null;
        setShake([]);
      }, SHAKE_MS);
    }
    if (wall.found.length > before.found) {
      setSelected([]);
      setError(null);
    }
  }, [wall.mistakes, wall.found.length]);

  useEffect(
    () => () => {
      if (shakeTimer.current !== null) clearTimeout(shakeTimer.current);
    },
    [],
  );

  const ended = wall.locked || wall.solved;
  const off = paused || !wall.canGuess || ended;

  // Наступний вибір рахуємо із замикання, а не функційним setSelected: onDraft має отримати те саме значення,
  // що й екран, а побічна дія всередині оновлювача стану (StrictMode викликає його двічі) надіслала б його двічі.
  const toggle = (position: number) => {
    if (off) return;
    setError(null);
    const next = selected.includes(position) ? selected.filter((p) => p !== position) : selected.length >= size ? selected : [...selected, position];
    if (next === selected) return;
    setSelected(next);
    onDraft?.(next.length === 0 ? null : { type: 'wallPick', tiles: next });
  };

  const check = () => {
    if (off || pending || selected.length !== size) return;
    setPending(true);
    sentRef.current = selected;
    onDraft?.cancel?.();
    void send('player:wall', { tiles: selected })
      .then((result) => {
        setError(result.ok ? null : errorText(result.error));
        // Сервер не взяв спробу: вибір лишився — пульт знову бачить його як чернетку.
        const current = selectedRef.current;
        if (!result.ok && current.length > 0) draftRef.current?.({ type: 'wallPick', tiles: current });
      })
      .catch(() => setError(errorText('network')))
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
