import { describe, expect, it } from 'vitest';
import type { PlayerView, Reaction } from '@quiz/shared';
import { canReact, dropReaction, strayReactions, upsertReaction } from './reactions';

const reaction = (over: Partial<Reaction> = {}): Reaction => ({
  seq: 1,
  by: 'p1',
  nickname: 'Оля',
  rowId: 'p1',
  item: { kind: 'emoji', value: '👏' },
  ...over,
});

describe('upsertReaction / dropReaction', () => {
  it('a second reaction of the same person replaces the first and goes to the end; another person is added', () => {
    const first = reaction();
    const other = reaction({ seq: 2, by: 'p2', nickname: 'Петро', rowId: 'p2' });
    const again = reaction({ seq: 3, item: { kind: 'sticker', value: 'nyaBeach' } });
    const list = upsertReaction(upsertReaction(upsertReaction([], first), other), again);
    expect(list).toEqual([other, again]);
  });

  it('dropReaction removes by seq and leaves a newer reaction of the same person alone', () => {
    const list = [reaction({ seq: 1 }), reaction({ seq: 2, by: 'p2' })];
    expect(dropReaction(list, 1)).toEqual([reaction({ seq: 2, by: 'p2' })]);
    expect(dropReaction(list, 9)).toEqual(list);
  });
});

describe('canReact', () => {
  const survival = (over: Partial<NonNullable<PlayerView['me']['survival']>> = {}): PlayerView['me']['survival'] => ({
    status: 'edge',
    outAfter: null,
    ghostCorrect: null,
    canAnswerTrial: false,
    trialAnswer: null,
    canPickDoor: false,
    door: null,
    result: null,
    bonus: null,
    ...over,
  });
  const view = (phase: PlayerView['phase'], own: PlayerView['me']['survival'] = null) =>
    ({ phase, me: { survival: own } }) as unknown as PlayerView;

  it('is open between questions, on the round summary and the finish', () => {
    for (const phase of ['leaderboard', 'reveal', 'round_end', 'finished'] as const) expect(canReact(view(phase))).toBe(true);
  });

  it('is closed on the question, while locked and in the lobby', () => {
    for (const phase of ['question', 'locked', 'lobby'] as const) expect(canReact(view(phase))).toBe(false);
  });

  it('is closed while the phone shows a survival trial or the doors', () => {
    expect(canReact(view('leaderboard', survival()))).toBe(true);
    expect(canReact(view('leaderboard', survival({ canAnswerTrial: true })))).toBe(false);
    expect(canReact(view('leaderboard', survival({ canPickDoor: true })))).toBe(false);
  });
});

describe('strayReactions', () => {
  it('the host (rowId null) always goes to the strip; a mounted row does not', () => {
    const host = reaction({ seq: 1, by: 'host', nickname: null, rowId: null });
    const shown = reaction({ seq: 2, by: 'p1', rowId: 'p1' });
    const hidden = reaction({ seq: 3, by: 'p3', rowId: 'p3' });
    expect(strayReactions([host, shown, hidden], new Set(['p1', 'host']))).toEqual([host, hidden]);
  });
});
