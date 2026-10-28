import { describe, expect, it } from 'vitest';
import type { ResumeLobby, ResumeOption } from '@quiz/shared';
import { emptyDraft, fillFromGame, parsePoints, resumeOptionText, resumePayload, resumeRoundText, unmatchedIn } from './resume';

const info: ResumeLobby = {
  rounds: [
    { title: 'Розминка', type: 'classic' },
    { title: '', type: 'classic' },
    { title: 'Гори', type: 'classic' },
  ],
  participants: [
    { id: 'p1', nickname: 'оля' },
    { id: 'p2', nickname: 'Петро' },
    { id: 'p3', nickname: 'Тарас' },
  ],
};

describe('resume helpers', () => {
  it('parses points like 42434, with spaces and a minus sign, within ±9 999 999', () => {
    expect(parsePoints('42434')).toBe(42_434);
    expect(parsePoints(' 42 434 ')).toBe(42_434);
    expect(parsePoints('42 434')).toBe(42_434);
    expect(parsePoints('42 434')).toBe(42_434);
    expect(parsePoints('−150')).toBe(-150);
    expect(parsePoints('-9999999')).toBe(-9_999_999);
    expect(parsePoints('')).toBe(0);
    expect(parsePoints('9999999')).toBe(9_999_999);
    for (const bad of ['10000000', '-10000000', '1.5', '1e3', 'abc', '--1', '-']) expect(parsePoints(bad)).toBeNull();
  });

  it('sends nothing for a folded panel or the default values, invalid for a bad field', () => {
    expect(resumePayload({ open: false, roundIndex: 2, points: { p1: '5' } }, info)).toBeUndefined();
    expect(resumePayload({ open: false, roundIndex: 0, points: { p1: 'x' } }, info)).toBeUndefined();
    expect(resumePayload({ open: true, roundIndex: 0, points: { p1: '0' } }, info)).toBeUndefined();
    expect(resumePayload({ open: true, roundIndex: 0, points: {} }, info)).toBeUndefined();
    expect(resumePayload({ open: true, roundIndex: 0, points: { p1: 'x' } }, info)).toBe('invalid');
    expect(resumePayload({ open: true, roundIndex: 0, points: { gone: 'x' } }, info)).toBeUndefined();
    expect(resumePayload({ open: true, roundIndex: 2, points: { p1: '42434', p2: '0', gone: '7' } }, info)).toEqual({ resume: { roundIndex: 2, points: { p1: 42_434 } } });
    expect(resumePayload({ open: true, roundIndex: 1, points: {} }, info)).toEqual({ resume: { roundIndex: 1, points: {} } });
    expect(resumePayload({ open: true, roundIndex: 0, points: { p3: '−5' } }, info)).toEqual({ resume: { roundIndex: 0, points: { p3: -5 } } });
  });

  it('keeps the round within the rounds of the quiz', () => {
    expect(resumePayload({ open: true, roundIndex: 9, points: {} }, info)).toEqual({ resume: { roundIndex: 2, points: {} } });
  });

  it('fills from a game by normalized nickname; the unmatched stay at 0', () => {
    const option: ResumeOption = {
      gameId: 'g',
      startedAt: '2026-10-27T17:40:00.000Z',
      status: 'aborted',
      questionsPlayed: 4,
      questionCount: 6,
      autopilot: false,
      roundIndex: 5,
      scores: [
        { nickname: 'Оля', score: 200 },
        { nickname: ' петро ', score: 100 },
        { nickname: 'Іра', score: 50 },
      ],
    };
    const draft = fillFromGame({ ...emptyDraft(), open: true, points: { p3: '77' } }, info, option);
    const unmatched = unmatchedIn(info, option);
    expect(draft).toEqual({ open: true, roundIndex: 2, points: { p1: '200', p2: '100', p3: '0' } });
    expect(unmatched).toEqual(['Тарас']);
    expect(fillFromGame(emptyDraft(), info, { ...option, roundIndex: 1, scores: [{ nickname: 'Тарас', score: -40 }] })).toEqual({
      open: false,
      roundIndex: 1,
      points: { p1: '0', p2: '0', p3: '-40' },
    });
  });

  it('the unmatched are recounted from the current participants', () => {
    const scores = [{ nickname: 'Оля', score: 1 }, { nickname: 'Тарас ', score: 2 }];
    expect(unmatchedIn(info, { scores })).toEqual(['Петро']);
    expect(unmatchedIn({ ...info, participants: [...info.participants, { id: 'p4', nickname: 'Іра' }] }, { scores })).toEqual(['Петро', 'Іра']);
  });

  it('a pick line names an interrupted or bot game', () => {
    const option: ResumeOption = { gameId: 'g', startedAt: '', status: 'finished', questionsPlayed: 4, questionCount: 6, autopilot: false, roundIndex: 2, scores: [] };
    expect(resumeOptionText(info, option, 'D')).toBe('D · зіграно 4 з 6 · далі Раунд 3 · Гори');
    expect(resumeOptionText(info, { ...option, status: 'aborted', autopilot: true }, 'D')).toBe('D · зіграно 4 з 6 · перервано · з ботом · далі Раунд 3 · Гори');
    expect(resumeOptionText(info, { ...option, status: 'running', roundIndex: 9 }, 'D')).toBe('D · зіграно 4 з 6 · триває · далі Раунд 3 · Гори');
  });

  it('names rounds with the real number', () => {
    expect(resumeRoundText(info, 0)).toBe('Раунд 1 · Розминка');
    expect(resumeRoundText(info, 1)).toBe('Раунд 2');
    expect(resumeRoundText(info, 2)).toBe('Раунд 3 · Гори');
    expect(resumeRoundText({ ...info, rounds: [{ title: '', type: 'blitz' }] }, 0)).toBe('Раунд 1 · Бліц');
  });
});
