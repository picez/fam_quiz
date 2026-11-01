// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrizeShown, PrizesView } from '@quiz/shared';
import { Ceremony } from './Ceremony';

vi.mock('./TrophyView', () => ({
  TrophyView: ({ trophy, spin, interactive }: { trophy: { kind: string }; spin: boolean; interactive: boolean }) => (
    <span className="trophy-mock" data-kind={trophy.kind} data-spin={String(spin)} data-interactive={String(interactive)} />
  ),
}));

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const content = (over: Partial<PrizeShown['content']> = {}): PrizeShown['content'] => ({
  trophy: { kind: 'cup', material: 'gold' },
  engraving: null,
  real: null,
  title: null,
  diploma: false,
  ...over,
});

const three: PrizesView = {
  mine: null,
  places: [
    { place: 1, content: content({ engraving: 'Чемпіон 2026', title: 'Король вікторини' }), winner: { name: 'Оля', members: [] } },
    { place: 2, content: content({ trophy: { kind: 'medal', material: 'silver' }, real: { text: 'Піца', photoUrl: '/uploads/pizza.png' } }), winner: { name: 'Сови', members: ['Петро', 'Марта'] } },
    { place: 3, content: content({ trophy: { kind: 'star', material: 'bronze' } }), winner: { name: 'Іван', members: [] } },
  ],
};

