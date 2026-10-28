// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAuthor, clearPlayer, loadAlarmSeen, loadAuthor, loadHost, loadPlayer, saveAlarmSeen, saveAuthor, saveHost, savePlayer } from './storage';

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

  it('a hosted game on a reused code forgets the old author key for that code', () => {
    saveAuthor('123456', { stageToken: 's' });
    saveAuthor('654321', { stageToken: 'kept' });
    saveHost('123456', { hostToken: 'h', stageToken: 's2' });
    expect(loadAuthor('123456')).toBeNull();
    expect(loadAuthor('654321')).toEqual({ stageToken: 'kept' });
  });

  it('forgets the author key', () => {
    saveAuthor('123456', { stageToken: 's' });
    clearAuthor('123456');
    expect(loadAuthor('123456')).toBeNull();
  });

  it('remembers the author stage token apart from host tokens', () => {
    saveAuthor('123456', { stageToken: 's' });
    expect(loadAuthor('123456')).toEqual({ stageToken: 's' });
    expect(loadAuthor('000000')).toBeNull();
    expect(loadHost('123456')).toBeNull();
    expect(localStorage.getItem('quiz:author:123456')).not.toBeNull();
  });

  it('treats corrupted author data as missing', () => {
    localStorage.setItem('quiz:author:123456', '{not json');
    localStorage.setItem('quiz:author:654321', '{"stageToken":1}');
    expect(loadAuthor('123456')).toBeNull();
    expect(loadAuthor('654321')).toBeNull();
  });

  it('remembers the last leave that already alarmed under one device key (12e)', () => {
    expect(loadAlarmSeen()).toBeNull();
    saveAlarmSeen('123456:p1:3:1');
    expect(loadAlarmSeen()).toBe('123456:p1:3:1');
    saveAlarmSeen('654321:m2:0:2');
    expect(loadAlarmSeen()).toBe('654321:m2:0:2');
    expect(localStorage.getItem('quiz:alarm')).toBe('654321:m2:0:2');
  });

  it('a throwing localStorage reads the alarm key as missing and writes nothing, without an error', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => saveAlarmSeen('123456:p1:3:1')).not.toThrow();
    expect(loadAlarmSeen()).toBeNull();
    getItem.mockRestore();
    setItem.mockRestore();
  });
});
