// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NICK_FONT_LOADERS } from '../nick-fonts';
import { Nick } from './Nick';

afterEach(cleanup);

describe('Nick', () => {
  it('shows the level, colour, frame and title', () => {
    const { container } = render(<Nick nickname="Оля" levels={{ Оля: { level: 12, color: 'sky', frame: 'bronze', font: null } }} titles={{ Оля: '👑 Король' }} />);
    expect(container.querySelector('.nick-level')?.textContent).toBe('Рів. 12');
    expect(container.querySelector('.nick-level')?.getAttribute('aria-label')).toBe('Рівень 12');
    expect(container.querySelector('.nick-name')?.classList.contains('nick-c-sky')).toBe(true);
    expect(container.querySelector('.nick')?.classList.contains('nick-f-bronze')).toBe(true);
    expect(container.querySelector('.nick-title')?.textContent).toBe('👑 Король');
    expect(container.querySelector('.nick-name')?.textContent).toBe('Оля');
  });
  it('is just the nickname without entries', () => {
    const { container } = render(<Nick nickname="Петро" levels={{ Оля: { level: 3, color: null, frame: null, font: null } }} />);
    expect(container.textContent).toBe('Петро');
    expect(container.querySelector('.nick-level')).toBeNull();
    expect(container.querySelector('.nick-title')).toBeNull();
  });
  it('puts no colour or frame class for null', () => {
    const { container } = render(<Nick nickname="Оля" levels={{ Оля: { level: 4, color: null, frame: null, font: null } }} />);
    expect(container.innerHTML).not.toMatch(/nick-c-|nick-f-/);
    expect(container.querySelector('.nick-level')?.textContent).toBe('Рів. 4');
  });
  it('hides the badge at level 1', () => {
    const { container } = render(<Nick nickname="Оля" levels={{ Оля: { level: 1, color: null, frame: null, font: null } }} />);
    expect(container.querySelector('.nick-level')).toBeNull();
  });
  it('adds gradient colour and font classes and loads the font', () => {
    const spy = vi.spyOn(NICK_FONT_LOADERS, 'pixel').mockResolvedValue(undefined);
    const { container } = render(<Nick nickname="Оля" levels={{ Оля: { level: 3, color: 'venom', frame: null, font: 'pixel' } }} />);
    const name = container.querySelector('.nick-name');
    expect(name?.classList.contains('nick-c-venom')).toBe(true);
    expect(name?.classList.contains('nick-font-pixel')).toBe(true);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
  it('puts no font class and loads nothing for a null font', () => {
    const spy = vi.spyOn(NICK_FONT_LOADERS, 'pixel').mockResolvedValue(undefined);
    const { container } = render(<Nick nickname="Оля" levels={{ Оля: { level: 3, color: null, frame: null, font: null } }} />);
    expect(container.innerHTML).not.toContain('nick-font-');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
