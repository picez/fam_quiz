// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShowcasePins } from '@quiz/shared';
import { getShowcasePins, pinToShowcase, unpinFromShowcase } from '../api';
import { usePins } from './usePins';

vi.mock('../api', () => ({ getShowcasePins: vi.fn(), pinToShowcase: vi.fn(), unpinFromShowcase: vi.fn() }));

const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';
const P3 = '33333333-3333-4333-8333-333333333333';
const P4 = '44444444-4444-4444-8444-444444444444';

const pins = (over: Partial<ShowcasePins> = {}): ShowcasePins => ({ prizes: [], achievements: [], ...over });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getShowcasePins).mockResolvedValue({ ok: true, data: pins({ achievements: ['host'] }) });
});
afterEach(cleanup);

describe('usePins', () => {
  it('with initial pins does not ask the server', () => {
    const { result } = renderHook(() => usePins(pins({ prizes: [P1] })));
    expect(getShowcasePins).not.toHaveBeenCalled();
    expect(result.current.pins).toEqual(pins({ prizes: [P1] }));
    expect(result.current.isPinned({ kind: 'prize', id: P1 })).toBe(true);
    expect(result.current.isPinned({ kind: 'prize', id: P2 })).toBe(false);
  });

  it('without initial pins loads them', async () => {
    const { result } = renderHook(() => usePins());
    expect(result.current.pins).toBeNull();
    await waitFor(() => expect(result.current.pins).toEqual(pins({ achievements: ['host'] })));
    expect(getShowcasePins).toHaveBeenCalledOnce();
    expect(result.current.isPinned({ kind: 'achievement', id: 'host' })).toBe(true);
  });

  it('toggling an unpinned item pins it and takes the new pins', async () => {
    vi.mocked(pinToShowcase).mockResolvedValue({ ok: true, data: pins({ prizes: [P1, P2] }) });
    const { result } = renderHook(() => usePins(pins({ prizes: [P1] })));
    await act(() => result.current.toggle({ kind: 'prize', id: P2 }));
    expect(pinToShowcase).toHaveBeenCalledWith({ kind: 'prize', id: P2 });
    expect(unpinFromShowcase).not.toHaveBeenCalled();
    expect(result.current.pins).toEqual(pins({ prizes: [P1, P2] }));
    expect(result.current.message).toBeNull();
  });

  it('toggling a pinned item unpins it', async () => {
    vi.mocked(unpinFromShowcase).mockResolvedValue({ ok: true, data: pins() });
    const { result } = renderHook(() => usePins(pins({ achievements: ['sniper'] })));
    await act(() => result.current.toggle({ kind: 'achievement', id: 'sniper' }));
    expect(unpinFromShowcase).toHaveBeenCalledWith({ kind: 'achievement', id: 'sniper' });
    expect(pinToShowcase).not.toHaveBeenCalled();
    expect(result.current.pins).toEqual(pins());
  });

  it('with three prizes pinned a fourth is refused before any request', async () => {
    const { result } = renderHook(() => usePins(pins({ prizes: [P1, P2, P3] })));
    await act(() => result.current.toggle({ kind: 'prize', id: P4 }));
    expect(pinToShowcase).not.toHaveBeenCalled();
    expect(result.current.message).toBe('На вітрині вже 3 кубки — спершу прибери один.');
    expect(result.current.pins).toEqual(pins({ prizes: [P1, P2, P3] }));
  });

  it('with five achievements pinned a sixth is refused before any request', async () => {
    const { result } = renderHook(() => usePins(pins({ achievements: ['host', 'sniper', 'first_game', 'fast_answer', 'games_10'] })));
    await act(() => result.current.toggle({ kind: 'achievement', id: 'first_win' }));
    expect(pinToShowcase).not.toHaveBeenCalled();
    expect(result.current.message).toBe('На вітрині вже 5 ачівок — спершу прибери одну.');
  });

  it('the server answer showcase_full gives the same text, other errors their own', async () => {
    vi.mocked(pinToShowcase).mockResolvedValueOnce({ ok: false, error: 'showcase_full' }).mockResolvedValueOnce({ ok: false, error: 'offline' });
    const { result } = renderHook(() => usePins(pins()));
    await act(() => result.current.toggle({ kind: 'prize', id: P1 }));
    expect(result.current.message).toBe('На вітрині вже 3 кубки — спершу прибери один.');
    await act(() => result.current.toggle({ kind: 'prize', id: P1 }));
    expect(result.current.message).toBe('Немає зв’язку із сервером.');
    expect(getShowcasePins).toHaveBeenCalledOnce();
  });

  it('refetches the pins after a 409 showcase_full (pinned on another device)', async () => {
    vi.mocked(pinToShowcase).mockResolvedValue({ ok: false, error: 'showcase_full' });
    vi.mocked(getShowcasePins).mockResolvedValue({ ok: true, data: pins({ prizes: [P2, P3, P4] }) });
    const { result } = renderHook(() => usePins(pins({ prizes: [P2] })));
    await act(() => result.current.toggle({ kind: 'prize', id: P1 }));
    expect(getShowcasePins).toHaveBeenCalledOnce();
    expect(result.current.pins).toEqual(pins({ prizes: [P2, P3, P4] }));
    expect(result.current.message).toBe('На вітрині вже 3 кубки — спершу прибери один.');
    expect(result.current.busy).toBe(false);
  });

  it('refetches the pins after a 404 (the award was deleted) so its pin goes away', async () => {
    vi.mocked(unpinFromShowcase).mockResolvedValue({ ok: false, error: 'not_found' });
    vi.mocked(getShowcasePins).mockResolvedValue({ ok: true, data: pins() });
    const { result } = renderHook(() => usePins(pins({ prizes: [P1] })));
    await act(() => result.current.toggle({ kind: 'prize', id: P1 }));
    expect(getShowcasePins).toHaveBeenCalledOnce();
    expect(result.current.isPinned({ kind: 'prize', id: P1 })).toBe(false);
  });

  it('is busy while the request runs and ignores a second toggle', async () => {
    let finish: (value: { ok: true; data: ShowcasePins }) => void = () => {};
    vi.mocked(pinToShowcase).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { result } = renderHook(() => usePins(pins()));
    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.toggle({ kind: 'prize', id: P1 });
    });
    expect(result.current.busy).toBe(true);
    await act(() => result.current.toggle({ kind: 'prize', id: P2 }));
    expect(pinToShowcase).toHaveBeenCalledOnce();
    await act(async () => {
      finish({ ok: true, data: pins({ prizes: [P1] }) });
      await first;
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.pins).toEqual(pins({ prizes: [P1] }));
  });
});
