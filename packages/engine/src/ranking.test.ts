import { describe, expect, it } from 'vitest';
import { rankPlayers } from './ranking';

const player = (id: string, score: number, totalTimeMs: number) => ({ id, nickname: id, score, totalTimeMs });

describe('rankPlayers', () => {
  it('orders by score, highest first', () => {
    const standings = rankPlayers([player('a', 100, 0), player('b', 300, 0), player('c', 200, 0)]);
    expect(standings.map((s) => [s.participantId, s.rank])).toEqual([
      ['b', 1],
      ['c', 2],
      ['a', 3],
    ]);
  });

  it('breaks a score tie by the lower total time', () => {
    const standings = rankPlayers([player('slow', 500, 9000), player('fast', 500, 4000)]);
    expect(standings.map((s) => [s.participantId, s.rank])).toEqual([
      ['fast', 1],
      ['slow', 2],
    ]);
  });

  it('gives equal score and time the same rank and skips the next one', () => {
    const standings = rankPlayers([player('a', 500, 4000), player('b', 500, 4000), player('c', 100, 4000)]);
    expect(standings.map((s) => s.rank)).toEqual([1, 1, 3]);
  });

  it('returns an empty list for no players', () => {
    expect(rankPlayers([])).toEqual([]);
  });
});
