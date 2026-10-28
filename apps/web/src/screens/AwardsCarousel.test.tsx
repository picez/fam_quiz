// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FactCard } from '@quiz/shared';
import { AwardsCarousel } from './AwardsCarousel';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const awards: FactCard[] = [
  { kind: 'lightning', names: ['Оля'], timeMs: 2100, question: { roundIndex: 0, number: 3, text: 'Столиця України?' } },
  { kind: 'streak', names: ['Петро'], length: 4 },
];

const carousel = (seq: number | null, autopilot = false, list = awards, hold?: boolean) => (
  <AwardsCarousel awards={list} withRound={false} autopilot={autopilot} seq={seq} hold={hold}>
    <div className="podium">П'єдестал</div>
  </AwardsCarousel>
);

const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

const onPodium = () => screen.queryByText("П'єдестал") !== null && document.querySelector('.is-award') === null;
const slideTitle = () => document.querySelector('.award-title')?.textContent ?? null;

describe('AwardsCarousel', () => {
  it('a usual game stands on the podium until the host taps', () => {
    render(carousel(null));
    expect(onPodium()).toBe(true);
    wait(30_000);
    expect(onPodium()).toBe(true);
  });

  it('a tap starts the awards: each 4 s, then back to the podium, and stops', () => {
    const { rerender } = render(carousel(null));
    rerender(carousel(1));
    expect(slideTitle()).toBe('⚡ Блискавка');
    expect(document.querySelector('.stage-board.is-award .meta')?.textContent).toBe('Нагороди гри · 1 з 2');
    expect(document.querySelector('.award-body')?.textContent).toContain('Оля');
    expect(screen.queryByText("П'єдестал")).toBeNull();
    wait(4000);
    expect(document.querySelector('.stage-board.is-award .meta')?.textContent).toBe('Нагороди гри · 2 з 2');
    expect(document.querySelector('.award-body')?.textContent).toContain('Петро');
    wait(4000);
    expect(onPodium()).toBe(true);
    wait(10_000);
    expect(onPodium()).toBe(true);
  });

  it('a tap during the carousel shows the next slide at once and restarts the 4 s', () => {
    const { rerender } = render(carousel(null));
    rerender(carousel(1));
    wait(3000);
    rerender(carousel(2));
    expect(document.querySelector('.award-body')?.textContent).toContain('Петро');
    wait(3000);
    expect(document.querySelector('.award-body')?.textContent).toContain('Петро');
    wait(1000);
    expect(onPodium()).toBe(true);
  });

  it('a tap on the last slide goes to the first award again', () => {
    const { rerender } = render(carousel(null));
    rerender(carousel(1));
    rerender(carousel(2));
    rerender(carousel(3));
    expect(slideTitle()).toBe('⚡ Блискавка');
  });

  it('the seq seen at mount is a baseline, not a tap', () => {
    const { rerender } = render(carousel(5));
    expect(onPodium()).toBe(true);
    wait(10_000);
    expect(onPodium()).toBe(true);
    rerender(carousel(6));
    expect(slideTitle()).toBe('⚡ Блискавка');
  });

  it('autopilot: 10 s of podium, then the awards by themselves, around and around', () => {
    render(carousel(null, true));
    expect(onPodium()).toBe(true);
    wait(9999);
    expect(onPodium()).toBe(true);
    wait(1);
    expect(slideTitle()).toBe('⚡ Блискавка');
    wait(4000);
    expect(document.querySelector('.award-body')?.textContent).toContain('Петро');
    wait(4000);
    expect(onPodium()).toBe(true);
    wait(10_000);
    expect(slideTitle()).toBe('⚡ Блискавка');
  });

  it('autopilot on hold (the podium splash) waits, and the 10 s start after it', () => {
    const { rerender } = render(carousel(null, true, awards, true));
    wait(15_000);
    expect(onPodium()).toBe(true);
    rerender(carousel(null, true, awards, false));
    wait(9999);
    expect(onPodium()).toBe(true);
    wait(1);
    expect(slideTitle()).toBe('⚡ Блискавка');
  });

  it('a tap during the splash opens the award, and its 4 s start only after the splash', () => {
    const { rerender } = render(carousel(null, false, awards, true));
    rerender(carousel(1, false, awards, true));
    expect(slideTitle()).toBe('⚡ Блискавка');
    wait(10_000);
    expect(slideTitle()).toBe('⚡ Блискавка');
    rerender(carousel(1, false, awards, false));
    wait(3999);
    expect(slideTitle()).toBe('⚡ Блискавка');
    wait(1);
    expect(slideTitle()).toBe('🔥 Серія');
  });

  it('autopilot: the second loop keeps the same timing', () => {
    render(carousel(null, true));
    wait(10_000);
    wait(4000);
    wait(4000);
    expect(onPodium()).toBe(true);
    wait(9999);
    expect(onPodium()).toBe(true);
    wait(1);
    expect(slideTitle()).toBe('⚡ Блискавка');
    wait(4000);
    expect(slideTitle()).toBe('🔥 Серія');
    wait(4000);
    expect(onPodium()).toBe(true);
  });

  it('the aria-live wrapper stays from the podium to the award', () => {
    const { rerender } = render(carousel(null));
    const live = document.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain("П'єдестал");
    rerender(carousel(1));
    expect(document.querySelector('[aria-live="polite"]')).toBe(live);
    expect(live?.textContent).toContain('Блискавка');
  });

  it('unmount leaves no timers', () => {
    const { unmount, rerender } = render(carousel(null, true));
    rerender(carousel(1, true));
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('no awards — only the podium, taps or not', () => {
    const { rerender } = render(carousel(null, true, []));
    rerender(carousel(1, true, []));
    wait(20_000);
    expect(onPodium()).toBe(true);
  });
});
