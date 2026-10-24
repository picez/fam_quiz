// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
// Vitest підміняє CSS порожнім рядком (і з ?raw), тож стилі читаються з диска; типів node у вебі немає.
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import type { Answer, DebuffKind, PlayerSort, PublicQuestion } from '@quiz/shared';
import type { Send } from '../live/types';
import { AnswerInput } from './AnswerInput';
import { BANNER_MS, DebuffZone, MIRROR_SWAP_MS, SHAKE_BURST, SHAKE_CYCLE_MS, freezeMs, rotateChoices, useDebuffQuestion } from './Debuffs';
import { SortPlay } from './SortView';

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
const sortQuestion: PublicQuestion = {
  ...single,
  type: 'sort',
  choices: [],
  sort: {
    categories: [
      { id: 'c1', text: 'Овочі' },
      { id: 'c2', text: 'Фрукти' },
      { id: 'c3', text: 'Ягоди' },
    ],
    total: 4,
    lockSeconds: 3,
  },
};
const playerSort: PlayerSort = {
  card: { id: 'w1', text: 'Морква' },
  sorted: 0,
  total: 4,
  misses: 0,
  lockedUntil: null,
  lockRemainingMs: null,
  missed: null,
  canSort: true,
  timeMs: null,
};

function MirrorSort({ send }: { send: Send }) {
  const [debuff] = useState(() => ({ kind: 'mirror' as const, since: Date.now(), by: null }));
  const shown = useDebuffQuestion(sortQuestion, debuff);
  return (
    <DebuffZone debuff={debuff} limitMs={30_000} offsetMs={0} questionIndex={0}>
      {shown !== null && <SortPlay question={shown} sort={playerSort} paused={false} offsetMs={0} send={send} />}
    </DebuffZone>
  );
}

const reduce = () =>
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)', media: query }));

const zone = () => document.querySelector<HTMLElement>('.debuff-zone')!;
const content = () => document.querySelector<HTMLFieldSetElement>('fieldset.debuff-content')!;

function Zone({ kind, since, limitMs = 30_000, onSubmit = () => {} }: { kind: DebuffKind | null; since?: number; limitMs?: number | null; onSubmit?: (a: Answer) => void }) {
  const debuff = kind === null ? null : { kind, since: since ?? Date.now(), by: null };
  return (
    <DebuffZone debuff={debuff} limitMs={limitMs} offsetMs={0} questionIndex={2}>
      <AnswerInput question={single} onSubmit={onSubmit} />
    </DebuffZone>
  );
}

