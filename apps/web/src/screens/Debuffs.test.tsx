// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import type { Answer, DebuffKind, PublicQuestion } from '@quiz/shared';
import { AnswerInput } from './AnswerInput';
import { BANNER_MS, DebuffZone, MIRROR_SWAP_MS, freezeMs, rotateChoices, useDebuffQuestion } from './Debuffs';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const single: PublicQuestion = {
  type: 'single',
  text: 'Що?',
  imageUrl: null,
  timeLimit: 30,
  video: null,
  points: 1000,
  choices: [
    { id: 'a', text: 'a' },
    { id: 'b', text: 'b' },
    { id: 'c', text: 'c' },
  ],
  right: [],
  orderLabels: null,
  chain: null,
  sort: null,
};
const order: PublicQuestion = { ...single, type: 'order', orderLabels: { top: '', bottom: '' } };

const reduce = () =>
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)', media: query }));

const zone = () => document.querySelector<HTMLElement>('.debuff-zone')!;
const content = () => document.querySelector<HTMLFieldSetElement>('fieldset.debuff-content')!;

function Zone({ kind, since, limitMs = 30_000, onSubmit = () => {} }: { kind: DebuffKind | null; since?: number; limitMs?: number | null; onSubmit?: (a: Answer) => void }) {
  const debuff = kind === null ? null : { kind, since: since ?? Date.now() };
  return (
    <DebuffZone debuff={debuff} limitMs={limitMs} offsetMs={0} questionIndex={2}>
      <AnswerInput question={single} onSubmit={onSubmit} />
    </DebuffZone>
  );
}

function Mirror({ question, onSubmit }: { question: PublicQuestion; onSubmit: (a: Answer) => void }) {
  const [debuff] = useState(() => ({ kind: 'mirror' as const, since: Date.now() }));
  const shown = useDebuffQuestion(question, debuff);
  return (
    <DebuffZone debuff={debuff} limitMs={30_000} offsetMs={0} questionIndex={0}>
      {shown !== null && <AnswerInput question={shown} onSubmit={onSubmit} />}
    </DebuffZone>
  );
}

const texts = () => [...document.querySelectorAll('.debuff-content .choice, .debuff-content .order-text')].map((b) => b.textContent!.replace(/^[A-Z]/, '').trim());

describe('DebuffZone', () => {
  it('the zone is the same for everyone without a debuff', () => {
    render(<Zone kind={null} />);
    expect(zone()).not.toBeNull();
    expect(zone().hasAttribute('data-debuff')).toBe(false);
    expect(content().disabled).toBe(false);
    expect(screen.queryByRole('status')).toBeNull();
    expect(document.querySelector('.debuff-layer')).toBeNull();
  });

  it('the target sees what was cast for three seconds', () => {
    render(<Zone kind="fog" />);
    expect(zone().dataset.debuff).toBe('fog');
    const banner = screen.getByRole('status');
    expect(banner.textContent).toContain('На вас наслано: Туман');
    expect(banner.textContent).toContain('Протріть екран пальцем, щоб розвіяти туман');
    act(() => {
      vi.advanceTimersByTime(BANNER_MS);
    });
    expect(screen.queryByRole('status')).toBeNull();
    cleanup();
    render(<Zone kind="fog" since={Date.now() - 10_000} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('freeze unlocks after five seconds or half the time', () => {
    expect(freezeMs(30_000)).toBe(5000);
    expect(freezeMs(6000)).toBe(3000);
    expect(freezeMs(null)).toBe(5000);
    render(<Zone kind="freeze" />);
    expect(content().disabled).toBe(true);
    expect(screen.getByRole('button', { name: /b/ }).matches(':disabled')).toBe(true);
    expect(document.querySelector('.debuff-ice')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(content().disabled).toBe(false);
    expect(document.querySelector('.debuff-ice')).toBeNull();
    cleanup();
    render(<Zone kind="freeze" since={Date.now() - 4000} />);
    expect(content().disabled).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(content().disabled).toBe(false);
  });

  it('mirror rotates options and a tap still sends the option id', () => {
    const onSubmit = vi.fn();
    render(<Mirror question={single} onSubmit={onSubmit} />);
    expect(zone().classList.contains('is-mirror')).toBe(true);
    expect(texts()).toEqual(['a', 'b', 'c']);
    act(() => {
      vi.advanceTimersByTime(MIRROR_SWAP_MS);
    });
    expect(texts()).toEqual(['b', 'c', 'a']);
    act(() => {
      vi.advanceTimersByTime(MIRROR_SWAP_MS);
    });
    expect(texts()).toEqual(['c', 'a', 'b']);
    const b = [...document.querySelectorAll<HTMLButtonElement>('.debuff-content .choice')].find((x) => x.textContent!.endsWith('b'))!;
    fireEvent.click(b);
    expect(onSubmit).toHaveBeenCalledWith({ type: 'single', optionId: 'b' });
    cleanup();
    expect(rotateChoices(order, 1)).toBe(order);
    render(<Mirror question={order} onSubmit={onSubmit} />);
    act(() => {
      vi.advanceTimersByTime(MIRROR_SWAP_MS);
    });
    expect(texts()).toEqual(['a', 'b', 'c']);
  });

  it('shake and guests have calm variants under reduced motion', () => {
    render(<Zone kind="shake" />);
    expect(zone().classList.contains('is-shake')).toBe(true);
    expect(zone().classList.contains('is-calm')).toBe(false);
    cleanup();
    render(<Zone kind="guests" />);
    const guests = document.querySelectorAll('.debuff-guest');
    expect(guests).toHaveLength(4);
    for (const guest of guests) expect(guest.getAttribute('aria-hidden')).toBe('true');
    expect(zone().classList.contains('is-calm')).toBe(false);
    cleanup();
    reduce();
    render(<Zone kind="shake" />);
    expect(zone().className).toContain('is-shake');
    expect(zone().classList.contains('is-calm')).toBe(true);
    cleanup();
    render(<Zone kind="guests" />);
    expect(zone().classList.contains('is-calm')).toBe(true);
  });

  it('layers never catch taps', () => {
    const onSubmit = vi.fn();
    render(<Zone kind="guests" onSubmit={onSubmit} />);
    for (const guest of document.querySelectorAll('.debuff-guest')) expect(guest.classList.contains('debuff-layer')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /c/ }));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'single', optionId: 'c' });
  });
});
