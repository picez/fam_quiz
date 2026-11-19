// @vitest-environment jsdom
// Стилі читаються з диска (Vitest підміняє CSS порожнім рядком); типів node у вебі немає.
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StickyTimerProvider } from './StickyTimer';
import { Timer } from './Timer';

let observers: { callback: IntersectionObserverCallback; observed: Element[] }[] = [];
let construct: ReturnType<typeof vi.fn>;

beforeEach(() => {
  observers = [];
  construct = vi.fn(function (callback: IntersectionObserverCallback) {
    const entry = { callback, observed: [] as Element[] };
    observers.push(entry);
    return {
      observe: (element: Element) => entry.observed.push(element),
      unobserve: (element: Element) => entry.observed.splice(entry.observed.indexOf(element), 1),
      disconnect: () => entry.observed.splice(0),
    };
  });
  vi.stubGlobal('IntersectionObserver', construct);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const strip = () => document.body.querySelector('.timer-sticky');
const left = () => strip()?.querySelector('.timer-sticky-left')?.textContent;

/** Каже спостерігачам (або лише which-му з тих, що стежать), що табло (не) на екрані; bottom — низ табло. */
function scrollAway(isIntersecting: boolean, bottom: number, which?: number): void {
  const active = observers.filter((observer) => observer.observed.length > 0);
  const targets = which === undefined ? active : [active[which]!];
  act(() => {
    for (const { callback, observed } of targets) {
      callback(
        observed.map(
          (target) =>
            ({ target, isIntersecting, boundingClientRect: { top: bottom - 60, bottom, width: 300, height: 60 }, rootBounds: { top: 0, bottom: 568 } }) as unknown as IntersectionObserverEntry,
        ),
        {} as IntersectionObserver,
      );
    }
  });
}

describe('StickyTimer', () => {
  it('outside a provider the timer watches nothing and shows no strip', () => {
    render(<Timer view={{ endsAt: null, remainingMs: 12_000 }} offsetMs={0} total={30_000} />);
    expect(construct).not.toHaveBeenCalled();
    expect(strip()).toBeNull();
  });

  it('the strip appears when the main timer scrolls above the screen and leaves when it is back', () => {
    render(
      <StickyTimerProvider size="phone">
        <Timer view={{ endsAt: null, remainingMs: 12_000 }} offsetMs={0} total={30_000} />
      </StickyTimerProvider>,
    );
    expect(strip()).toBeNull();
    scrollAway(false, -10);
    expect(strip()).not.toBeNull();
    expect(strip()!.getAttribute('aria-hidden')).toBe('true');
    expect(left()).toBe('12 с');
    expect((strip()!.querySelector('.timer-sticky-bar > span') as HTMLElement).style.width).toBe('40%');
    expect(screen.getAllByRole('timer')).toHaveLength(1);
    scrollAway(true, 80);
    expect(strip()).toBeNull();
  });

  it('a timer below the screen does not raise the strip', () => {
    render(
      <StickyTimerProvider size="phone">
        <Timer view={{ endsAt: null, remainingMs: 12_000 }} offsetMs={0} total={30_000} />
      </StickyTimerProvider>,
    );
    scrollAway(false, 760);
    expect(strip()).toBeNull();
  });

  it('the strip counts down by itself', () => {
    vi.useFakeTimers();
    render(
      <StickyTimerProvider size="phone">
        <Timer view={{ endsAt: Date.now() + 12_000, remainingMs: null }} offsetMs={0} total={30_000} />
      </StickyTimerProvider>,
    );
    scrollAway(false, -10);
    expect(left()).toBe('12 с');
    act(() => vi.advanceTimersByTime(3_000));
    expect(left()).toBe('9 с');
  });

  it('pause and held say the same words as the main timer and never turn the last seconds on', () => {
    render(
      <StickyTimerProvider size="phone">
        <Timer view={{ endsAt: null, remainingMs: 3_000 }} offsetMs={0} total={30_000} status="paused" />
      </StickyTimerProvider>,
    );
    scrollAway(false, -10);
    expect(strip()!.querySelector('.timer-sticky-status')?.textContent).toBe('Пауза');
    expect(strip()!.classList.contains('is-ending')).toBe(false);
    cleanup();
    observers = [];
    render(
      <StickyTimerProvider size="phone">
        <Timer view={{ endsAt: null, remainingMs: 3_000 }} offsetMs={0} total={30_000} status="held" />
      </StickyTimerProvider>,
    );
    scrollAway(false, -10);
    expect(strip()!.querySelector('.timer-sticky-status')?.textContent).toBe('Чекає рішення ведучого');
    expect(strip()!.classList.contains('is-ending')).toBe(false);
  });

  it('a running clock shows no state on the strip', () => {
    render(
      <StickyTimerProvider size="phone">
        <Timer view={{ endsAt: Date.now() + 20_000, remainingMs: null }} offsetMs={0} total={30_000} />
      </StickyTimerProvider>,
    );
    scrollAway(false, -10);
    expect(strip()!.querySelector('.timer-sticky-status')).toBeNull();
  });

  it('the last five seconds mark the strip with the main timer', () => {
    vi.useFakeTimers();
    const { container } = render(
      <StickyTimerProvider size="phone">
        <Timer view={{ endsAt: Date.now() + 4_500, remainingMs: null }} offsetMs={0} total={30_000} />
      </StickyTimerProvider>,
    );
    scrollAway(false, -10);
    expect(strip()!.classList.contains('is-ending')).toBe(true);
    expect(container.querySelector('.timer.is-ending')).not.toBeNull();
  });

  it('no full time — seconds without a bar', () => {
    render(
      <StickyTimerProvider size="phone">
        <Timer view={{ endsAt: null, remainingMs: 12_000 }} offsetMs={0} />
      </StickyTimerProvider>,
    );
    scrollAway(false, -10);
    expect(left()).toBe('12 с');
    expect(strip()!.querySelector('.timer-sticky-bar')).toBeNull();
  });

  it('two timers — the strip follows the older hidden one', () => {
    const tree = (second: boolean) => (
      <StickyTimerProvider size="phone">
        <Timer view={{ endsAt: null, remainingMs: 12_000 }} offsetMs={0} total={30_000} />
        {second && <Timer view={{ endsAt: null, remainingMs: 50_000 }} offsetMs={0} total={60_000} />}
      </StickyTimerProvider>
    );
    const { rerender } = render(tree(true));
    scrollAway(false, -10);
    expect(document.body.querySelectorAll('.timer-sticky')).toHaveLength(1);
    expect(left()).toBe('12 с');
    scrollAway(true, 80, 0);
    expect(left()).toBe('50 с');
    rerender(tree(false));
    expect(strip()).toBeNull();
  });

  it('the host size widens the strip', () => {
    render(
      <StickyTimerProvider size="host">
        <Timer view={{ endsAt: null, remainingMs: 12_000 }} offsetMs={0} total={30_000} />
      </StickyTimerProvider>,
    );
    scrollAway(false, -10);
    expect(strip()!.classList.contains('is-host')).toBe(true);
  });

  it('without IntersectionObserver nothing breaks', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(
      <StickyTimerProvider size="phone">
        <Timer view={{ endsAt: null, remainingMs: 12_000 }} offsetMs={0} total={30_000} />
      </StickyTimerProvider>,
    );
    expect(screen.getByRole('timer')).toBeTruthy();
    expect(strip()).toBeNull();
  });
});

describe('strip robustness', () => {
  it('a timer with a zero rect (hidden or detached) does not raise the strip', () => {
    render(
      <StickyTimerProvider size="phone">
        <Timer view={{ endsAt: null, remainingMs: 12_000 }} offsetMs={0} total={30_000} />
      </StickyTimerProvider>,
    );
    act(() => {
      for (const { callback, observed } of observers) {
        callback(
          observed.map(
            (target) =>
              ({ target, isIntersecting: false, boundingClientRect: { top: 0, bottom: 0, width: 0, height: 0 }, rootBounds: { top: 0, bottom: 568 } }) as unknown as IntersectionObserverEntry,
          ),
          {} as IntersectionObserver,
        );
      }
    });
    expect(strip()).toBeNull();
  });

  it('unmounting the timer stops observing and removes the strip', () => {
    const { unmount } = render(
      <StickyTimerProvider size="phone">
        <Timer view={{ endsAt: null, remainingMs: 12_000 }} offsetMs={0} total={30_000} />
      </StickyTimerProvider>,
    );
    scrollAway(false, -10);
    expect(strip()).not.toBeNull();
    unmount();
    expect(observers.every((observer) => observer.observed.length === 0)).toBe(true);
    expect(strip()).toBeNull();
  });

  it('the strip leaves when the hidden timer loses its time', () => {
    const tree = (view: { endsAt: number | null; remainingMs: number | null }) => (
      <StickyTimerProvider size="phone">
        <Timer view={view} offsetMs={0} total={30_000} />
      </StickyTimerProvider>
    );
    const { rerender } = render(tree({ endsAt: null, remainingMs: 12_000 }));
    scrollAway(false, -10);
    expect(strip()).not.toBeNull();
    rerender(tree({ endsAt: null, remainingMs: null }));
    expect(strip()).toBeNull();
  });

  it('the observer keeps the strip until the timer clears the strip line', () => {
    render(
      <StickyTimerProvider size="phone">
        <Timer view={{ endsAt: null, remainingMs: 12_000 }} offsetMs={0} total={30_000} />
      </StickyTimerProvider>,
    );
    expect(construct.mock.calls[0]![1]).toMatchObject({ rootMargin: '-40px 0px 0px 0px' });
  });
});

describe('strip look', () => {
  it('is an opaque surface with a shadow, and the last seconds fill a pill', () => {
    const path = ['apps/web/src/styles.css', 'src/styles.css'].find((p) => existsSync(p) as boolean)!;
    const css = readFileSync(path, 'utf8') as string;
    const block = css.match(/\.timer-sticky \{[^}]*\}/)![0];
    expect(block).toContain('background: var(--surface)');
    expect(block).toContain('box-shadow:');
    expect(css.match(/\.timer-sticky\.is-ending \.timer-sticky-left \{[^}]*\}/)![0]).toContain('background: var(--accent)');
  });
});

describe('strip height', () => {
  it('the row height leaves room for the 3 px bar and the 1 px border, so the strip is 40 px', () => {
    const path = ['apps/web/src/styles.css', 'src/styles.css'].find((p) => existsSync(p) as boolean)!;
    const css = readFileSync(path, 'utf8') as string;
    expect(css.match(/\.timer-sticky-row \{[^}]*\}/)![0]).toContain('height: calc(2.5rem - 4px)');
    expect(css.match(/\.timer-sticky \{[^}]*\}/)![0]).toContain('border-bottom: 1px solid');
    expect(css.match(/\.timer-sticky-bar \{[^}]*\}/)![0]).toContain('height: 3px');
  });
});
