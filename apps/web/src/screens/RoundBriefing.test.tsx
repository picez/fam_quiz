// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { emptyBrief } from '@quiz/shared';
import { fitBrief, fitLines, READABLE_NOTE_LINES, RoundBriefing, STAGE_NOTE_LINES } from './RoundBriefing';

afterEach(cleanup);

describe('fitLines', () => {
  it('returns null when nothing overflows', () => {
    expect(fitLines(() => false)).toBeNull();
  });

  it('returns the most lines that still fit', () => {
    expect(fitLines((lines) => lines === null || lines > 6)).toBe(6);
  });

  it('never goes below the minimum', () => {
    expect(fitLines(() => true)).toBe(4);
    expect(STAGE_NOTE_LINES.min).toBe(4);
  });

  it('returns the maximum when only the unclamped text overflows', () => {
    expect(fitLines((lines) => lines === null)).toBe(12);
  });

  it('measures unclamped first, then from the maximum down', () => {
    const seen: (number | null)[] = [];
    fitLines((lines) => {
      seen.push(lines);
      return lines === null || lines > 6;
    });
    expect(seen).toEqual([null, 12, 11, 10, 9, 8, 7, 6]);
  });
});

describe('fitBrief', () => {
  // Повні правила забирають 4 рядки опису: вміщається lines ≤ room (short дає ще 4).
  const stage = (room: number) => (lines: number | null, short: boolean) => lines === null || lines > room + (short ? 4 : 0);

  it('keeps all rules when the description already fits or keeps five lines', () => {
    expect(fitBrief(() => false, true)).toEqual({ lines: null, short: false });
    expect(fitBrief(stage(READABLE_NOTE_LINES), true)).toEqual({ lines: 5, short: false });
  });

  it('a long description below five lines shortens the rules to the first line and refits', () => {
    expect(fitBrief(stage(2), true)).toEqual({ lines: 6, short: true });
  });

  it('a short description never shortens the rules', () => {
    expect(fitBrief(stage(2), false)).toEqual({ lines: 4, short: false });
  });
});

describe('RoundBriefing', () => {
  const brief = emptyBrief('classic');

  it('marks a description longer than 250 characters as long, and shows it whole', () => {
    const { container } = render(<RoundBriefing brief={brief} description={'а'.repeat(251)} />);
    expect(container.querySelector('.round-brief.is-long')).not.toBeNull();
    expect(container.querySelector('.is-fit')).toBeNull();
    expect(container.querySelector('.round-brief-note')?.textContent).toBe('а'.repeat(251));
    cleanup();
    const short = render(<RoundBriefing brief={brief} description={'а'.repeat(250)} />);
    expect(short.container.querySelector('.is-long')).toBeNull();
  });

  it('with fit keeps the whole text in the DOM and sets no limit when nothing overflows', () => {
    const { container } = render(<RoundBriefing brief={brief} description={'а'.repeat(600)} fit />);
    const note = container.querySelector<HTMLElement>('.round-brief-note.is-fit');
    expect(note).not.toBeNull();
    expect(note?.textContent).toBe('а'.repeat(600));
    expect(note?.dataset.lines).toBe('none');
  });

  it('with fit clamps to the most lines that stop the stage from scrolling', () => {
    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight');
    const heightBefore = window.innerHeight;
    window.innerHeight = 720;
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      get: () => {
        const lines = document.querySelector<HTMLElement>('.round-brief-note')?.dataset.lines;
        return lines === undefined || lines === 'none' ? 900 : 500 + Number(lines) * 30;
      },
    });
    try {
      const { container } = render(<RoundBriefing brief={brief} description={'а'.repeat(600)} fit />);
      expect(container.querySelector<HTMLElement>('.round-brief-note')?.dataset.lines).toBe('7');
    } finally {
      delete (document.documentElement as { scrollHeight?: number }).scrollHeight;
      window.innerHeight = heightBefore;
      if (original) Object.defineProperty(Element.prototype, 'scrollHeight', original);
    }
  });

  it('with fit also watches the brief and the stage board, so the note refits when the content beside it shrinks', () => {
    const observed: Element[] = [];
    const before = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      observe(target: Element) {
        observed.push(target);
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    try {
      const { container } = render(
        <div className="app">
          <div className="stage-board">
            <RoundBriefing brief={brief} description={'а'.repeat(600)} fit />
          </div>
        </div>,
      );
      const classes = observed.map((element) => element.className);
      expect(classes).toEqual(expect.arrayContaining(['app', 'stage-board', 'round-brief is-long']));
      expect(observed).toContain(container.querySelector('.round-brief'));
    } finally {
      globalThis.ResizeObserver = before;
    }
  });

  it('with fit on a cramped stage marks the rules short and gives the description more lines', () => {
    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight');
    const heightBefore = window.innerHeight;
    window.innerHeight = 720;
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      get: () => {
        const lines = document.querySelector<HTMLElement>('.round-brief-note')?.dataset.lines;
        const rules = document.querySelector<HTMLElement>('.round-brief')?.dataset.rules === 'short' ? 0 : 120;
        return (lines === undefined || lines === 'none' ? 900 : 540 + Number(lines) * 30) + rules;
      },
    });
    try {
      const { container } = render(<RoundBriefing brief={brief} description={'а'.repeat(600)} fit />);
      expect(container.querySelector<HTMLElement>('.round-brief')?.dataset.rules).toBe('short');
      expect(container.querySelector<HTMLElement>('.round-brief-note')?.dataset.lines).toBe('6');
      cleanup();
      const plain = render(<RoundBriefing brief={brief} description={'а'.repeat(200)} fit />);
      expect(plain.container.querySelector<HTMLElement>('.round-brief')?.dataset.rules).toBeUndefined();
    } finally {
      delete (document.documentElement as { scrollHeight?: number }).scrollHeight;
      window.innerHeight = heightBefore;
      if (original) Object.defineProperty(Element.prototype, 'scrollHeight', original);
    }
  });

  it('without fit never marks the rules short', () => {
    const { container } = render(<RoundBriefing brief={brief} description={'а'.repeat(600)} />);
    expect(container.querySelector<HTMLElement>('.round-brief')?.dataset.rules).toBeUndefined();
  });

  it('with fit and an empty description renders no note', () => {
    const { container } = render(<RoundBriefing brief={brief} description="" fit />);
    expect(container.querySelector('.round-brief-note')).toBeNull();
  });
});
