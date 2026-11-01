import { describe, expect, it } from 'vitest';
import type { Quiz, QuizSettings } from '@quiz/shared';
import { setDebuff } from './debuffs';
import { next, start, type GameState } from './game';
import { grantPerks } from './perks';
import { classicRound, makeRoundsQuiz, single, withId } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';
import { hostView, playerView, stageView } from './views';

const T0 = 1_000_000;

function quiz(settings: Partial<QuizSettings> = {}): Quiz {
  return makeRoundsQuiz([classicRound('r1', [{ ...single, hint: 'Місто Лева' }, withId(single, 'q2')])], { buffs: ['time'], ...settings });
}

function opened(settings: Partial<QuizSettings> = {}, grant = true): GameState {
  const started = must(start(lobbyWith(quiz(settings), 'Оля', 'Петро')));
  const granted = grant ? grantPerks(started, { p1: { kinds: ['time', 'hint', 'ward'], timeMs: 5000 } }) : started;
  return must(next(granted, T0, () => 0));
}

describe('level perks in views', () => {
  it('the phone row lists the active perks, the ward stays off the row', () => {
    expect(playerView(opened(), 'p1')?.me.perks).toEqual({
      items: [
        { kind: 'time', block: null },
        { kind: 'hint', block: null },
      ],
      timeMs: 5000,
      hint: null,
    });
    expect(playerView(opened(), 'p2')?.me.perks).toBeNull();
  });

  it('wards show on the host and on phones, ready then spent', () => {
    const s = opened();
    expect(hostView(s).wards).toEqual({ p1: 'ready' });
    expect(playerView(s, 'p2')?.wards).toEqual({ p1: 'ready' });
    expect(playerView(s, 'p1')?.wards).toEqual({ p1: 'ready' });
    const spent = must(setDebuff(s, 'p1', 'fog'));
    expect(hostView(spent).wards).toEqual({ p1: 'spent' });
    expect(playerView(spent, 'p2')?.wards).toEqual({ p1: 'spent' });
    // без оберегів ключа немає
    const none = opened({}, false);
    expect(hostView(none)).not.toHaveProperty('wards');
    expect(playerView(none, 'p1')).not.toHaveProperty('wards');
    expect(stageView(s)).not.toHaveProperty('wards');
  });

  it('the shop marks a warded target', () => {
    const shop = playerView(opened(), 'p2')?.me.shop;
    expect(shop?.targets).toEqual([expect.objectContaining({ playerId: 'p1', warded: true })]);
    const spent = must(setDebuff(opened(), 'p1', 'fog'));
    expect(playerView(spent, 'p2')?.me.shop?.targets).toEqual([expect.objectContaining({ playerId: 'p1', warded: false })]);
    expect(playerView(opened(), 'p1')?.me.shop?.targets).toEqual([expect.objectContaining({ playerId: 'p2', warded: false })]);
  });

  it('the switch off shows on every view; on — no key', () => {
    const off = opened({ levelBonuses: false });
    expect(stageView(off).levelBonuses).toBe(false);
    expect(hostView(off).levelBonuses).toBe(false);
    expect(playerView(off, 'p1')?.levelBonuses).toBe(false);
    expect(playerView(off, 'p1')?.me.perks).toBeNull();
    const lobby = lobbyWith(quiz({ levelBonuses: false }), 'Оля');
    expect(playerView(lobby, 'p1')?.levelBonuses).toBe(false);
    const on = opened();
    expect(stageView(on)).not.toHaveProperty('levelBonuses');
    expect(hostView(on)).not.toHaveProperty('levelBonuses');
    expect(playerView(on, 'p1')).not.toHaveProperty('levelBonuses');
  });
});
