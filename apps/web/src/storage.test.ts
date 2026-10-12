// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { clearPlayer, loadHost, loadPlayer, saveHost, savePlayer } from './storage';

beforeEach(() => localStorage.clear());

describe('storage', () => {
  it('remembers a player token per game code', () => {
    savePlayer('123456', 'tok-a');
    savePlayer('654321', 'tok-b');
    expect(loadPlayer('123456')).toBe('tok-a');
    expect(loadPlayer('654321')).toBe('tok-b');
    expect(loadPlayer('000000')).toBeNull();
  });

  it('forgets a player token', () => {
    savePlayer('123456', 'tok-a');
    clearPlayer('123456');
    expect(loadPlayer('123456')).toBeNull();
  });

  it('remembers host and stage tokens together', () => {
    saveHost('123456', { hostToken: 'h', stageToken: 's' });
    expect(loadHost('123456')).toEqual({ hostToken: 'h', stageToken: 's' });
    expect(loadHost('000000')).toBeNull();
  });

  it('treats corrupted data as missing', () => {
    localStorage.setItem('quiz:host:123456', '{not json');
    localStorage.setItem('quiz:host:654321', '{"hostToken":1}');
    expect(loadHost('123456')).toBeNull();
    expect(loadHost('654321')).toBeNull();
  });
});
