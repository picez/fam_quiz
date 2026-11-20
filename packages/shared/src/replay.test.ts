import { describe, expect, it } from 'vitest';
import type { Answer } from './answer';
import { GAME_EVENT_KINDS, REPLAY_VOTE_ATTEMPT, replayVerdict } from './replay';

const text: Answer = { type: 'text', value: 'Київ' };

describe('game replay (65)', () => {
  it('the verdict follows the stored row', () => {
    expect(replayVerdict({ accepted: true, points: 100, payload: text, attempt: 0 }, false)).toBe('correct');
    expect(replayVerdict({ accepted: false, points: 50, payload: text, attempt: 0 }, false)).toBe('partial');
    expect(replayVerdict({ accepted: false, points: -100, payload: text, attempt: 0 }, false)).toBe('wrong');
    expect(replayVerdict({ accepted: false, points: 0, payload: text, attempt: 0 }, false)).toBe('wrong');
    expect(replayVerdict({ accepted: false, points: 0, payload: null, attempt: 0 }, false)).toBe('none');
    expect(replayVerdict({ accepted: true, points: 100, payload: text, attempt: 0 }, true)).toBe('none');
    expect(replayVerdict({ accepted: false, points: -100, payload: text, attempt: 0 }, true)).toBe('none');
    expect(replayVerdict({ accepted: true, points: 100, payload: text, attempt: REPLAY_VOTE_ATTEMPT }, false)).toBe('none');
    expect(REPLAY_VOTE_ATTEMPT).toBe(-3);
  });

  it('event kinds', () => {
    expect([...GAME_EVENT_KINDS]).toEqual(['start', 'join', 'leave', 'pause', 'resume', 'verdict']);
  });
});
