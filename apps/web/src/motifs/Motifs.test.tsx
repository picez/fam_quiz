// @vitest-environment jsdom
// Типів node у вебі немає (див. source-scan.test.ts).
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AkatsukiCloud, BloodMoon, Crows, MotifHero, TomoeRing } from './Motifs';

afterEach(cleanup);

describe('motifs', () => {
  it('the hero puts a decorative moon and crows behind content that stays reachable', () => {
    const { container } = render(
      <MotifHero>
        <p>Код</p>
      </MotifHero>,
    );
    const hero = container.querySelector('section.motif-hero')!;
    expect(hero).not.toBeNull();
    const moon = hero.querySelector('.moon')!;
    const crows = hero.querySelector('svg.crows')!;
    expect(moon.getAttribute('aria-hidden')).toBe('true');
    expect(crows.getAttribute('aria-hidden')).toBe('true');
    expect(crows.getAttribute('focusable')).toBe('false');
    expect(hero.querySelector('.motif-hero-art')?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText('Код')).toBeTruthy();
    expect(screen.getByText('Код').closest('.motif-hero-content')).not.toBeNull();
  });

  it('the moon comes in hero and faint sizes, hero by default', () => {
    const { container } = render(
      <>
        <BloodMoon />
        <BloodMoon size="faint" />
      </>,
    );
    const moons = [...container.querySelectorAll('div.moon')];
    expect(moons.map((moon) => moon.className)).toEqual(['moon moon-hero', 'moon moon-faint']);
  });

  it('draws two or three crows in one svg', () => {
    const { container } = render(<Crows />);
    const svgs = container.querySelectorAll('svg.crows');
    expect(svgs).toHaveLength(1);
    const count = svgs[0].querySelectorAll('.crow').length;
    expect(count).toBeGreaterThanOrEqual(2);
    expect(count).toBeLessThanOrEqual(3);
  });

  it('the tomoe ring wraps its child with an svg of three tomoe', () => {
    const { container } = render(
      <TomoeRing>
        <span>А</span>
      </TomoeRing>,
    );
    const ring = container.querySelector('span.tomoe-ring')!;
    expect(ring.contains(screen.getByText('А'))).toBe(true);
    const svg = ring.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
    expect(svg.querySelectorAll('.tomoe')).toHaveLength(3);
  });

  it('the cloud is a decorative svg and keeps an extra class', () => {
    const { container } = render(<AkatsukiCloud className="empty-cloud" />);
    const cloud = container.querySelector('svg.cloud-motif[aria-hidden="true"]')!;
    expect(cloud).not.toBeNull();
    expect(cloud.getAttribute('focusable')).toBe('false');
    expect(cloud.classList.contains('empty-cloud')).toBe(true);
  });

  it('uses no pictures: no <img and no url(', () => {
    // У jsdom import.meta.url не file://, тож шлях — від кореня, як у source-scan.test.ts.
    const src = ['apps/web/src', 'src'].find((path) => existsSync(path) as boolean)!;
    const source = readFileSync(`${src}/motifs/Motifs.tsx`, 'utf8') as string;
    expect(source).toContain('export function BloodMoon');
    expect(source).not.toContain('<img');
    expect(source).not.toContain('url(');
  });
});
