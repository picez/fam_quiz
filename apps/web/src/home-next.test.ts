import { describe, expect, it } from 'vitest';
import type { CalendarEvent, GameSummary, SavedInfo } from '@quiz/shared';
import { pickNextUp } from './home-next';

const DAY = 86_400_000;
const NOW = Date.parse('2026-11-19T12:00:00.000Z');

function game(id: string, saved?: Partial<SavedInfo>): GameSummary {
  return {
    id,
    title: `Гра ${id}`,
    code: '123456',
    status: saved ? 'saved' : 'finished',
    startedAt: '2026-11-01T18:00:00.000Z',
    finishedAt: null,
    playerCount: 3,
    questionsPlayed: 4,
    questionCount: 10,
    teams: false,
    autopilot: false,
    ...(saved ? { saved: { mode: 'exact', open: false, openCode: null, savedAt: '2026-11-10T10:00:00.000Z', ...saved } as SavedInfo } : {}),
  } as GameSummary;
}

function event(id: string, startsInMs: number, extra: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id,
    title: `Подія ${id}`,
    startsAt: new Date(NOW + startsInMs).toISOString(),
    host: { id: 'h1', nickname: 'Оксана', avatar: null },
    mine: true,
    quiz: { id: 'q1', title: 'Вікторина' },
    state: 'planned',
    editedAt: null,
    cancelledAt: null,
    approved: 0,
    myRequest: null,
    requests: [],
    joinCode: null,
    ...extra,
  };
}

const RUNNING = { code: '654321', title: 'Жива', to: '/host/654321' };

describe('pickNextUp', () => {
  it('puts a running game before anything else', () => {
    expect(pickNextUp(RUNNING, [game('a', {})], [event('e', DAY)])).toEqual({ kind: 'running', ...RUNNING });
  });

  it('without a running game takes the newest saved game that can be continued', () => {
    const games = [
      game('old', { savedAt: '2026-11-05T10:00:00.000Z' }),
      game('new', { savedAt: '2026-11-15T10:00:00.000Z' }),
      game('open', { savedAt: '2026-11-18T10:00:00.000Z', open: true, openCode: '111111' }),
      game('blocked', { savedAt: '2026-11-18T11:00:00.000Z', mode: 'blocked' }),
      game('done'),
    ];
    expect(pickNextUp(null, games, [event('e', DAY)])).toEqual({ kind: 'saved', game: games[1] });
  });

  it('skips open and blocked saved games', () => {
    const games = [game('open', { open: true, openCode: '111111' }), game('blocked', { mode: 'blocked' })];
    const soon = event('e', DAY);
    expect(pickNextUp(null, games, [soon])).toEqual({ kind: 'event', event: soon });
  });

  it('without games takes the nearest calendar event, mine or approved', () => {
    const mine = event('mine', 2 * DAY);
    const theirs = event('theirs', DAY / 4, { mine: false, myRequest: 'approved', state: 'open' });
    expect(pickNextUp(null, [], [mine, theirs])).toEqual({ kind: 'event', event: theirs });
  });

  it('never takes cancelled, played, missed, unapproved or pending events', () => {
    const events = [
      event('cancelled', DAY, { state: 'cancelled' }),
      event('played', -DAY, { state: 'played' }),
      event('missed', -DAY, { state: 'missed' }),
      event('stranger', DAY, { mine: false, myRequest: null }),
      event('pending', DAY, { mine: false, myRequest: 'pending' }),
      event('rejected', DAY, { mine: false, myRequest: 'rejected' }),
    ];
    expect(pickNextUp(null, [], events)).toBeNull();
  });

  it('gives nothing for failed (null) or empty lists', () => {
    expect(pickNextUp(null, null, null)).toBeNull();
    expect(pickNextUp(null, [], [])).toBeNull();
    expect(pickNextUp(null, [game('done')], null)).toBeNull();
  });
});
