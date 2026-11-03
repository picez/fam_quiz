// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { levelProgress, LEVEL_REWARDS, rewardsUpTo, type OwnLevel } from '@quiz/shared';
import { saveLooks } from '../api';
import { LevelBar, LevelCard } from './LevelCard';

vi.mock('../api', () => ({ saveLooks: vi.fn() }));

const level: OwnLevel = {
  progress: levelProgress(600),
  unlocked: rewardsUpTo(3).map((r, i) => ({ level: r.level, reward: r.reward, at: i === 0 ? null : '2026-10-12T12:00:00.000Z' })),
  next: LEVEL_REWARDS.filter((r) => r.level > 3).slice(0, 3),
  looks: { color: null, frame: null, badge: null },
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('LevelCard', () => {
  it('shows the level and the bar to the next one; the rewards card below has its own heading and no bar', () => {
    const { container } = render(<LevelCard level={level} nickname="Олена" onSaved={() => {}} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Нагороди рівнів' })).toBeTruthy();
    expect(container.querySelector('progress')).toBeNull();
    cleanup();
    render(<LevelBar progress={level.progress} />);
    expect(screen.getByRole('heading', { name: 'Рівень 3' })).toBeTruthy();
    expect(screen.getByText('600 / 800 досвіду')).toBeTruthy();
  });

  it('keeps the XP rules in a tooltip of the bar: described by it, opened by a tap, closed by Escape or a tap elsewhere', () => {
    const { container } = render(<LevelBar progress={level.progress} />);
    // Правил немає текстом під шкалою (p.meta) — лише підказка.
    expect([...container.querySelectorAll('p.meta')].map((p) => p.textContent)).toEqual(['600 / 800 досвіду']);
    const info = screen.getByRole('button', { name: 'Як нараховують досвід' });
    const tip = screen.getByRole('tooltip', { hidden: true });
    expect(info.getAttribute('aria-describedby')).toBe(tip.id);
    expect(tip.textContent).toMatch(/щонайменше 3 гравці з акаунтами/);
    const meter = container.querySelector('.level-meter')!;
    expect(meter.classList.contains('is-open')).toBe(false);
    fireEvent.click(container.querySelector('.level-meter progress')!);
    expect(meter.classList.contains('is-open')).toBe(true);
    expect(info.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(info, { key: 'Escape' });
    expect(meter.classList.contains('is-open')).toBe(false);
    fireEvent.click(info);
    expect(meter.classList.contains('is-open')).toBe(true);
    fireEvent.pointerDown(document.body);
    expect(meter.classList.contains('is-open')).toBe(false);
  });

  it('lists what is unlocked with dates and the next three', () => {
    render(<LevelCard level={level} nickname="Олена" onSaved={() => {}} />);
    const rows = screen.getAllByTestId('level-unlocked');
    expect(rows).toHaveLength(3);
    expect(rows[0]!.textContent).toContain('давно');
    expect(rows[1]!.textContent).toContain('12.10.2026');
    const next = screen.getAllByTestId('level-next');
    expect(next).toHaveLength(3);
    expect(next[0]!.textContent).toContain('з рівня 4');
  });

  it('offers only unlocked looks', () => {
    render(<LevelCard level={level} nickname="Олена" onSaved={() => {}} />);
    const colors = screen.getByRole('radiogroup', { name: 'Колір ніку' });
    expect(within(colors).getByRole('radio', { name: /Небо/ })).toBeTruthy();
    expect(within(colors).queryByRole('radio', { name: /М'ята/ })).toBeNull();
    expect(within(colors).getByRole('radio', { name: /Без кольору/ })).toBeTruthy();
  });

  it('saves the chosen look and reports it', async () => {
    vi.mocked(saveLooks).mockResolvedValue({ ok: true, data: { looks: { color: 'sky', frame: null, badge: null } } });
    const onSaved = vi.fn();
    render(<LevelCard level={level} nickname="Олена" onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('radio', { name: /Небо/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти вигляд' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ color: 'sky', frame: null, badge: null }));
    expect(saveLooks).toHaveBeenCalledWith({ color: 'sky', frame: null, badge: null });
  });

  it('shows the error text on 409', async () => {
    vi.mocked(saveLooks).mockResolvedValue({ ok: false, error: 'look_locked' });
    const onSaved = vi.fn();
    render(<LevelCard level={level} nickname="Олена" onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('radio', { name: /Небо/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти вигляд' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Цей вигляд ще закритий: він відкриється з вищим рівнем.');
    expect(onSaved).not.toHaveBeenCalled();
  });
});
