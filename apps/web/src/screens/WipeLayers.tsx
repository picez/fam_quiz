import { useEffect, useRef, useState, type RefObject } from 'react';
import { FOG_COLS, FOG_ROWS, fullFog, splatsFor, useWipe, wipeFog, wipeSplats } from './wipe';

const BLOB =
  'M52 6 C64 4 70 16 80 18 C92 20 97 34 92 46 C88 56 98 66 90 78 C82 90 68 86 58 94 C48 100 36 92 28 86 C16 80 4 74 6 60 C8 50 2 40 8 30 C14 18 26 20 34 12 C40 6 46 8 52 6 Z';

/**
 * Туман над запитанням: розмиття з молочним тлом. Клітинки сітки під пальцем очищаються назавжди;
 * маска — крихітний canvas FOG_COLS × FOG_ROWS, розтягнутий на шар (м'які краї дає масштабування).
 * Шар не ловить дотиків (.debuff-layer), стирання слухає сама зона.
 */
export function FogLayer({ zone }: { zone: RefObject<HTMLElement | null> }) {
  const [grid, setGrid] = useState(fullFog);
  const layer = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  useWipe(zone, (x, y) => setGrid((g) => wipeFog(g, x, y)));

  const cleared = grid.reduce((n, fog) => (fog ? n : n + 1), 0);
  useEffect(() => {
    if (cleared === 0) return;
    // Маска оновлюється не частіше за кадр: нова зміна скасовує ще не намальований кадр.
    const frame = requestAnimationFrame(() => {
      const el = layer.current;
      if (el === null) return;
      canvas.current ??= Object.assign(document.createElement('canvas'), { width: FOG_COLS, height: FOG_ROWS });
      const ctx = canvas.current.getContext('2d');
      if (ctx === null) return; // без canvas шар лишається суцільним
      ctx.clearRect(0, 0, FOG_COLS, FOG_ROWS);
      ctx.fillStyle = '#fff';
      grid.forEach((fog, i) => {
        if (fog) ctx.fillRect(i % FOG_COLS, Math.floor(i / FOG_COLS), 1, 1);
      });
      const url = `url(${canvas.current.toDataURL()})`;
      el.style.setProperty('mask-image', url);
      el.style.setProperty('-webkit-mask-image', url);
    });
    return () => cancelAnimationFrame(frame);
  }, [grid, cleared]);

  return <div ref={layer} className="debuff-layer debuff-fog" data-cleared={cleared} aria-hidden="true" />;
}

/** Бруд: 6 плям у стабільних для запитання місцях; кожен рух пальця над плямою зменшує її на 0.2. */
export function MudLayer({ zone, seed }: { zone: RefObject<HTMLElement | null>; seed: number }) {
  const [splats, setSplats] = useState(() => splatsFor(seed));
  useWipe(zone, (x, y) => setSplats((s) => wipeSplats(s, x, y)));
  return (
    <>
      {splats.map((s) => (
        <svg
          key={s.id}
          className="debuff-layer debuff-splat"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
          style={{
            left: `${(s.x - s.size / 2) * 100}%`,
            top: `${(s.y - s.size / 2) * 100}%`,
            width: `${s.size * 100}%`,
            height: `${s.size * 100}%`,
            opacity: s.left,
          }}
        >
          <path d={BLOB} />
        </svg>
      ))}
    </>
  );
}
