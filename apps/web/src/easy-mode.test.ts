// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyEasyClass, easyActive, easyModeOn, loadEasyChoice, resetEasyForTests, setEasyMode, subscribeEasyMode, syncAccountEasy } from './easy-mode';
import { reducedMotion } from './motion';

const html = () => document.documentElement;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  resetEasyForTests();
  html().classList.remove('is-easy');
});

describe('easy mode store (31)', () => {
  it('without a key it is off and the device has not chosen', () => {
    expect(easyModeOn()).toBe(false);
    expect(loadEasyChoice()).toBeNull();
  });

  it('setEasyMode writes quiz:easy and tells the listeners', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeEasyMode(listener);
    setEasyMode(true);
    expect(localStorage.getItem('quiz:easy')).toBe('on');
    expect(easyModeOn()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    setEasyMode(false);
    expect(localStorage.getItem('quiz:easy')).toBe('off');
    expect(easyModeOn()).toBe(false);
    unsubscribe();
    setEasyMode(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('the profile turns it on only where the device never chose, and writes no key', () => {
    syncAccountEasy(true, 'u1');
    expect(easyModeOn()).toBe(true);
    expect(localStorage.getItem('quiz:easy')).toBeNull();
    // Інший акаунт без режиму скидає увімкнене профілем.
    syncAccountEasy(false, 'u2');
    expect(easyModeOn()).toBe(false);
    // Вихід з акаунта — так само.
    syncAccountEasy(true, 'u1');
    syncAccountEasy(false, null);
    expect(easyModeOn()).toBe(false);
  });

  it('an explicit «off» on the device wins over the profile', () => {
    localStorage.setItem('quiz:easy', 'off');
    syncAccountEasy(true, 'u1');
    expect(easyModeOn()).toBe(false);
  });

  it('the next explicit device choice beats the profile', () => {
    syncAccountEasy(true, 'u1');
    setEasyMode(false);
    expect(easyModeOn()).toBe(false);
  });

  it('private mode: setEasyMode does not throw and the mode holds until a reload', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => setEasyMode(true)).not.toThrow();
    expect(easyModeOn()).toBe(true);
  });

  it('applyEasyClass puts is-easy on <html> everywhere but the stage', () => {
    setEasyMode(true);
    applyEasyClass('/play/123456');
    expect(html().classList.contains('is-easy')).toBe(true);
    expect(easyActive()).toBe(true);
    applyEasyClass('/stage/123456');
    expect(html().classList.contains('is-easy')).toBe(false);
    setEasyMode(false);
    applyEasyClass('/play/123456');
    expect(html().classList.contains('is-easy')).toBe(false);
    expect(easyActive()).toBe(false);
  });

  it('reducedMotion() is true when <html> has is-easy', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }));
    expect(reducedMotion()).toBe(false);
    html().classList.add('is-easy');
    expect(reducedMotion()).toBe(true);
  });
});