function Mirror({ question, onSubmit }: { question: PublicQuestion; onSubmit: (a: Answer) => void }) {
  const [debuff] = useState(() => ({ kind: 'mirror' as const, since: Date.now(), by: null }));
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

  it('the victim banner names the buyer', () => {
    render(
      <DebuffZone debuff={{ kind: 'fog', since: Date.now(), by: 'Оля' }} limitMs={30_000} offsetMs={0} questionIndex={0}>
        <AnswerInput question={single} onSubmit={() => {}} />
      </DebuffZone>,
    );
    expect(screen.getByRole('status').textContent).toContain('Оля насилає на вас: Туман');
    cleanup();
    render(<Zone kind="fog" />);
    expect(screen.getByRole('status').textContent).toContain('На вас наслано: Туман');
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
    expect(guests).toHaveLength(5);
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

  it('mirror moves the zones, the move counts by category', async () => {
    expect(rotateChoices(sortQuestion, 1).sort?.categories.map((c) => c.id)).toEqual(['c2', 'c3', 'c1']);
    expect(rotateChoices(sortQuestion, 2).sort?.categories.map((c) => c.id)).toEqual(['c3', 'c1', 'c2']);
    expect(rotateChoices(sortQuestion, 3)).toBe(sortQuestion);
    const send = vi.fn<Send>().mockResolvedValue({ ok: true });
    render(<MirrorSort send={send} />);
    const left = () => document.querySelector<HTMLButtonElement>('.sort-zone[data-pos="left"]')!;
    expect(left().textContent).toBe('Овочі');
    act(() => {
      vi.advanceTimersByTime(MIRROR_SWAP_MS);
    });
    expect(left().textContent).toBe('Фрукти');
    expect(document.querySelector('.sort-zone[data-pos="top"]')?.textContent).toBe('Овочі');
    fireEvent.click(left());
    expect(send).toHaveBeenCalledWith('player:sort', { wordId: 'w1', categoryId: 'c2' });
  });

  it('freeze blocks drag, taps and arrows', async () => {
    const send = vi.fn<Send>().mockResolvedValue({ ok: true });
    render(
      <DebuffZone debuff={{ kind: 'freeze', since: Date.now(), by: null }} limitMs={30_000} offsetMs={0} questionIndex={0}>
        <SortPlay question={sortQuestion} sort={playerSort} paused={false} offsetMs={0} send={send} />
      </DebuffZone>,
    );
    const left = () => document.querySelector<HTMLButtonElement>('.sort-zone[data-pos="left"]')!;
    const card = () => document.querySelector<HTMLElement>('.sort-card')!;
    const drag = () => {
      fireEvent.pointerDown(card(), { pointerId: 1, clientX: 200, clientY: 300 });
      fireEvent.pointerMove(card(), { pointerId: 1, clientX: 90, clientY: 300 });
      fireEvent.pointerUp(card(), { pointerId: 1, clientX: 90, clientY: 300 });
    };
    expect(content().disabled).toBe(true);
    fireEvent.click(left());
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    drag();
    expect(send).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(freezeMs(30_000));
    });
    expect(content().disabled).toBe(false);
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(send).toHaveBeenCalledWith('player:sort', { wordId: 'w1', categoryId: 'c2' });
    await act(async () => {});
    drag();
    expect(send).toHaveBeenLastCalledWith('player:sort', { wordId: 'w1', categoryId: 'c1' });
    await act(async () => {});
    fireEvent.click(left());
    expect(send).toHaveBeenCalledTimes(3);
  });
});

// Тести запускаються з кореня репозиторію або з apps/web.
const cssPath = ['apps/web/src/styles.css', 'src/styles.css'].find((path) => existsSync(path) as boolean)!;
const css = (readFileSync(cssPath, 'utf8') as string).replace(/\r\n/g, '\n');

/** Тіло першого правила з точно цим селектором у styles.css (рядок може мати відступ — правила в @media). */
function rule(selector: string): string {
  const lines = css.split('\n');
  const at = lines.findIndex((line) => line.trim() === `${selector} {`);
  expect(at).toBeGreaterThanOrEqual(0);
  const start = lines.slice(0, at).join('\n').length + 1;
  return css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
}

