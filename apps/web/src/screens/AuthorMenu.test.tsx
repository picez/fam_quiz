// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthorView, PlayerView } from '@quiz/shared';
import type { Send } from '../live/types';
import { AuthorMenu } from './AuthorMenu';
import { teamPlayerView, teamsView } from './team-test-view';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

let confirmSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
});

const author = (over: Partial<AuthorView> = {}): AuthorView => ({
  cloud: null,
  bluff: null,
  people: [
    { id: 'p2', nickname: 'Оля', connected: true },
    { id: 'p3', nickname: 'Петро', connected: false },
  ],
  ...over,
});

const soloView = (over: Partial<PlayerView> = {}): PlayerView => ({
  ...teamPlayerView(),
  autopilot: true,
  teams: null,
  team: null,
  phase: 'lobby',
  author: author(),
  ...over,
});

const okSend = () => vi.fn(async () => ({ ok: true as const })) as unknown as Send & ReturnType<typeof vi.fn>;

function show(view: PlayerView, send: Send = okSend()) {
  const result = render(<AuthorMenu view={view} send={send} />);
  return { send: send as unknown as ReturnType<typeof vi.fn>, ...result };
}

const openMenu = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Меню автора' }));
  return screen.getByRole('dialog', { name: 'Меню автора' });
};

