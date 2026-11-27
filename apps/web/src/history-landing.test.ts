import { describe, expect, it } from 'vitest';
import { HISTORY_TAB_PATH, landingTab } from './history-landing';

describe('landingTab (79)', () => {
  it('the tab chosen on this device wins', () => {
    expect(landingTab('hosted', 0, 9)).toBe('hosted');
    expect(landingTab('challenges', 5, 0)).toBe('challenges');
    expect(landingTab('played', 5, 0)).toBe('played');
  });

  it('without a choice — the tab with more games; a tie stays on «Проведені»', () => {
    expect(landingTab(null, 0, 3)).toBe('played');
    expect(landingTab(null, 2, 3)).toBe('played');
    expect(landingTab(null, 3, 3)).toBe('hosted');
    expect(landingTab(null, 4, 1)).toBe('hosted');
    expect(landingTab(null, 0, 0)).toBe('hosted');
  });

  it('a failed list (null) keeps «Проведені»', () => {
    expect(landingTab(null, null, 3)).toBe('hosted');
    expect(landingTab(null, 0, null)).toBe('hosted');
  });

  it('each tab has its address', () => {
    expect(HISTORY_TAB_PATH).toEqual({ hosted: '/history', played: '/me', challenges: '/history/challenges' });
  });
});
