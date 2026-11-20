// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { keyboardOpened, viewportHeight } from './keyboard';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('keyboardOpened', () => {
  it('is true only when the visual viewport shrank by more than 100 px', () => {
    const viewport = { height: 700 };
    vi.stubGlobal('visualViewport', viewport);
    const before = viewportHeight();
    expect(before).toBe(700);
    expect(keyboardOpened(before)).toBe(false);
    viewport.height = 650;
    expect(keyboardOpened(before)).toBe(false);
    viewport.height = 400;
    expect(keyboardOpened(before)).toBe(true);
  });

  it('falls back to innerHeight without visualViewport', () => {
    vi.stubGlobal('visualViewport', undefined);
    expect(viewportHeight()).toBe(window.innerHeight);
    expect(keyboardOpened(window.innerHeight)).toBe(false);
  });
});
