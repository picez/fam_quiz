import type { PhotoFrame } from '@quiz/shared';
import type { JSX, ReactNode } from 'react';
import { CLOUD_PATH, CROW_PATH, TomoeRing } from '../motifs/Motifs';

/** Точка на колі r = 46 (viewBox -50 -50 100 100): кут у градусах від «12 годин» за годинниковою. */
function onRing(angle: number): [x: number, y: number] {
  const rad = (angle * Math.PI) / 180;
  return [Math.round(46 * Math.sin(rad) * 100) / 100, Math.round(-46 * Math.cos(rad) * 100) / 100];
}

const CLOUD_ANGLES = [0, 90, 180, 270];
const CROW_ANGLES = [-50, 0, 50];
const THORN_ANGLES = Array.from({ length: 12 }, (_, index) => index * 30);
// Серп: коло r = 8 з центром (0, -46) мінус коло r = 6.6 з центром (3, -48); одна фігура, без заливки кольором тла.
const CRESCENT = 'M7.48 -43.15A8 8 0 1 1 0.24 -54A6.6 6.6 0 1 0 7.48 -43.15Z';
const BOLT = 'M2.5-9L-3.5 1H-0.5L-2.5 9L4 -2.5H1Z';
const PETAL_ANGLES = Array.from({ length: 12 }, (_, index) => index * 30);
/** Хвиля (34): r = 46 + 2.2·sin(12θ), 96 точок, рахується один раз. */
const WAVE = (() => {
  const points = Array.from({ length: 96 }, (_, index) => {
    const theta = (index / 96) * 2 * Math.PI;
    const r = 46 + 2.2 * Math.sin(12 * theta);
    return `${Math.round(r * Math.sin(theta) * 100) / 100} ${Math.round(-r * Math.cos(theta) * 100) / 100}`;
  });
  return `M${points.join('L')}Z`;
})();
/** Сім зірок сузір'я (34): фіксовані кути й радіуси 44–47. */
const STARS = ([[-80, 45], [-35, 47], [10, 44], [60, 46], [115, 47], [170, 44], [230, 46]] as const).map(([angle, r]) => {
  const rad = (angle * Math.PI) / 180;
  return [Math.round(r * Math.sin(rad) * 100) / 100, Math.round(-r * Math.cos(rad) * 100) / 100] as const;
});

/** Декоративний svg-малюнок для восьми рамок з ілюстрацією; решта рамок — лише CSS. */
function FrameArt({ frame }: { frame: PhotoFrame }): JSX.Element | null {
  const svg = (children: ReactNode) => (
    <svg className="photo-frame-art" viewBox="-50 -50 100 100" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
  switch (frame) {
    case 'cloud':
      return svg(
        <>
          <circle className="pf-line" r="46" />
          {CLOUD_ANGLES.map((angle) => {
            const [x, y] = onRing(angle);
            return <path key={angle} className="pf-cloud" d={CLOUD_PATH} transform={`translate(${x} ${y}) scale(0.16) translate(-44 -57)`} />;
          })}
        </>,
      );
    case 'crows':
      return svg(
        <>
          <circle className="pf-line" r="46" />
          {CROW_ANGLES.map((angle) => {
            const [x, y] = onRing(angle);
            return <path key={angle} className="pf-crow" d={CROW_PATH} transform={`translate(${x} ${y}) rotate(${angle}) scale(0.34) translate(-24 -12)`} />;
          })}
        </>,
      );
    case 'thorns':
      return svg(
        <>
          <circle className="pf-line" r="46" />
          {THORN_ANGLES.map((angle) => (
            <path key={angle} className="pf-thorn" d={angle % 60 === 0 ? 'M-3 0L0-9L3 0Z' : 'M-2.4 0L0-5.5L2.4 0Z'} transform={`rotate(${angle}) translate(0 -46)`} />
          ))}
        </>,
      );
    case 'eclipse':
      return svg(
        <>
          <circle className="pf-line" r="46" />
          <path className="pf-moon" d={CRESCENT} />
        </>,
      );
    case 'storm':
      return svg(
        <>
          <circle className="pf-line" r="46" />
          {[45, 225].map((angle) => {
            const [x, y] = onRing(angle);
            return <path key={angle} className="pf-bolt" d={BOLT} transform={`translate(${x} ${y}) scale(0.8)`} />;
          })}
        </>,
      );
    case 'sunflowers':
      return svg(
        <>
          <circle className="pf-line" r="46" />
          {PETAL_ANGLES.map((angle) => (
            <ellipse key={angle} className="pf-petal" rx="3.2" ry="6" transform={`rotate(${angle}) translate(0 -46)`} />
          ))}
          {PETAL_ANGLES.map((angle) => {
            const [x, y] = onRing(angle + 15);
            return <circle key={angle} className="pf-seed" r="1.3" cx={x} cy={y} />;
          })}
        </>,
      );
    case 'waves':
      return svg(
        <>
          <circle className="pf-line" r="46" />
          <path className="pf-wave" d={WAVE} />
        </>,
      );
    case 'constellation':
      return svg(
        <>
          <circle className="pf-line" r="46" />
          <polyline className="pf-link" points={STARS.map(([x, y]) => `${x},${y}`).join(' ')} />
          {STARS.map(([x, y]) => (
            <circle key={`${x},${y}`} className="pf-star" r="1.8" cx={x} cy={y} />
          ))}
        </>,
      );
    default:
      return null;
  }
}

/**
 * Рамка навколо великого аватара. null → наявне кільце томое (шапка профілю не змінюється). Інакше span.photo-frame.photo-frame-<id>
 * того самого розміру, що .tomoe-ring: рамка CSS (градієнт, тінь) і для восьми — декоративний svg.
 */
export function AvatarFrame({ frame, children }: { frame: PhotoFrame | null; children: ReactNode }): JSX.Element {
  if (frame === null) return <TomoeRing>{children}</TomoeRing>;
  return (
    <span className={`photo-frame photo-frame-${frame}`}>
      <FrameArt frame={frame} />
      {children}
    </span>
  );
}
