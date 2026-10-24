// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PinBoard } from './PinBoard';

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
});
