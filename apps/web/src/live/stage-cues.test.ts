import type { StageView } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { ACCENT_SPLASHES, GONG_GRACE_MS, TICK_FROM_S, stageCues } from './stage-cues';

const stageView = (over: Record<string, unknown> = {}): StageView =>
  ({
    phase: 'question',
    paused: false,
    round: { index: 0 },
    questionIndex: 1,
    endsAt: null,
    remainingMs: null,
    held: false,
    splash: null,
    stats: null,
    ...over,
  }) as unknown as StageView;

const reveal = (accepted: number | null) => stageView({ phase: 'reveal', stats: { answered: 3, accepted, counts: {} } });
const counting = (over: Record<string, unknown> = {}) => stageView({ endsAt: 10_000, ...over });

describe('stageCues (40)', () => {
  it('the agreed constants', () => {
    expect(ACCENT_SPLASHES).toEqual(['round', 'final', 'duel', 'trial', 'blitz']);
    expect(GONG_GRACE_MS).toBe(1000);
    expect(TICK_FROM_S).toBe(5);
  });

  it('a reveal with a correct answer', () => {
    expect(stageCues(null, reveal(2), 0)).toEqual([{ sound: 'correct', key: 'reveal:0:1' }]);
    expect(stageCues(null, reveal(0), 0)).toEqual([{ sound: 'wrong', key: 'reveal:0:1' }]);
    expect(stageCues(null, reveal(null), 0)).toEqual([]);
    expect(stageCues(null, stageView({ phase: 'reveal', stats: null }), 0)).toEqual([]);
    expect(stageCues(null, stageView({ phase: 'reveal', round: null, questionIndex: 4, stats: { answered: 1, accepted: 1, counts: {} } }), 0)).toEqual([
      { sound: 'correct', key: 'reveal:-1:4' },
    ]);
  });

  it('ticks in the last five seconds', () => {
    expect(stageCues(null, counting(), 4_999)).toEqual([]);
    expect(stageCues(null, counting(), 5_000)).toEqual([{ sound: 'tick', key: 'tick:0:1:10000:5' }]);
    expect(stageCues(null, counting(), 5_500)).toEqual([{ sound: 'tick', key: 'tick:0:1:10000:5' }]);
    expect(stageCues(null, counting(), 6_000)).toEqual([{ sound: 'tick', key: 'tick:0:1:10000:4' }]);
    expect(stageCues(null, counting(), 9_000)).toEqual([{ sound: 'tick', key: 'tick:0:1:10000:1' }]);
    expect(stageCues(null, counting({ paused: true }), 6_000)).toEqual([]);
    expect(stageCues(null, counting({ remainingMs: 3000 }), 6_000)).toEqual([]);
    expect(stageCues(null, counting({ held: true }), 6_000)).toEqual([]);
    expect(stageCues(null, counting({ endsAt: null }), 6_000)).toEqual([]);
  });

  it('a gong when time runs out', () => {
    expect(stageCues(null, counting(), 10_000)).toEqual([{ sound: 'gong', key: 'gong:0:1:10000' }]);
    expect(stageCues(null, counting(), 12_000)).toEqual([{ sound: 'gong', key: 'gong:0:1:10000' }]);
    expect(stageCues(null, counting({ paused: true }), 12_000)).toEqual([]);
  });

  it('a gong on a lock the stage did not see coming', () => {
    const locked = stageView({ phase: 'locked' });
    expect(stageCues(counting(), locked, 9_200)).toEqual([{ sound: 'gong', key: 'gong:0:1:10000' }]);
    expect(stageCues(counting(), locked, 8_000)).toEqual([]);
    expect(stageCues(counting({ questionIndex: 0 }), locked, 9_200)).toEqual([]);
    expect(stageCues(counting({ paused: true }), locked, 9_200)).toEqual([]);
    expect(stageCues(null, locked, 9_200)).toEqual([]);
  });

  it('a gong at the end of each stage timer of one question', () => {
    // Блеф: «вигадки» до 10 000, далі вибір до 30 000 — той самий q, новий endsAt.
    expect(stageCues(null, counting(), 10_000)).toEqual([{ sound: 'gong', key: 'gong:0:1:10000' }]);
    expect(stageCues(counting(), counting({ endsAt: 30_000 }), 10_100)).toEqual([]);
    expect(stageCues(null, counting({ endsAt: 30_000 }), 30_000)).toEqual([{ sound: 'gong', key: 'gong:0:1:30000' }]);
    // Швидкий перехід з другого етапу на locked — гонг за таймером prev.
    expect(stageCues(counting({ endsAt: 30_000 }), stageView({ phase: 'locked' }), 29_500)).toEqual([{ sound: 'gong', key: 'gong:0:1:30000' }]);
  });

  it('a gong when the next stage of the same question arrives before the stage saw zero (bluff, spy)', () => {
    // Сервер перемкнув етап за часом (строго після endsAt), а сцена ще не бачила нуля: новий таймер того самого запитання.
    const lies = counting({ bluff: { stage: 'lies' } });
    const choice = counting({ endsAt: 35_000, bluff: { stage: 'choice' } });
    expect(stageCues(lies, choice, 10_050)).toEqual([{ sound: 'gong', key: 'gong:0:1:10000' }]);
    expect(stageCues(counting({ spy: { stage: 'words' } }), counting({ endsAt: 35_000, spy: { stage: 'vote' } }), 9_500)).toEqual([{ sound: 'gong', key: 'gong:0:1:10000' }]);
    // Ведучий перемкнув етап задовго до кінця — без гонгу.
    expect(stageCues(lies, choice, 4_000)).toEqual([]);
    // «+15 с» в останню секунду: той самий етап, новий endsAt — без гонгу (і без цокання, бо до кінця ще 15 с).
    expect(stageCues(lies, counting({ endsAt: 25_000, bluff: { stage: 'lies' } }), 9_500)).toEqual([]);
  });

  it('a pause or +15 s moves the countdown to the new timer', () => {
    expect(stageCues(null, counting({ endsAt: 25_000 }), 21_000)).toEqual([{ sound: 'tick', key: 'tick:0:1:25000:4' }]);
    expect(stageCues(null, counting({ endsAt: 25_000 }), 25_000)).toEqual([{ sound: 'gong', key: 'gong:0:1:25000' }]);
  });

  it('an accent on a round splash', () => {
    const splash = (kind: string) => stageView({ phase: 'lobby', splash: { kind, at: 0, until: 3500 } });
    expect(stageCues(null, splash('round'), 1000)).toEqual([{ sound: 'accent', key: 'splash:round:0' }]);
    expect(stageCues(null, splash('round'), 3600)).toEqual([]);
    for (const kind of ['final', 'duel', 'trial', 'blitz']) expect(stageCues(null, splash(kind), 1000)).toEqual([{ sound: 'accent', key: `splash:${kind}:0` }]);
    for (const kind of ['question', 'cell', 'podium']) expect(stageCues(null, splash(kind), 1000)).toEqual([]);
    expect(stageCues(null, stageView({ paused: true, splash: { kind: 'round', at: 0, until: 3500 } }), 1000)).toEqual([]);
  });

  it('fanfare on the finish', () => {
    expect(stageCues(null, stageView({ phase: 'finished', splash: { kind: 'podium', at: 0, until: 2500 } }), 1000)).toEqual([{ sound: 'fanfare', key: 'fanfare' }]);
  });
});
