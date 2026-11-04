// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { levelProgress, nextRewards, rewardsUpTo, type OwnLevel } from '@quiz/shared';
import { saveLooks } from '../api';
import { NICK_FONT_LOADERS, resetNickFontCache } from '../nick-fonts';
import { LevelBar, LevelCard } from './LevelCard';

vi.mock('../api', () => ({ saveLooks: vi.fn() }));

const at16: OwnLevel = {
  progress: { ...levelProgress(600), level: 16 },
  unlocked: rewardsUpTo(16).map((r) => ({ level: r.level, reward: r.reward, at: null })),
  next: nextRewards(16).slice(0, 3),
  looks: { color: null, frame: null, badge: null, photo: null, font: null },
};
const level: OwnLevel = {
  progress: levelProgress(600),
  unlocked: rewardsUpTo(3).map((r, i) => ({ level: r.level, reward: r.reward, at: i === 0 ? null : '2026-10-12T12:00:00.000Z' })),
  next: nextRewards(3).slice(0, 3),
  looks: { color: null, frame: null, badge: null, photo: null, font: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  resetNickFontCache();
  for (const key of Object.keys(NICK_FONT_LOADERS) as (keyof typeof NICK_FONT_LOADERS)[]) NICK_FONT_LOADERS[key] = vi.fn(() => Promise.resolve({}));
});
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

  it('keyboard: focus on ⓘ opens the tooltip, Escape hides it while ⓘ keeps focus, blur closes it', () => {
    const { container } = render(<LevelBar progress={level.progress} />);
    const meter = container.querySelector('.level-meter')!;
    const info = screen.getByRole('button', { name: 'Як нараховують досвід' });
    act(() => info.focus());
    expect(meter.classList.contains('is-open')).toBe(true);
    fireEvent.keyDown(info, { key: 'Escape' });
    expect(meter.classList.contains('is-open')).toBe(false);
    expect(document.activeElement).toBe(info);
    expect(info.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(info);
    expect(meter.classList.contains('is-open')).toBe(true);
    act(() => info.blur());
    expect(meter.classList.contains('is-open')).toBe(false);
  });

  it('a second click on ⓘ hides it even though ⓘ is focused; a tap that focuses ⓘ opens it once, not open-then-closed', () => {
    const { container } = render(<LevelBar progress={level.progress} />);
    const meter = container.querySelector('.level-meter')!;
    const info = screen.getByRole('button', { name: 'Як нараховують досвід' });
    // Дотик: pointerdown → фокус → click.
    fireEvent.pointerDown(info);
    act(() => info.focus());
    expect(meter.classList.contains('is-open')).toBe(false);
    fireEvent.click(info);
    expect(meter.classList.contains('is-open')).toBe(true);
    fireEvent.click(info);
    expect(meter.classList.contains('is-open')).toBe(false);
    expect(document.activeElement).toBe(info);
  });

  it('a mouse opens it on hover and closes it on leave; a touch pointer does not', () => {
    const { container } = render(<LevelBar progress={level.progress} />);
    const meter = container.querySelector('.level-meter')!;
    fireEvent.pointerEnter(meter, { pointerType: 'touch' });
    expect(meter.classList.contains('is-open')).toBe(false);
    fireEvent.pointerEnter(meter, { pointerType: 'mouse' });
    expect(meter.classList.contains('is-open')).toBe(true);
    fireEvent.pointerLeave(meter, { pointerType: 'mouse' });
    expect(meter.classList.contains('is-open')).toBe(false);
  });

  it('lists what is unlocked with dates and the next three', () => {
    render(<LevelCard level={level} nickname="Олена" onSaved={() => {}} />);
    const rows = screen.getAllByTestId('level-unlocked');
    expect(rows).toHaveLength(rewardsUpTo(3).length);
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
    expect((within(colors).getByRole('radio', { name: /М'ята/ }) as HTMLInputElement).disabled).toBe(true);
    expect(within(colors).getByRole('radio', { name: /Без кольору/ })).toBeTruthy();
  });

  it('shows five radio groups in order', () => {
    render(<LevelCard level={level} nickname="Олена" onSaved={() => {}} />);
    expect(screen.getAllByRole('radiogroup').map((g) => g.getAttribute('aria-label'))).toEqual(['Рамка фото', 'Шрифт ніку', 'Колір ніку', 'Рамка ніку', 'Значок']);
  });

  it('locked looks are disabled with their level', () => {
    render(<LevelCard level={at16} nickname="Олена" onSaved={() => {}} />);
    const aura = screen.getByRole('radio', { name: /Сяйво/ }) as HTMLInputElement;
    expect(aura.disabled).toBe(true);
    expect(aura.closest('label')!.textContent).toContain('🔒 з рівня 30');
    expect((screen.getByRole('radio', { name: /Піксельний/ }) as HTMLInputElement).disabled).toBe(false);
  });

  it('a locked badge shows a compact lock and keeps the full level text for screen readers', () => {
    render(<LevelCard level={level} nickname="Олена" onSaved={() => {}} />);
    const label = screen.getByRole('radio', { name: /💀/ }).closest('label')!;
    expect(label.querySelector('[aria-hidden="true"]')!.textContent).toBe('🔒 10');
    expect(label.querySelector('.sr-only')!.textContent).toBe('🔒 з рівня 10');
  });

  it('free looks are open at level 1', () => {
    const one: OwnLevel = { ...level, progress: levelProgress(0) };
    render(<LevelCard level={one} nickname="Олена" onSaved={() => {}} />);
    for (const name of [/Багряна/, /Рукописний/, /^Кривавий$/, /🌻/]) expect((screen.getByRole('radio', { name }) as HTMLInputElement).disabled).toBe(false);
    const frames = screen.getByRole('radiogroup', { name: 'Рамка ніку' });
    expect((within(frames).getByRole('radio', { name: /Срібло/ }) as HTMLInputElement).disabled).toBe(true);
  });

  it('preview follows the choice', () => {
    render(<LevelCard level={at16} nickname="Олена" onSaved={() => {}} />);
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Рамка фото' })).getByRole('radio', { name: /Вогонь/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Піксельний/ }));
    const preview = screen.getByTestId('look-preview');
    expect(preview.querySelector('.photo-frame-fire')).not.toBeNull();
    expect(preview.querySelector('.nick-font-pixel')).not.toBeNull();
  });

  it('save sends all five slots', async () => {
    vi.mocked(saveLooks).mockResolvedValue({ ok: true, data: { looks: { color: null, frame: null, badge: null, photo: 'fire', font: 'pixel' } } });
    render(<LevelCard level={at16} nickname="Олена" onSaved={() => {}} />);
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Рамка фото' })).getByRole('radio', { name: /Вогонь/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Піксельний/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти вигляд' }));
    await waitFor(() => expect(saveLooks).toHaveBeenCalledWith({ color: null, frame: null, badge: null, photo: 'fire', font: 'pixel' }));
  });

  it('opening the page loads every open font for the tiles', () => {
    render(<LevelCard level={at16} nickname="Олена" onSaved={() => {}} />);
    expect(NICK_FONT_LOADERS.hand).toHaveBeenCalled();
    expect(NICK_FONT_LOADERS.pixel).toHaveBeenCalled();
    expect(NICK_FONT_LOADERS.heavy).not.toHaveBeenCalled();
  });

  it('two rewards on one level render without key warnings', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<LevelCard level={level} nickname="Олена" onSaved={() => {}} />);
    expect(screen.getAllByTestId('level-unlocked').length).toBeGreaterThan(3);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('saves the chosen look and reports it', async () => {
    vi.mocked(saveLooks).mockResolvedValue({ ok: true, data: { looks: { color: 'sky', frame: null, badge: null, photo: null, font: null } } });
    const onSaved = vi.fn();
    render(<LevelCard level={level} nickname="Олена" onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('radio', { name: /Небо/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти вигляд' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ color: 'sky', frame: null, badge: null, photo: null, font: null }));
    expect(saveLooks).toHaveBeenCalledWith({ color: 'sky', frame: null, badge: null, photo: null, font: null });
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