describe('AuthorMenu', () => {
  it('there is no button without the author view or when the game is over', () => {
    show(soloView({ author: null }));
    expect(screen.queryByRole('button', { name: 'Меню автора' })).toBeNull();
    cleanup();
    show(soloView({ phase: 'finished' }));
    expect(screen.queryByRole('button', { name: 'Меню автора' })).toBeNull();
  });

  it('the button is a header-row «⋯» that opens a dialog', () => {
    show(soloView());
    const button = screen.getByRole('button', { name: 'Меню автора' });
    expect(button.className).toContain('author-menu-btn');
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(button.textContent).toBe('⋯');
  });

  it('solo lobby: only kick, no pause, end, team form or hide', () => {
    show(soloView());
    const sheet = openMenu();
    expect(within(sheet).getByRole('button', { name: 'Вилучити гравця' })).toBeTruthy();
    for (const name of ['Пауза', 'Продовжити', 'Завершити гру', 'Як формуємо команди', 'Приховати…']) {
      expect(within(sheet).queryByRole('button', { name })).toBeNull();
    }
  });

  it('team lobby: the team form, «Випадково» sends it; the current form is pressed', async () => {
    const { send } = show(soloView({ teams: teamsView({ form: 'dice' }) }));
    const sheet = openMenu();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Як формуємо команди' }));
    expect(within(sheet).getByRole('button', { name: 'Кубик' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(sheet).getByRole('button', { name: 'Гравці обирають' }).getAttribute('aria-pressed')).toBe('false');
    expect(within(sheet).queryByRole('button', { name: 'Розподіляю сам' })).toBeNull();
    expect(sheet.querySelectorAll('.help-button')).toHaveLength(3);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Випадково' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:team-form', { form: 'random' }));
  });

  it('team form «host» presses none of the three', () => {
    show(soloView({ teams: teamsView({ form: 'host' }) }));
    const sheet = openMenu();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Як формуємо команди' }));
    for (const name of ['Гравці обирають', 'Випадково', 'Кубик']) {
      expect(within(sheet).getByRole('button', { name }).getAttribute('aria-pressed')).toBe('false');
    }
  });

  it('question: «Пауза» pauses and closes; paused shows «Продовжити» that resumes', async () => {
    const { send } = show(soloView({ phase: 'question' }));
    const sheet = openMenu();
    expect(within(sheet).queryByRole('button', { name: 'Як формуємо команди' })).toBeNull();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Пауза' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(send).toHaveBeenCalledWith('host:pause', undefined);
    cleanup();
    const second = show(soloView({ phase: 'question', paused: true }));
    fireEvent.click(within(openMenu()).getByRole('button', { name: 'Продовжити' }));
    await waitFor(() => expect(second.send).toHaveBeenCalledWith('host:resume', undefined));
  });

  it('«Завершити гру» asks first; a «no» sends nothing', async () => {
    const { send } = show(soloView({ phase: 'question' }));
    confirmSpy.mockReturnValueOnce(false);
    fireEvent.click(within(openMenu()).getByRole('button', { name: 'Завершити гру' }));
    expect(confirmSpy).toHaveBeenCalledWith('Завершити гру для всіх гравців?');
    expect(send).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Завершити гру' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:end', undefined));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('kick lists the people (away ones marked) and asks before sending', async () => {
    const { send } = show(soloView({ phase: 'question' }));
    const sheet = openMenu();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Вилучити гравця' }));
    const petro = within(sheet).getByRole('button', { name: /Петро/ });
    expect(petro.className).toContain('is-away');
    expect(within(sheet).getByRole('button', { name: /Оля/ }).className).not.toContain('is-away');
    fireEvent.click(petro);
    expect(confirmSpy).toHaveBeenCalledWith('Вилучити гравця «Петро» із гри?');
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:kick', { playerId: 'p3' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Назад' }));
    expect(within(sheet).getByRole('button', { name: 'Вилучити гравця' })).toBeTruthy();
  });

  it('kick with nobody else says so', () => {
    show(soloView({ author: author({ people: [] }) }));
    const sheet = openMenu();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Вилучити гравця' }));
    expect(within(sheet).getByText('Більше нікого немає.')).toBeTruthy();
  });

  it('cloud: both words listed, the hidden one pressed; a tap hides; no authors', async () => {
    const cloud = [
      { key: 'сонце', text: 'сонце', count: 2, hidden: false },
      { key: 'море', text: 'море', count: 1, hidden: true },
    ];
    const { send } = show(soloView({ phase: 'reveal', author: author({ cloud }) }));
    const sheet = openMenu();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Приховати…' }));
    expect(within(sheet).getByText('Торкніться слова, щоб сховати його зі сцени. Ще дотик — повернути.')).toBeTruthy();
    expect(within(sheet).getByRole('button', { name: 'море' }).getAttribute('aria-pressed')).toBe('true');
    expect(sheet.querySelector('.host-cloud-by')).toBeNull();
    fireEvent.click(within(sheet).getByRole('button', { name: 'сонце' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:cloud-hide', { key: 'сонце', hidden: true }));
  });

  it('bluff: a tap asks and removes; refusals show in the sheet', async () => {
    const bluff = [
      { id: 'o1', text: 'Синій кит' },
      { id: 'o2', text: 'Зелений слон' },
    ];
    const send = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: 'pick_first' })
      .mockResolvedValueOnce({ ok: false, error: 'not_allowed' })
      .mockResolvedValue({ ok: true });
    show(soloView({ phase: 'question', author: author({ bluff }) }), send as unknown as Send);
    const sheet = openMenu();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Приховати…' }));
    expect(within(sheet).getByText('Торкніться образливої вигадки, щоб прибрати її. Правда тут не позначена.')).toBeTruthy();
    const remove = () => within(sheet).getByRole('button', { name: 'Прибрати «Зелений слон»' });
    fireEvent.click(remove());
    expect(confirmSpy).toHaveBeenCalledWith('Прибрати «Зелений слон»? Автори нічого за неї не отримають.');
    expect(send).toHaveBeenCalledWith('host:bluff-remove', { optionId: 'o2' });
    expect((await within(sheet).findByRole('alert')).textContent).toBe('Спершу зробіть свій вибір.');
    fireEvent.click(remove());
    await waitFor(() => expect(within(sheet).getByRole('alert').textContent).toBe('Цей варіант прибрати не можна.'));
  });

  it('no «Приховати…» without cloud or bluff; an open hide screen goes back when they vanish', () => {
    const { rerender } = show(soloView({ phase: 'question', author: author({ bluff: [{ id: 'o1', text: 'Синій кит' }] }) }));
    const sheet = openMenu();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Приховати…' }));
    rerender(<AuthorMenu view={soloView({ phase: 'reveal', author: author() })} send={okSend()} />);
    const again = screen.getByRole('dialog');
    expect(within(again).getByRole('button', { name: 'Пауза' })).toBeTruthy();
    expect(within(again).queryByRole('button', { name: 'Приховати…' })).toBeNull();
  });

  it('Escape closes the sheet and focus returns to «⋯»', () => {
    show(soloView());
    openMenu();
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Меню автора' }));
  });

  it('a tap past the card closes; a tap inside does not', () => {
    show(soloView());
    const sheet = openMenu();
    fireEvent.click(sheet.querySelector('.table-card')!);
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(sheet);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
