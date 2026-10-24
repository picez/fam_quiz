// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicClues } from '@quiz/shared';
import { CluesList } from './CluesList';

const ALL = ['Народився 1814 року', 'Був художником', 'Засланий у солдати', 'Автор «Заповіту»', 'Автор «Кобзаря»'];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-24T12:00:00Z'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const clues = (over: Partial<PublicClues> = {}): PublicClues => ({ total: 5, shown: ALL.slice(0, 2), nextAt: Date.now() + 3000, byHost: false, intervalSeconds: 8, ...over });
const texts = () => [...document.querySelectorAll('.clue')].map((li) => li.textContent);

describe('CluesList', () => {
  it('shows the opened clues, the last one highlighted, and counts down to the next', () => {
    render(<CluesList clues={clues()} offsetMs={0} />);
    expect(texts()).toEqual(['1Народився 1814 року', '2Був художником', 'Підказка 3 — за 3 с', 'Підказка 4 — за 11 с', 'Підказка 5 — за 19 с']);
    expect(document.querySelectorAll('.clue.is-new')).toHaveLength(1);
    expect(document.querySelector('.clue.is-new')!.textContent).toBe('2Був художником');
    expect(document.querySelectorAll('.clue.is-hidden')).toHaveLength(3);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(texts()[2]).toBe('Підказка 3 — за 2 с');
  });

  it('counts by the server clock', () => {
    render(<CluesList clues={clues()} offsetMs={1000} />);
    expect(texts()[2]).toBe('Підказка 3 — за 2 с');
  });

  it('on a voice cell the host opens the next clue; without a time (pause) only the number', () => {
    render(<CluesList clues={clues({ byHost: true, nextAt: null })} offsetMs={0} />);
    expect(texts()[2]).toBe('Підказка 3 — відкриє ведучий');
    cleanup();
    render(<CluesList clues={clues({ nextAt: null })} offsetMs={0} />);
    expect(texts()[2]).toBe('Підказка 3');
  });

  it('after the reveal shows all clues without placeholders', () => {
    render(<CluesList clues={clues()} offsetMs={0} all={ALL} big />);
    expect(document.querySelectorAll('.clue')).toHaveLength(5);
    expect(document.querySelector('.clue.is-hidden')).toBeNull();
    expect(document.querySelector('.clues-list.is-big')).not.toBeNull();
  });
});