const column = (place: number) => document.querySelector(`.podium-col[data-place="${place}"]`) as HTMLElement;
const shown = () => [...document.querySelectorAll('.podium-col.is-shown')].map((col) => Number((col as HTMLElement).dataset.place));
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe('Ceremony', () => {
  it('raises 3, then 2, then the winner with confetti, and calls onDone once', () => {
    const onDone = vi.fn();
    render(<Ceremony prizes={three} size="stage" hold={false} onDone={onDone} />);
    expect(document.querySelector('.podium')).not.toBeNull();
    // Стовпці 2 — 1 — 3.
    expect([...document.querySelectorAll('.podium-col')].map((col) => (col as HTMLElement).dataset.place)).toEqual(['2', '1', '3']);
    expect(shown()).toEqual([3]);
    expect(column(3).classList.contains('is-now')).toBe(true);
    expect(document.querySelector('.confetti')).toBeNull();
    advance(3500);
    expect(shown().sort()).toEqual([2, 3]);
    expect(column(2).classList.contains('is-now')).toBe(true);
    expect(column(3).classList.contains('is-now')).toBe(false);
    advance(3500);
    expect(shown().sort()).toEqual([1, 2, 3]);
    expect(column(1).classList.contains('is-now')).toBe(true);
    expect(document.querySelectorAll('.confetti')).toHaveLength(24);
    advance(5999);
    expect(onDone).not.toHaveBeenCalled();
    advance(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    advance(20_000);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('holds while the splash is up and starts when it goes', () => {
    const onDone = vi.fn();
    const { rerender } = render(<Ceremony prizes={three} size="stage" hold onDone={onDone} />);
    advance(10_000);
    expect(shown()).toEqual([]);
    expect(onDone).not.toHaveBeenCalled();
    rerender(<Ceremony prizes={three} size="stage" hold={false} onDone={onDone} />);
    expect(shown()).toEqual([3]);
    advance(3500);
    expect(shown().sort()).toEqual([2, 3]);
  });

  it('only the first place: shown at once, onDone after 6 s', () => {
    const onDone = vi.fn();
    const one: PrizesView = { mine: null, places: [three.places[0]!] };
    render(<Ceremony prizes={one} size="stage" hold={false} onDone={onDone} />);
    expect(shown()).toEqual([1]);
    expect(document.querySelectorAll('.confetti')).toHaveLength(24);
    advance(5999);
    expect(onDone).not.toHaveBeenCalled();
    advance(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('skips a place without a winner', () => {
    const gap: PrizesView = { mine: null, places: [three.places[0]!, three.places[1]!, { ...three.places[2]!, winner: null }] };
    render(<Ceremony prizes={gap} size="stage" hold={false} onDone={vi.fn()} />);
    expect(shown()).toEqual([2]);
    expect(column(3)).toBeNull();
  });

  it('builds the podium from the places of the ceremony only: {1, 2} gives 2 — 1 in two columns, {1} one column', () => {
    const columns = () => [...document.querySelectorAll('.podium-col')].map((col) => Number((col as HTMLElement).dataset.place));
    const grid = () => (document.querySelector('.podium') as HTMLElement).style.gridTemplateColumns;
    const two: PrizesView = { mine: null, places: [three.places[0]!, three.places[1]!] };
    const { unmount } = render(<Ceremony prizes={two} size="stage" hold={false} onDone={vi.fn()} />);
    // До першого відкриття стовпці вже стоять: шлях не стрибає, коли місця з'являються.
    expect(columns()).toEqual([2, 1]);
    expect(grid()).toBe('repeat(2, minmax(0,1fr))');
    unmount();
    render(<Ceremony prizes={{ mine: null, places: [three.places[0]!] }} size="phone" hold={false} onDone={vi.fn()} />);
    expect(columns()).toEqual([1]);
    expect(grid()).toBe('repeat(1, minmax(0,1fr))');
  });

  it('never doubles the crown of a title that starts with an emoji', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)', media: query }));
    const crowned: PrizesView = { mine: null, places: [{ ...three.places[0]!, content: content({ title: '👑 Король' }) }] };
    render(<Ceremony prizes={crowned} size="stage" hold={false} onDone={vi.fn()} />);
    expect(column(1).querySelector('.podium-title')!.textContent).toBe('👑 Король');
  });

  it('under reduced motion shows everything at once, no confetti and no current step', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)', media: query }));
    const onDone = vi.fn();
    render(<Ceremony prizes={three} size="stage" hold={false} onDone={onDone} />);
    expect(shown().sort()).toEqual([1, 2, 3]);
    expect(document.querySelector('.is-now')).toBeNull();
    expect(document.querySelector('.confetti')).toBeNull();
    advance(5999);
    expect(onDone).not.toHaveBeenCalled();
    advance(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('without any winner calls onDone at once and shows nothing', () => {
    const onDone = vi.fn();
    const none: PrizesView = { mine: null, places: three.places.map((shownPlace) => ({ ...shownPlace, winner: null })) };
    const { container } = render(<Ceremony prizes={none} size="stage" hold={false} onDone={onDone} />);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe('');
  });

  it('puts the engraving, the photo, the title and the members in the column of their place', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)', media: query }));
    render(<Ceremony prizes={three} size="phone" hold={false} onDone={vi.fn()} />);
    expect(column(1).querySelector('.engraving')!.textContent).toContain('Чемпіон 2026');
    expect(column(1).textContent).toContain('Король вікторини');
    expect(column(1).textContent).toContain('Оля');
    expect(column(1).textContent).toContain('1 місце');
    expect(column(2).querySelector('img[src="/uploads/pizza.png"]')).not.toBeNull();
    expect(column(2).textContent).toContain('Піца');
    expect(column(2).textContent).toContain('Петро, Марта');
    expect(column(2).querySelector('.trophy-mock')!.getAttribute('data-kind')).toBe('medal');
    expect(column(3).querySelector('.engraving')).toBeNull();
  });

  it('spins the trophy; interactive only on the phone', () => {
    const { unmount } = render(<Ceremony prizes={three} size="stage" hold={false} onDone={vi.fn()} />);
    const stage = document.querySelector('.trophy-mock')!;
    expect(stage.getAttribute('data-spin')).toBe('true');
    expect(stage.getAttribute('data-interactive')).toBe('false');
    unmount();
    render(<Ceremony prizes={three} size="phone" hold={false} onDone={vi.fn()} />);
    expect(document.querySelector('.trophy-mock')!.getAttribute('data-interactive')).toBe('true');
  });
});
