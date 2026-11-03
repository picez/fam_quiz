import type { JSX, ReactNode } from 'react';

// Власні мотиви «Кривавого місяця»: лише CSS-градієнт та inline SVG, жодних картинок і чужого арту.
// Усе декоративне: aria-hidden, svg ще й focusable="false", тексту немає.

/** Світний місяць у шапці/героях: div.moon.moon-hero (фоном у грі — .game-bg::before, не компонент). */
export function BloodMoon(): JSX.Element {
  return <div className="moon moon-hero" aria-hidden="true" />;
}

/**
 * Силует ворона знизу в польоті (48 × 24): широкі пологі крила з чотирма розчепіреними
 * першорядними пір'їнами («пальцями»), мала голова з дзьобом уперед, клиноподібний хвіст.
 */
const CROW =
  'M24 1.4L25 3.4L26.4 4.6L26.7 6.6Q33 4 43 6.8L47.8 8.2L44.4 9.6L47.6 10.6L44 11.8L46.6 13L43 13.6L44.8 15.2L41 15.2Q36 17.8 28.6 15.4L27.2 16.6L29 21L24 23.4L19 21L20.8 16.6L19.4 15.4Q12 17.8 7 15.2L3.2 15.2L5 13.6L1.4 13L4 11.8L0.4 10.6L3.6 9.6L0.2 8.2L5 6.8Q15 4 21.3 6.6L21.6 4.6L23 3.4L24 1.4Z';

/** 2–3 власні силуети воронів в одному svg.crows. */
export function Crows(): JSX.Element {
  return (
    <svg className="crows" viewBox="0 0 120 70" aria-hidden="true" focusable="false">
      <path className="crow" d={CROW} transform="translate(62 4) rotate(-6 24 11) scale(1.05)" />
      <path className="crow" d={CROW} transform="translate(14 28) rotate(5 24 11) scale(0.75)" />
      <path className="crow" d={CROW} transform="translate(78 48) rotate(-3 24 11) scale(0.5)" />
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
