// @vitest-environment jsdom
import { PROBLEM_MOMENT_MAX_AGE_MS } from '@quiz/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MOMENT_KEY, clearMoment, momentOf, readMoment, saveMoment } from './problem-moment';

const asked = { phase: 'question', round: { index: 1, title: 'Кіно' }, questionIndex: 2, question: { type: 'single' as const, text: 'Хто зняв фільм?' } };
const lobby = { phase: 'lobby', round: null, questionIndex: -1, question: null };

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('momentOf', () => {
  it('takes the round, the question number, its type and text as the person sees them', () => {
    expect(momentOf('123456', 'player', asked)).toEqual({ code: '123456', role: 'player', phase: 'question', round: 1, roundTitle: 'Кіно', question: 2, type: 'single', text: 'Хто зняв фільм?' });
  });
  it('in the lobby the round and the question are empty', () => {
    expect(momentOf('123456', 'host', lobby)).toEqual({ code: '123456', role: 'host', phase: 'lobby', round: null, roundTitle: null, question: null, type: null, text: null });
  });
});

describe('readMoment', () => {
  const NOW = 1_700_000_000_000;
  it('returns the moment for the same room', () => {
    saveMoment(momentOf('123456', 'player', asked), NOW);
    expect(readMoment('/play/123456', NOW + 1000)?.question).toBe(2);
    expect(readMoment('/host/123456', NOW + 1000)?.code).toBe('123456');
  });
  it('the admin bot host screen /bot-host/<code> gives the moment of its room', () => {
    saveMoment(momentOf('123456', 'host', asked), NOW);
    expect(readMoment('/bot-host/123456', NOW + 1000)?.code).toBe('123456');
    expect(readMoment('/bot-host/654321', NOW + 1000)).toBeNull();
  });
  it('another room code, a page that is not a game, and a missing record give null', () => {
    saveMoment(momentOf('123456', 'player', asked), NOW);
    expect(readMoment('/play/654321', NOW)).toBeNull();
    expect(readMoment('/report', NOW)).toBeNull();
    expect(readMoment('/', NOW)).toBeNull();
    clearMoment();
    expect(readMoment('/play/123456', NOW)).toBeNull();
  });
  it('older than 30 minutes gives null', () => {
    saveMoment(momentOf('123456', 'player', asked), NOW);
    expect(readMoment('/play/123456', NOW + PROBLEM_MOMENT_MAX_AGE_MS)).not.toBeNull();
    expect(readMoment('/play/123456', NOW + PROBLEM_MOMENT_MAX_AGE_MS + 1)).toBeNull();
  });
  it('broken JSON or a wrong shape give null', () => {
    localStorage.setItem(MOMENT_KEY, '{oops');
    expect(readMoment('/play/123456', NOW)).toBeNull();
    localStorage.setItem(MOMENT_KEY, JSON.stringify({ code: '123456', at: NOW, role: 'admin' }));
    expect(readMoment('/play/123456', NOW)).toBeNull();
  });
});
