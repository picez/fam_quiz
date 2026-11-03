import type { JSX, ReactNode } from 'react';

// Власні мотиви «Кривавого місяця»: лише CSS-градієнт та inline SVG, жодних картинок і чужого арту.
// Усе декоративне: aria-hidden, svg ще й focusable="false", тексту немає.

/** Світний місяць: div.moon.moon-{size}; hero — у шапці/героях, faint — фоном. */
export function BloodMoon({ size = 'hero' }: { size?: 'hero' | 'faint' }): JSX.Element {
  return <div className={`moon moon-${size}`} aria-hidden="true" />;
}

/** Силует ворона в польоті: крила вгору, голова з дзьобом, клиноподібний хвіст. Розмах ≈ 40 одиниць. */
const CROW =
  'M0 9C5 3 11 2 16 7l2 2 1-3 1-2 1 2 1 3 2-2c5-5 11-4 16 2-5-2-10-1-14 3l-1 3 2 4-3-1-2 2-2-2-3 1 2-4-1-3C10 8 5 7 0 9Z';

/** 2–3 власні силуети воронів в одному svg.crows. */
export function Crows(): JSX.Element {
  return (
    <svg className="crows" viewBox="0 0 120 70" aria-hidden="true" focusable="false">
      <path className="crow" d={CROW} transform="translate(64 6) scale(1.2)" />
      <path className="crow" d={CROW} transform="translate(18 26) scale(0.85)" />
      <path className="crow" d={CROW} transform="translate(78 46) scale(0.6)" />
    </svg>
  );
}

/** Хмаринка з п'яти горбів, що закручуються донизу. */
const CLOUD =
  'M20 70c-12 0-16-16-4-20 0-14 18-18 24-8 6-12 26-10 26 4 12-2 18 14 6 20 2 12-14 16-20 8-6 8-22 8-26 0-4 4-10 2-6-4z';

/** Хмаринка: svg.cloud-motif, заливка var(--accent), контур #fff. */
export function AkatsukiCloud({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      className={className === undefined ? 'cloud-motif' : `cloud-motif ${className}`}
      viewBox="0 26 88 62"
      aria-hidden="true"
      focusable="false"
    >
      <path d={CLOUD} />
    </svg>
  );
}

/** Томое: кругла голівка внизу й хвостик, що загинається вгору. */
const TOMOE = 'M5 0A5 5 0 1 1-5 0C-5-6-2-10-4-13 3-10 5-5 5 0Z';

/** span.tomoe-ring навколо children (аватар): SVG-кільце з трьома томое. */
export function TomoeRing({ children }: { children: ReactNode }): JSX.Element {
  return (
    <span className="tomoe-ring">
      <svg className="tomoe-ring-art" viewBox="-50 -50 100 100" aria-hidden="true" focusable="false">
        <circle className="tomoe-ring-line" r="46" />
        {[0, 120, 240].map((angle) => (
          <path key={angle} className="tomoe" d={TOMOE} transform={`rotate(${angle}) translate(0 -46) scale(0.9)`} />
        ))}
      </svg>
      {children}
    </span>
  );
}

/** section.motif-hero: місяць і ворони позаду children (вміст поверх, z-index). */
export function MotifHero({ children, className }: { children: ReactNode; className?: string }): JSX.Element {
  return (
    <section className={className === undefined ? 'motif-hero' : `motif-hero ${className}`}>
      <div className="motif-hero-art" aria-hidden="true">
        <BloodMoon />
        <Crows />
      </div>
      <div className="motif-hero-content">{children}</div>
    </section>
  );
}
