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
});
