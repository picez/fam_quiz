// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Answer } from '@quiz/shared';
import type { Send } from '../live/types';
import { TeamWatch, useDraftSender } from './TeamWatch';
import { baseMe, publicQuestion, teamPlayerView } from './team-test-view';

afterEach(cleanup);

const watching = (draft: Answer | null, over = {}) =>
  teamPlayerView({ phase: 'question', questionIndex: 0, question: publicQuestion, ...over }, { captain: false, canAct: false, memberId: 'u3', draft });

describe('TeamWatch', () => {
  it('marks the captain choice with a dashed draft frame and a caption, and has no send buttons', () => {
    render(<TeamWatch view={watching({ type: 'single', optionId: 'b' })} />);
    const marked = document.querySelectorAll('.choice.is-draft');
    expect(marked).toHaveLength(1);
    expect(marked[0].textContent).toContain('Київ');
    expect(marked[0].textContent).toContain('вибір капітана');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText('Відповідає капітан Оля — радьте вголос')).toBeTruthy();
  });

  it('shows a text draft', () => {
    render(<TeamWatch view={watching({ type: 'text', value: 'Київ' }, { question: { ...publicQuestion, type: 'text', choices: [] } })} />);
    expect(document.querySelector('.team-draft')?.textContent).toContain('Київ');
  });

  it('has one visually hidden live line that sums up the draft', () => {
    render(<TeamWatch view={watching({ type: 'single', optionId: 'b' })} />);
    const live = document.querySelector('.sr-only[aria-live="polite"]');
    expect(live?.textContent).toBe('вибір капітана: Київ');
  });

  it('a bluff choice shows the read-only board', () => {
    const bluff = { stage: 'choice', written: 1, picked: 0, options: [{ id: 'o1', text: 'Варіант' }], shown: 0, total: 1, lastOpenedId: null } as never;
    render(<TeamWatch view={watching(null, { question: { ...publicQuestion, type: 'bluff', choices: [] }, bluff })} />);
    expect(screen.getByText('Капітан вирішує за команду…')).toBeTruthy();
  });

  it('without a draft only the lead line shows', () => {
    render(<TeamWatch view={watching(null)} />);
    expect(screen.getByText('Відповідає капітан Оля — радьте вголос')).toBeTruthy();
    expect(document.querySelector('.is-draft')).toBeNull();
  });

  it('after the team answered it shows the team answer', () => {
    render(<TeamWatch view={watching(null, { me: { ...baseMe, answer: { type: 'single', optionId: 'a' } } })} />);
    expect(screen.getByText('Команда відповіла')).toBeTruthy();
    expect(screen.getByText('Львів')).toBeTruthy();
  });

  it('in a blitz the buzzer is the one who answers', () => {
    const view = teamPlayerView({ phase: 'question', questionIndex: 0, question: publicQuestion }, { captain: false, canAct: false, buzzerId: 'u3' });
    render(<TeamWatch view={view} />);
    expect(screen.getByText('Відповідає Петро — радьте вголос')).toBeTruthy();
  });
});

