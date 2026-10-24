// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PinBoard, labelPlacement } from './PinBoard';

afterEach(cleanup);

const world = { map: 'world' as const, aspect: 2 };

describe('PinBoard', () => {
  it('draws the circles around the target in the longer-side scale, the star and the marks', () => {
    render(
      <PinBoard
        pin={world}
        imageUrl={null}
        target={{ x: 0.5, y: 0.5 }}
        radii={{ full: 3, zero: 15 }}
        marks={[
          { playerId: 'p1', nickname: 'Оля', x: 0.5, y: 0.5 },
          { playerId: 'p2', nickname: 'Петро', x: 0.51, y: 0.5 },
          { playerId: 'p3', nickname: 'Іра', x: 0.9, y: 0.1 },
        ]}
        highlight="p1"
      />,
    );
    const svg = document.querySelector('svg.pin-layer')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 1000 500');
    expect(document.querySelector('.pin-circle-full')!.getAttribute('r')).toBe('30');
    expect(document.querySelector('.pin-circle-zero')!.getAttribute('r')).toBe('150');
    expect(document.querySelector('.pin-circle-full')!.getAttribute('cx')).toBe('500');
    expect(document.querySelector('.pin-circle-full')!.getAttribute('cy')).toBe('250');
    expect(screen.getByRole('img', { name: 'Правильна точка' }).classList.contains('pin-target')).toBe(true);
    expect(screen.getByRole('img', { name: 'Оля' }).classList.contains('pin-mark')).toBe(true);
    expect(screen.getByRole('img', { name: 'Петро' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Іра' })).toBeTruthy();
    expect(document.querySelectorAll('.pin-mark.is-best')).toHaveLength(1);
    expect(document.querySelector('.pin-mark.is-best')!.getAttribute('aria-label')).toBe('Оля');
    // Петро ближче за 4 % до Олі: його підпис зсунуто на рядок нижче; Іра далеко.
    const row = (name: string) => (screen.getByRole('img', { name }) as HTMLElement).style.getPropertyValue('--label-row');
    expect([row('Оля'), row('Петро'), row('Іра')]).toEqual(['0', '1', '0']);
  });

  it('takes the built-in map or the own picture as the base, with the aspect of the base', () => {
    render(<PinBoard pin={world} imageUrl={null} />);
    expect(document.querySelector('img.pin-base')!.getAttribute('src')).toBe('/maps/world.svg');
    expect((document.querySelector('.pin-board') as HTMLElement).style.aspectRatio).toBe('2 / 1');
    expect(document.querySelector('.pin-circle-full')).toBeNull();
    expect(document.querySelector('.pin-target')).toBeNull();
    cleanup();
    render(<PinBoard pin={{ map: null, aspect: 0.5 }} imageUrl="/uploads/a.png" />);
    expect(document.querySelector('img.pin-base')!.getAttribute('src')).toBe('/uploads/a.png');
    expect(document.querySelector('svg.pin-layer')!.getAttribute('viewBox')).toBe('0 0 500 1000');
  });

  it('caps the labels of a crowd, always names the highlighted one and pins edge labels to the edge', () => {
    const crowd = Array.from({ length: 8 }, (_, i) => ({ playerId: `p${i}`, nickname: `Гравець ${i}`, x: 0.5 + i * 0.001, y: 0.5 }));
    render(<PinBoard pin={world} imageUrl={null} marks={[...crowd, { playerId: 'e', nickname: 'Край', x: 0.02, y: 0.5 }]} highlight="p7" />);
    // Три рядки під скупченням, решта без імені (ім'я лишається в aria-label); найближчий завжди з підписом.
    const named = Array.from(document.querySelectorAll('.pin-mark')).filter((mark) => mark.querySelector('.pin-label') !== null);
    expect(named.map((mark) => mark.getAttribute('aria-label'))).toContain('Гравець 7');
    expect(named.length).toBe(4);
    expect(screen.getByRole('img', { name: 'Край' }).querySelector('.pin-label')!.classList.contains('is-left')).toBe(true);
  });

  it('flips a label up near the bottom edge, also for lower rows, and right near the right edge', () => {
    render(
      <PinBoard
        pin={world}
        imageUrl={null}
        marks={[
          { playerId: 'a', nickname: 'Низ', x: 0.5, y: 0.95 },
          { playerId: 'b', nickname: 'Право', x: 0.99, y: 0.3 },
          { playerId: 'c', nickname: 'Середина', x: 0.5, y: 0.3 },
        ]}
      />,
    );
    const label = (name: string) => screen.getByRole('img', { name }).querySelector('.pin-label')!;
    expect(label('Низ').classList.contains('is-up')).toBe(true);
    expect(label('Право').classList.contains('is-right')).toBe(true);
    expect(label('Середина').className).toBe('pin-label');
    // Третій рядок під крапкою (3.9rem) не вміщується під позначкою на 0.7 висоти дошки: підпис іде вгору.
    expect(labelPlacement({ x: 0.5, y: 0.7, nickname: 'Х' }, 2, { width: 300, height: 150 }).up).toBe(true);
    expect(labelPlacement({ x: 0.5, y: 0.2, nickname: 'Х' }, 2, { width: 300, height: 150 }).up).toBe(false);
  });
});
