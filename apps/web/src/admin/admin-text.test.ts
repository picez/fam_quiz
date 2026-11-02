import type { AdminLogEntry, Question } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { logLine, questionConfirm, questionLines } from './admin-text';

const entry = (over: Partial<AdminLogEntry>): AdminLogEntry => ({ id: 'l1', at: '2026-11-01T10:00:00.000Z', admin: 'Адмін', kind: 'ban', target: 'Богдан', details: {}, ...over });
const base = { imageUrl: null, video: null, timeLimit: 30, points: 1000 };
const single: Question = { ...base, id: 'q1', type: 'single', text: 'Столиця?', options: [{ id: 'a', text: 'Київ' }, { id: 'b', text: 'Львів' }], correctId: 'a' };
const bool: Question = { ...base, id: 'q2', type: 'boolean', text: 'Земля кругла?', correct: true };

describe('questionConfirm', () => {
  it('says what goes with the question', () => {
    expect(questionConfirm('question', '')).toBe('Видалити це запитання? Скасувати не можна.');
    expect(questionConfirm('round', 'Розминка')).toContain('«Розминка»');
    expect(questionConfirm('category', '')).toContain('категор');
  });
  it('has no text when the button is off', () => {
    expect(questionConfirm('last_question', '')).toBeNull();
    expect(questionConfirm('not_found', '')).toBeNull();
    expect(questionConfirm('locked', '')).toBeNull();
  });
});

describe('logLine', () => {
  it('writes a ban with and without a reason', () => {
    expect(logLine(entry({ details: { reason: 'спам' } }))).toBe('Адмін заблокував(-ла) Богдан. Причина: спам');
    expect(logLine(entry({ details: { reason: null } }))).toBe('Адмін заблокував(-ла) Богдан');
    expect(logLine(entry({ kind: 'unban' }))).toBe('Адмін розблокував(-ла) Богдан');
  });
  it('writes a quiz delete', () => {
    expect(logLine(entry({ kind: 'quiz_delete', details: { title: 'Карпати' } }))).toBe('Адмін видалив(-ла) вікторину «Карпати» (Богдан)');
  });
});

describe('questionLines', () => {
  it('lists the text and the options', () => {
    expect(questionLines(single)).toEqual([single.text, ...single.options.map((o) => o.text)]);
    expect(questionLines(bool)).toEqual([bool.text]);
  });
});