describe('useDraftSender', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sends the last value at most every 250 ms and skips repeats', () => {
    const send: Send = vi.fn(async () => ({ ok: true as const }));
    const { result } = renderHook(() => useDraftSender(send, true, 0));
    act(() => {
      result.current({ type: 'text', value: 'К' });
      result.current({ type: 'text', value: 'Ки' });
    });
    expect(send).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(250));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('player:draft', { draft: { type: 'text', value: 'Ки' } });
    act(() => {
      result.current({ type: 'text', value: 'Ки' });
    });
    act(() => vi.advanceTimersByTime(250));
    expect(send).toHaveBeenCalledTimes(1);
    act(() => {
      result.current(null);
    });
    act(() => vi.advanceTimersByTime(250));
    expect(send).toHaveBeenLastCalledWith('player:draft', { draft: null });
  });

  it('a cleared field is sent as null after a value, and cancel drops what waits', () => {
    const send: Send = vi.fn(async () => ({ ok: true as const }));
    const { result } = renderHook(() => useDraftSender(send, true, 0));
    act(() => {
      result.current({ type: 'text', value: 'К' });
    });
    act(() => vi.advanceTimersByTime(250));
    act(() => {
      result.current(null);
      result.current.cancel();
    });
    act(() => vi.advanceTimersByTime(500));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('the sent-already memory resets with a new key and when the right to act returns', () => {
    const send: Send = vi.fn(async () => ({ ok: true as const }));
    const { result, rerender } = renderHook(({ active, key }) => useDraftSender(send, active, key), { initialProps: { active: true, key: 'a' } });
    const draft = { type: 'text' as const, value: 'К' };
    const push = () => {
      act(() => {
        result.current(draft);
      });
      act(() => vi.advanceTimersByTime(250));
    };
    push();
    push();
    expect(send).toHaveBeenCalledTimes(1);
    rerender({ active: true, key: 'b' });
    push();
    expect(send).toHaveBeenCalledTimes(2);
    rerender({ active: false, key: 'b' });
    rerender({ active: true, key: 'b' });
    push();
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('sends nothing when it is not my turn', () => {
    const send: Send = vi.fn(async () => ({ ok: true as const }));
    const { result } = renderHook(() => useDraftSender(send, false, 0));
    act(() => {
      result.current({ type: 'text', value: 'К' });
    });
    act(() => vi.advanceTimersByTime(500));
    expect(send).not.toHaveBeenCalled();
  });

  it('clips a long text to 100 characters before sending', () => {
    const send: Send = vi.fn(async () => ({ ok: true as const }));
    const { result } = renderHook(() => useDraftSender(send, true, 0));
    act(() => {
      result.current({ type: 'text', value: 'я'.repeat(150) });
    });
    act(() => vi.advanceTimersByTime(250));
    expect(send).toHaveBeenCalledWith('player:draft', { draft: { type: 'text', value: 'я'.repeat(100) } });
  });

  it('sends wall, chain and lie drafts', () => {
    const send: Send = vi.fn(async () => ({ ok: true as const }));
    const { result } = renderHook(() => useDraftSender(send, true, 0));
    act(() => {
      result.current({ type: 'wallPick', tiles: [0, 3] });
    });
    act(() => vi.advanceTimersByTime(250));
    expect(send).toHaveBeenLastCalledWith('player:draft', { draft: { type: 'wallPick', tiles: [0, 3] } });
  });

  it('after too_soon the same value goes again in DRAFT_MS', async () => {
    const send = vi.fn<Send>().mockResolvedValueOnce({ ok: false, error: 'too_soon' }).mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useDraftSender(send, true, 0));
    act(() => {
      result.current({ type: 'text', value: 'Ки' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(send).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith('player:draft', { draft: { type: 'text', value: 'Ки' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('after too_soon a newer value goes instead of the old one', async () => {
    const send = vi.fn<Send>().mockResolvedValueOnce({ ok: false, error: 'too_soon' }).mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useDraftSender(send, true, 0));
    act(() => {
      result.current({ type: 'text', value: 'К' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    act(() => {
      result.current({ type: 'text', value: 'Ки' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith('player:draft', { draft: { type: 'text', value: 'Ки' } });
  });

  it('cancel after too_soon sends nothing more', async () => {
    const send = vi.fn<Send>().mockResolvedValueOnce({ ok: false, error: 'too_soon' }).mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useDraftSender(send, true, 0));
    act(() => {
      result.current({ type: 'text', value: 'Ки' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    act(() => result.current.cancel());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('cancel before the too_soon answer arrives sends nothing more', async () => {
    let answer: (value: { ok: false; error: string }) => void = () => {};
    const send = vi.fn<Send>().mockImplementationOnce(() => new Promise((resolve) => (answer = resolve))).mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useDraftSender(send, true, 0));
    act(() => {
      result.current({ type: 'text', value: 'Ки' });
    });
    act(() => vi.advanceTimersByTime(250));
    act(() => result.current.cancel());
    await act(async () => {
      answer({ ok: false, error: 'too_soon' });
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('TeamWatch: live sort (11d)', () => {
  it('a teammate watches the captain sort: card and tilt', () => {
    const sortQ = { ...publicQuestion, type: 'sort' as const, choices: [], sort: { categories: [{ id: 'c1', text: 'Овочі' }, { id: 'c2', text: 'Фрукти' }], total: 4, lockSeconds: 3 } };
    const live = {
      sorterId: 'team-b',
      nickname: 'Сині',
      card: { id: 'w4', text: 'Груша' },
      missed: null,
      lockedUntil: null,
      lockRemainingMs: null,
      sorted: 0,
      total: 4,
      misses: 0,
      timeMs: null,
      seq: 0,
      columns: [{ id: 'c1', words: [] }, { id: 'c2', words: [] }],
      last: null,
      marks: null,
    };
    const sort = { total: 4, rows: [], winner: null, words: null, live: null };
    const sortMe = { canSort: false, card: null, sorted: 0, total: 4, misses: 0, lockedUntil: null, lockRemainingMs: null, missed: null, timeMs: null, watched: true, marks: null, live };
    const view = watching(null, { question: sortQ, sort, me: { ...baseMe, sort: sortMe } });
    const tilts = { 'team-b': { sorterId: 'team-b', wordId: 'w4', toward: 'c2', amount: 0.8, seq: 0 } };
    render(<TeamWatch view={view} tilts={tilts} />);
    expect(document.querySelector('.sort-live-card')?.textContent).toBe('Груша');
    const zone = [...document.querySelectorAll('.sort-zone')].find((el) => el.textContent?.startsWith('Фрукти · '))!;
    expect(zone.classList.contains('is-toward')).toBe(true);
  });
});
