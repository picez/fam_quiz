// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { emptyBrief } from '@quiz/shared';
import { fitLines, RoundBriefing } from './RoundBriefing';

afterEach(cleanup);

describe('fitLines', () => {
  it('returns null when nothing overflows', () => {
    expect(fitLines(() => false)).toBeNull();
  });

  it('returns the most lines that still fit', () => {
    expect(fitLines((lines) => lines === null || lines > 4)).toBe(4);
  });

  it('never goes below the minimum', () => {
    expect(fitLines(() => true)).toBe(2);
  });

  it('returns the maximum when only the unclamped text overflows', () => {
    expect(fitLines((lines) => lines === null)).toBe(12);
  });

  it('measures unclamped first, then from the maximum down', () => {
    const seen: (number | null)[] = [];
    fitLines((lines) => {
      seen.push(lines);
      return lines === null || lines > 4;
    });
    expect(seen).toEqual([null, 12, 11, 10, 9, 8, 7, 6, 5, 4]);
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
        return lines === undefined || lines === 'none' ? 900 : 600 + Number(lines) * 30;
      },
    });
    try {
      const { container } = render(<RoundBriefing brief={brief} description={'а'.repeat(600)} fit />);
      expect(container.querySelector<HTMLElement>('.round-brief-note')?.dataset.lines).toBe('4');
    } finally {
      delete (document.documentElement as { scrollHeight?: number }).scrollHeight;
      window.innerHeight = heightBefore;
      if (original) Object.defineProperty(Element.prototype, 'scrollHeight', original);
    }
  });

  it('with fit and an empty description renders no note', () => {
    const { container } = render(<RoundBriefing brief={brief} description="" fit />);
    expect(container.querySelector('.round-brief-note')).toBeNull();
  });
});
