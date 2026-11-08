import { useEffect, useRef, useState, type JSX } from 'react';
import { reducedMotion } from '../motion';
import type { TrophyEngine } from './engine-types';
import { loadTrophyEngine, webglAvailable } from './loadEngine';
import { MATERIAL_LOOK, TROPHY_EMOJI, trophyLabel, type TrophyLook } from './trophy-meta';

export interface TrophyViewProps {
  trophy: TrophyLook;
  size: 'stage' | 'phone' | 'card' | 'view';
  spin: boolean;
  interactive: boolean;
}

/**
 * 3D-трофей (рушій на three.js) у кольорі матеріалу з оформленням decor. Спершу (до першого кадру, після збою моделі
 * чи втрати контексту, без WebGL чи коли чанк рушія не завантажився) — значок-емодзі; полотно кладе рушій у цей div.
 */
export function TrophyView({ trophy, size, spin, interactive }: TrophyViewProps): JSX.Element {
  const [engine, setEngine] = useState<TrophyEngine | null>(null);
  // Значок стоїть, доки рушій не намалював перший кадр; збій повертає його.
  const [loaded, setLoaded] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const label = trophyLabel(trophy);
  const look = MATERIAL_LOOK[trophy.material];
  // Поверхні передають новий об'єкт trophy на кожне оновлення: перемонтовуємо лише за зміною вигляду.
  const lookKey = JSON.stringify(trophy);

  useEffect(() => {
    if (!webglAvailable()) return;
    let live = true;
    void loadTrophyEngine().then((loadedEngine) => {
      if (live && loadedEngine !== null) setEngine(loadedEngine);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const box = holder.current;
    if (engine === null || box === null) return;
    let live = true;
    const handle = engine.mount(
      box,
      { look: JSON.parse(lookKey) as TrophyLook, size, spin: spin && !reducedMotion(), interactive, label },
      {
        onReady: () => {
          if (live) setLoaded(true);
        },
        onError: () => {
          if (live) setLoaded(false);
        },
      },
    );
    return () => {
      live = false;
      handle.dispose();
      setLoaded(false);
    };
  }, [engine, lookKey, size, spin, interactive, label]);

  return (
    <div className={`trophy trophy-${size}${loaded ? '' : ' is-loading'}`} ref={holder}>
      {!loaded && (
        <span className="trophy-fallback" role="img" aria-label={label} style={{ color: look.color }}>
          {TROPHY_EMOJI[trophy.kind]}
        </span>
      )}
    </div>
  );
}
