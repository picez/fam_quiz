// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sirenReady, unlockSiren } from '../siren';
import { useSirenUnlock } from './useSirenUnlock';

vi.mock('../siren', () => ({ sirenReady: vi.fn(() => false), unlockSiren: vi.fn() }));

beforeEach(() => {
  vi.mocked(unlockSiren).mockClear();
  vi.mocked(sirenReady).mockReturnValue(false);
});
afterEach(cleanup);

describe('useSirenUnlock', () => {
  it('a tap, a click or a key unlocks the siren; a pointerdown does not', () => {
    renderHook(() => useSirenUnlock());
    document.dispatchEvent(new Event('pointerdown'));
    expect(unlockSiren).not.toHaveBeenCalled();
    document.dispatchEvent(new Event('touchend'));
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(unlockSiren).toHaveBeenCalledTimes(3);
  });

  it('listens in the capture phase, so a stopped click still unlocks', () => {
    renderHook(() => useSirenUnlock());
    const button = document.createElement('button');
    button.addEventListener('click', (event) => event.stopPropagation());
    document.body.append(button);
    button.click();
    expect(unlockSiren).toHaveBeenCalledTimes(1);
    button.remove();
  });

  it('a running context needs nothing; once it is suspended again (background) the next gesture wakes it', () => {
    renderHook(() => useSirenUnlock());
    vi.mocked(sirenReady).mockReturnValue(true);
    document.dispatchEvent(new Event('touchend'));
    expect(unlockSiren).not.toHaveBeenCalled();
    vi.mocked(sirenReady).mockReturnValue(false);
    document.dispatchEvent(new Event('touchend'));
    expect(unlockSiren).toHaveBeenCalledTimes(1);
  });

  it('stops listening on unmount', () => {
    const hook = renderHook(() => useSirenUnlock());
    hook.unmount();
    document.dispatchEvent(new Event('touchend'));
    expect(unlockSiren).not.toHaveBeenCalled();
  });
});
