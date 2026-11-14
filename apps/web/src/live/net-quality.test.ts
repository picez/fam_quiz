import { describe, expect, it } from 'vitest';
import { initialNet, isStale, onPong, onReconnect, onTimeout, shouldForceReconnect, STALE_AFTER_MS, type NetState } from './net-quality';

const pongs = (state: NetState, ...rtts: number[]) => rtts.reduce((current, rtt, index) => onPong(current, rtt, 1000 * (index + 1)), state);
const timeouts = (state: NetState, count: number) => Array.from({ length: count }).reduce<NetState>((current) => onTimeout(current), state);

describe('connection quality', () => {
  it('says nothing before the server has answered a ping once (an old server during a deploy)', () => {
    const state = timeouts(initialNet, 5);
    expect(state).toBe(initialNet);
    expect(state.quality).toBe('good');
    expect(shouldForceReconnect(state)).toBe(false);
  });

  it('is good on quick answers and weak on a slow median of three', () => {
    expect(pongs(initialNet, 100, 120, 90).quality).toBe('good');
    expect(pongs(initialNet, 900, 1000, 850).quality).toBe('weak');
    // Один повільний серед швидких — медіана швидка.
    expect(pongs(initialNet, 100, 2000, 90).quality).toBe('good');
  });

  it('turns weak on any recent timeout and needs three quick answers in a row to be good again', () => {
    let state = onTimeout(pongs(initialNet, 100, 100, 100));
    expect(state.quality).toBe('weak');
    state = pongs(state, 400, 300);
    expect(state.quality).toBe('weak');
    state = onPong(state, 450, 9000);
    expect(state.quality).toBe('good');
  });

  it('keeps its verdict in the band between 500 and 800 ms', () => {
    const weak = pongs(initialNet, 900, 900, 900);
    expect(pongs(weak, 600, 600, 600).quality).toBe('weak');
    const good = pongs(initialNet, 100, 100, 100);
    expect(pongs(good, 600, 600, 600).quality).toBe('good');
  });

  it('asks for a reconnect after three missed pings in a row, and an answer resets the count', () => {
    const answered = pongs(initialNet, 100);
    expect(shouldForceReconnect(timeouts(answered, 2))).toBe(false);
    const stuck = timeouts(answered, 3);
    expect(shouldForceReconnect(stuck)).toBe(true);
    expect(shouldForceReconnect(onPong(stuck, 100, 5000))).toBe(false);
    expect(onPong(stuck, 100, 5000).misses).toBe(0);
  });

  it('is stale 15 s after the last answer', () => {
    const state = onPong(initialNet, 100, 1000);
    expect(isStale(initialNet, 1_000_000)).toBe(false);
    expect(isStale(state, 1000 + STALE_AFTER_MS)).toBe(false);
    expect(isStale(state, 1000 + STALE_AFTER_MS + 1)).toBe(true);
  });

  it('keeps only the last three samples', () => {
    const state = onTimeout(pongs(initialNet, 1, 2, 3, 4));
    expect(state.samples).toEqual([3, 4, 'timeout']);
  });

  it('a reconnect clears samples and misses but keeps what it knows', () => {
    const state = onReconnect(timeouts(pongs(initialNet, 900, 900, 900), 2));
    expect(state.samples).toEqual([]);
    expect(state.misses).toBe(0);
    expect(state.supported).toBe(true);
    expect(state.quality).toBe('weak');
  });
});
