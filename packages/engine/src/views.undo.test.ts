import { describe, expect, it } from 'vitest';
import { lobbyWith, must } from './testing/helpers';
import { after1, T0, undoQuiz } from './testing/undo';
import { undoPanel, undoScore } from './undo';
import { hostView, playerView, stageView } from './views';

describe('the undo panel in the views', () => {
  it('the host view carries the panel, and null in the lobby', () => {
    expect(hostView(after1()).undo).toEqual(undoPanel(after1()));
    expect(hostView(after1()).undo).not.toBeNull();
    expect(hostView(lobbyWith(undoQuiz, 'Оля')).undo).toBeNull();
  });

  it('the stage and the phones never get it', () => {
    const s = after1();
    expect('undo' in stageView(s)).toBe(false);
    expect('undo' in playerView(s, 'p1')!).toBe(false);
    expect(JSON.stringify(stageView(s))).not.toContain('"undo":{"rounds"');
    expect(JSON.stringify(playerView(s, 'p1'))).not.toContain('"undo":{"rounds"');
  });

  it('everyone sees the notice; the breakdown and the leaderboard follow the undo', () => {
    const s = must(undoScore(after1(), { question: 0, playerId: 'p2' }, T0 + 3000));
    expect(stageView(s).notice?.undo).toBeDefined();
    expect(playerView(s, 'p2')!.notice?.undo).toBeDefined();
    expect(playerView(s, 'p2')!.myBreakdown!.parts).toContainEqual({ source: 'undo', plus: 1000, minus: 0 });
    expect(stageView(s).standings!.find((r) => r.nickname === 'Петро')!.score).toBe(0);
  });
});
