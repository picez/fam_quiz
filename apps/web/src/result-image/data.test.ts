import { describe, expect, it } from 'vitest';
import type { GameDetail, HostView, PlayerView } from '@quiz/shared';
import { pickHighlights, podiumOf, resultFromHistory, resultFromHost, resultFromPlayer } from './data';

const row = (nickname: string, score: number, rank: number | null, participantId = nickname) => ({ participantId, nickname, score, rank, totalTimeMs: 0 });
const NOW = new Date('2026-11-18T10:00:00Z');
const player = (extra: object): PlayerView => ({ role: 'player', ...extra }) as unknown as PlayerView;

describe('podiumOf', () => {
  it('podiumOf keeps ranks 1 to 3 and ties', () => {
    expect(podiumOf([row('a', 9, 1), row('b', 9, 1), row('c', 5, 3), row('d', 4, 4)]).map((r) => r.place)).toEqual([1, 1, 3]);
    expect(podiumOf([1, 2, 2, 2, 2, 2, 7].map((rank, i) => row(`p${i}`, 10 - i, rank)))).toHaveLength(5);
    expect(podiumOf([row('a', 9, null), row('b', 8, 1)]).map((r) => r.name)).toEqual(['b']);
    expect(podiumOf([row('solo', 7, 1)])).toEqual([{ place: 1, name: 'solo', score: 7 }]);
  });
});

describe('resultFromPlayer', () => {
  const standings = [1, 2, 3, 4, 5, 6].map((rank) => row(`n${rank}`, 700 - rank * 100, rank));
  it('adds me outside the podium', () => {
    expect(resultFromPlayer(player({ me: { id: 'n5' }, standings }), 'Q', NOW, 'x.y').me).toEqual({ place: 5, total: 6, score: 200 });
    expect(resultFromPlayer(player({ me: { id: 'n2' }, standings }), 'Q', NOW, 'x.y').me).toBeNull();
    const tie = [row('a', 9, 1), row('b', 8, 2), row('c', 7, 3), row('d', 7, 3), row('e', 1, 5)];
    expect(resultFromPlayer(player({ me: { id: 'd' }, standings: tie }), 'Q', NOW, 'x.y').me).toBeNull();
  });
  it('in a team game uses team rows', () => {
    const teams = [row('Лисиці', 900, 1, 't1'), row('Вовки', 500, 2, 't2'), row('Ведмеді', 300, 3, 't3'), row('Зайці', 100, 4, 't4')];
    const data = resultFromPlayer(player({ me: { id: 't4' }, standings: teams }), 'Q', NOW, 'x.y');
    expect(data.podium.map((r) => r.name)).toEqual(['Лисиці', 'Вовки', 'Ведмеді']);
    expect(data.me).toEqual({ place: 4, total: 4, score: 100 });
  });
  it('takes own achievements, four and more', () => {
    const ids = ['first_game', 'first_win', 'games_10', 'sniper', 'host', 'comeback'];
    const data = resultFromPlayer(player({ me: { id: 'x' }, standings: [], newAchievements: { account: true, ids } }), 'Q', NOW, 'x.y');
    expect(data.achievements).toHaveLength(4);
    expect(data.achievements.every((a) => a.nickname === null)).toBe(true);
    expect(data.moreAchievements).toBe(2);
    const guest = resultFromPlayer(player({ me: { id: 'x' }, standings: [], newAchievements: { account: false, ids: [] } }), 'Q', NOW, 'x.y');
    expect([guest.achievements, guest.moreAchievements]).toEqual([[], 0]);
    const none = resultFromPlayer(player({ me: { id: 'x' }, standings: [] }), 'Q', NOW, 'x.y');
    expect([none.achievements, none.moreAchievements]).toEqual([[], 0]);
  });
  it('prizes take only places with a winner', () => {
    const places = [
      { place: 1, content: { trophy: { kind: 'cup', material: 'gold', decor: null } }, winner: { name: 'Оля', members: [] } },
      { place: 2, content: { trophy: null }, winner: { name: 'Петро', members: [] } },
      { place: 3, content: { trophy: { kind: 'medal', material: 'bronze' } }, winner: null },
    ];
    const data = resultFromPlayer(player({ me: { id: 'x' }, standings: [], prizes: { places, mine: null } }), 'Q', NOW, 'x.y');
    expect(data.prizes).toEqual([
      { place: 1, trophy: { kind: 'cup', material: 'gold' }, winners: ['Оля'] },
      { place: 2, trophy: null, winners: ['Петро'] },
    ]);
    expect(resultFromPlayer(player({ me: { id: 'x' }, standings: [] }), 'Q', NOW, 'x.y').prizes).toEqual([]);
  });
});

describe('pickHighlights', () => {
  it('pickHighlights mixes people and puts one-off before counters and anti last', () => {
    const { picked, more } = pickHighlights([{ nickname: 'Оля', ids: ['games_10', 'sniper', 'in_debt'] }, { nickname: 'Петро', ids: ['fast_answer'] }], 4);
    expect(picked).toEqual([
      { id: 'sniper', nickname: 'Оля' },
      { id: 'fast_answer', nickname: 'Петро' },
      { id: 'games_10', nickname: 'Оля' },
      { id: 'in_debt', nickname: 'Оля' },
    ]);
    expect(more).toBe(0);
    const seven = pickHighlights([{ nickname: 'A', ids: ['first_game', 'first_win', 'sniper', 'host'] }, { nickname: 'B', ids: ['comeback', 'eagle_eye', 'jeweler'] }], 4);
    expect(seven.picked).toHaveLength(4);
    expect(seven.more).toBe(3);
    expect(new Set(seven.picked.map((p) => p.nickname)).size).toBe(2);
  });
});

describe('resultFromHost and resultFromHistory', () => {
  it('resultFromHost uses room achievements and has no me', () => {
    const view = { role: 'host', standings: [row('a', 5, 1)], newAchievements: { people: [{ nickname: 'Оля', ids: ['sniper'] }] } } as unknown as HostView;
    const data = resultFromHost(view, 'Q', NOW, 'x.y');
    expect(data.me).toBeNull();
    expect(data.achievements).toEqual([{ id: 'sniper', nickname: 'Оля' }]);
    expect(resultFromHost({ role: 'host', standings: [] } as unknown as HostView, 'Q', NOW, 'x.y').achievements).toEqual([]);
  });
  it('resultFromHistory', () => {
    const game = {
      title: 'Зимова', startedAt: '2026-11-17T18:00:00Z', finishedAt: '2026-11-17T19:00:00Z',
      standings: [row('a', 5, 1), row('b', 3, 2)],
      result: { prizes: [{ place: 1, trophy: { kind: 'cup', material: 'gold' }, winners: ['a'] }], achievements: [{ nickname: 'a', ids: ['sniper'] }] },
    } as unknown as GameDetail;
    const data = resultFromHistory(game, 'x.y');
    expect(data.date.toISOString()).toBe('2026-11-17T19:00:00.000Z');
    expect(data.quizTitle).toBe('Зимова');
    expect(data.podium).toHaveLength(2);
    expect(data.prizes).toHaveLength(1);
    expect(data.achievements).toEqual([{ id: 'sniper', nickname: 'a' }]);
    const old = resultFromHistory({ ...game, finishedAt: null, result: undefined } as unknown as GameDetail, 'x.y');
    expect(old.date.toISOString()).toBe('2026-11-17T18:00:00.000Z');
    expect([old.prizes, old.achievements, old.moreAchievements]).toEqual([[], [], 0]);
  });
});
