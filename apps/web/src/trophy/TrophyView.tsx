import { useEffect, useRef, useState, type JSX } from 'react';
import { reducedMotion } from '../motion';
import { loadViewer, webglAvailable } from './loadViewer';
import { MATERIAL_LOOK, TROPHY_EMOJI, trophyLabel, type TrophyLook } from './trophy-meta';

interface PbrSetters {
  setBaseColorFactor(color: string): void;
  setMetallicFactor(value: number): void;
  setRoughnessFactor(value: number): void;
}
/** Те, що TrophyView бере в model-viewer після load (без типів бібліотеки: її знає лише loadViewer.ts). */
type ViewerElement = HTMLElement & { model?: { materials: { pbrMetallicRoughness: PbrSetters }[] } };

export interface TrophyViewProps {
  trophy: TrophyLook;
  size: 'stage' | 'phone' | 'card';
  spin: boolean;
  interactive: boolean;
}

/**
 * 3D-трофей у кольорі матеріалу. Спершу (і без WebGL чи коли модуль не завантажився) — значок-емодзі;
 * model-viewer створюється імперативно в ref, щойно ліниво завантажений модуль готовий.
 */
export function TrophyView({ trophy, size, spin, interactive }: TrophyViewProps): JSX.Element {
  const [ready, setReady] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const label = trophyLabel(trophy);
  const look = MATERIAL_LOOK[trophy.material];

  useEffect(() => {
    if (!webglAvailable()) return;
    let live = true;
    void loadViewer().then((ok) => {
      if (live && ok) setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const box = holder.current;
    if (!ready || box === null) return;
    const viewer = document.createElement('model-viewer') as ViewerElement;
    viewer.setAttribute('src', `/models/${trophy.kind}.glb`);
    viewer.setAttribute('alt', label);
    viewer.setAttribute('disable-zoom', '');
    viewer.setAttribute('interaction-prompt', 'none');
    viewer.setAttribute('shadow-intensity', '0.6');
    if (spin && !reducedMotion()) viewer.setAttribute('auto-rotate', '');
    if (interactive) viewer.setAttribute('camera-controls', '');
    viewer.className = 'trophy-model';
    const paint = () => {
      for (const material of viewer.model?.materials ?? []) {
        material.pbrMetallicRoughness.setBaseColorFactor(look.color);
        material.pbrMetallicRoughness.setMetallicFactor(look.metallic);
        material.pbrMetallicRoughness.setRoughnessFactor(look.roughness);
      }
    };
    viewer.addEventListener('load', paint);
    box.append(viewer);
    return () => {
      viewer.removeEventListener('load', paint);
      viewer.remove();
    };
  }, [ready, trophy.kind, label, look, spin, interactive]);

  return (
    <div className={`trophy trophy-${size}`} ref={holder}>
      {!ready && (
        <span className="trophy-fallback" role="img" aria-label={label} style={{ color: look.color }}>
          {TROPHY_EMOJI[trophy.kind]}
        </span>
      )}
    </div>
  );
}