describe('debuff strength', () => {
  const setVibrate = (value: unknown) => Object.defineProperty(navigator, 'vibrate', { value, configurable: true, writable: true });
  afterEach(() => setVibrate(undefined));

  it('shake buzzes the phone at the start of every burst and stops with the debuff', () => {
    const vibrate = vi.fn();
    setVibrate(vibrate);
    const { rerender } = render(
      <DebuffZone debuff={{ kind: 'shake', since: Date.now(), by: null }} limitMs={30_000} offsetMs={0} questionIndex={0}>
        x
      </DebuffZone>,
    );
    expect(vibrate).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(SHAKE_CYCLE_MS * 2);
    });
    expect(vibrate).toHaveBeenCalledTimes(3);
    expect(vibrate).toHaveBeenLastCalledWith([120, 60, 120]);
    rerender(
      <DebuffZone debuff={null} limitMs={30_000} offsetMs={0} questionIndex={1}>
        x
      </DebuffZone>,
    );
    act(() => {
      vi.advanceTimersByTime(SHAKE_CYCLE_MS * 2);
    });
    expect(vibrate).toHaveBeenCalledTimes(3);
  });

  it('no buzz with reduced motion', () => {
    const vibrate = vi.fn();
    setVibrate(vibrate);
    reduce();
    render(<Zone kind="shake" />);
    act(() => {
      vi.advanceTimersByTime(SHAKE_CYCLE_MS * 2);
    });
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('the CSS burst starts in step with the buzz: the zone carries the cycle and the phase', () => {
    const since = Date.now() - 1000;
    render(<Zone kind="shake" since={since} />);
    expect(zone().style.getPropertyValue('--shake-cycle')).toBe(`${SHAKE_CYCLE_MS}ms`);
    expect(zone().style.getPropertyValue('--shake-phase')).toBe('1000ms');
  });

  it('the burst is at most 30 % of the cycle, so there is always a calm moment to tap', () => {
    expect(SHAKE_BURST).toBeLessThanOrEqual(0.3);
    expect(SHAKE_CYCLE_MS * (1 - SHAKE_BURST)).toBeGreaterThanOrEqual(1900);
  });

  it('five guests walk across the zone and catch no taps', () => {
    render(<Zone kind="guests" />);
    const guests = document.querySelectorAll('.debuff-guest');
    expect(guests).toHaveLength(5);
    for (const guest of guests) expect(guest.classList.contains('debuff-layer')).toBe(true);
  });

  it('fog is a blur over a light haze, not a milky wall', () => {
    expect(css).toContain('--fog: rgb(150 160 185 / 0.3);');
    const fog = rule('.debuff-fog');
    expect(fog).toContain('background: var(--fog);');
    expect(fog).toContain('backdrop-filter: blur(3px);');
    expect(css).toMatch(/@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\) \{\s*\.debuff-fog \{\s*background: rgb\(150 160 185 \/ 0\.6\);/);
  });

  it('ice is thicker with frost at the edges, guests are bigger with a shadow', () => {
    expect(css).toContain('--ice: rgb(190 230 255 / 0.72);');
    expect(rule('.debuff-ice')).toContain('box-shadow: inset 0 0 1.5rem rgb(255 255 255 / 0.8);');
    const guest = rule('.debuff-guest');
    expect(guest).toContain('font-size: 5.5rem;');
    expect(guest).toContain('filter: drop-shadow(0 0.15rem 0.3rem rgb(0 0 0 / 0.6));');
  });

  it('the shake runs on the shared cycle, jolts up to 14px and is calm for the last 70 %', () => {
    const shake = rule('.is-shake:not(.is-calm) .debuff-content');
    expect(shake).toContain('animation: debuff-shake var(--shake-cycle, 2800ms) infinite;');
    expect(shake).toContain('animation-delay: calc(-1 * var(--shake-phase, 0ms));');
    const start = css.indexOf('@keyframes debuff-shake {');
    const frames = css.slice(start, css.indexOf('\n  }\n', start));
    expect(frames).toMatch(/translate: -?14px/);
    expect(frames).toMatch(/rotate: -?2\.5deg/);
    expect(frames).toMatch(/30%,\s*100% \{\s*translate: 0 0;/);
    const pxs = [...frames.matchAll(/translate: (-?\d+)px/g)].map((m) => Math.abs(Number(m[1])));
    expect(Math.max(...pxs)).toBeLessThanOrEqual(14);
  });

  it('the calm shake for reduced motion is still visible: a pulsing outline on the same cycle, no movement', () => {
    const calm = rule('.is-calm.is-shake .debuff-content');
    expect(calm).toContain('animation: debuff-ghost var(--shake-cycle, 2800ms) infinite;');
    const start = css.indexOf('@keyframes debuff-ghost {');
    const frames = css.slice(start, css.indexOf('\n}\n', start));
    expect(frames).toContain('box-shadow');
    expect(frames).not.toContain('translate');
    expect(frames).not.toContain('rotate');
  });
});
