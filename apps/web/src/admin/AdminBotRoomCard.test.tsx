// @vitest-environment jsdom
import type { AdminBotLobby, AdminBotRoom, BotCommand } from '@quiz/shared';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n';
import { AdminBotRoomCard } from './AdminBotRoomCard';

const room = (over: Partial<AdminBotRoom> = {}): AdminBotRoom => ({
  code: '123456',
  title: 'Річки України 62',
  status: 'lobby',
  players: { online: 1, total: 2 },
  stageUrl: '/stage/123456#tok',
  openedAt: '2026-11-20T09:00:00.000Z',
  question: false,
  lobby: { listed: true, password: null },
  people: [
    { id: 'p1', nickname: 'Оля', online: true, team: null },
    { id: 'p2', nickname: 'Богдан', online: false, team: null },
  ],
  teams: null,
  continued: false,
  ...over,
});

let onCommand: ReturnType<typeof vi.fn<(command: BotCommand) => void>>;
let onLobby: ReturnType<typeof vi.fn<(input: AdminBotLobby) => void>>;

beforeEach(() => {
  onCommand = vi.fn<(command: BotCommand) => void>();
  onLobby = vi.fn<(input: AdminBotLobby) => void>();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const show = (data: AdminBotRoom, busy = false) =>
  render(
    <MemoryRouter>
      <ul>
        <AdminBotRoomCard room={data} busy={busy} onCommand={onCommand} onLobby={onLobby} />
      </ul>
    </MemoryRouter>,
  );
/** The row of one person in «Гравці». */
const person = (nickname: string) => screen.getByText(nickname).closest('li') as HTMLElement;

describe('AdminBotRoomCard', () => {
  it('a lobby card: listed switch, password, people with kick', () => {
    const confirm = vi.mocked(window.confirm);
    const { container } = show(room());
    const listed = screen.getByLabelText('Показувати в списку лобі') as HTMLInputElement;
    expect(listed.checked).toBe(true);
    expect(listed.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(listed.getAttribute('aria-describedby')!)?.textContent).toBe('Вимкнено — у гру входять лише за кодом.');
    fireEvent.click(listed);
    expect(onLobby).toHaveBeenLastCalledWith({ listed: false, password: null });

    const password = screen.getByLabelText('Пароль гри (необов’язково)') as HTMLInputElement;
    expect(password.getAttribute('type')).toBe('password');
    expect(password.maxLength).toBe(32);
    expect(document.getElementById(password.getAttribute('aria-describedby')!)?.textContent).toBe('Від 4 до 32 символів. Без нього в гру не ввійти — і тобі теж.');
    const save = screen.getByRole('button', { name: 'Зберегти пароль' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(password, { target: { value: 'abc' } });
    expect(save.disabled).toBe(true);
    fireEvent.change(password, { target: { value: ' сова62 ' } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(onLobby).toHaveBeenLastCalledWith({ listed: true, password: 'сова62' });
    expect(screen.queryByRole('button', { name: 'Прибрати пароль' })).toBeNull();
    expect(screen.queryByText('з паролем')).toBeNull();

    const toggle = screen.getByRole('button', { name: 'Показати пароль' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(password.getAttribute('type')).toBe('text');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');

    expect(screen.getByRole('heading', { name: 'Гравці', level: 4 })).toBeTruthy();
    expect(within(person('Богдан')).getByText("не на зв'язку")).toBeTruthy();
    expect(within(person('Оля')).queryByText("не на зв'язку")).toBeNull();
    expect(screen.getByText('Оля').getAttribute('dir')).toBe('auto');
    const kick = within(person('Оля')).getByRole('button', { name: 'Вилучити' });
    expect(document.getElementById(kick.getAttribute('aria-describedby')!)?.textContent).toBe('Оля');
    confirm.mockReturnValue(false);
    fireEvent.click(kick);
    expect(confirm).toHaveBeenLastCalledWith('Вилучити гравця «Оля» із гри?');
    expect(onCommand).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(kick);
    expect(onCommand).toHaveBeenLastCalledWith({ type: 'kick', playerId: 'p1' });
    expect(screen.queryByRole('button', { name: 'Звільнити' })).toBeNull();
    expect(container.querySelectorAll('.admin-mark')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Пропустити запитання' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Завершити раунд' })).toBeNull();
  });

  it('a locked lobby shows the lock and removes the password', () => {
    const { container } = show(room({ lobby: { listed: true, password: 'сова62' } }));
    expect(screen.getByText('з паролем')).toBeTruthy();
    expect(screen.getByText('з паролем').classList.contains('admin-mark')).toBe(false);
    expect((screen.getByLabelText('Пароль гри (необов’язково)') as HTMLInputElement).value).toBe('сова62');
    fireEvent.click(screen.getByRole('button', { name: 'Прибрати пароль' }));
    expect(onLobby).toHaveBeenLastCalledWith({ listed: true, password: null });
    fireEvent.click(screen.getByLabelText('Показувати в списку лобі'));
    expect(onLobby).toHaveBeenLastCalledWith({ listed: false, password: 'сова62' });
    expect(container.querySelectorAll('.admin-mark')).toHaveLength(1);
  });

  it('team form only for a team quiz in the lobby', () => {
    show(room({ teams: { form: 'pick' }, people: [{ id: 'p1', nickname: 'Оля', online: true, team: 'Червоні' }] }));
    const group = screen.getByRole('group', { name: 'Як формуємо команди' });
    expect((within(group).getByLabelText('Гравці обирають') as HTMLInputElement).checked).toBe(true);
    expect(within(group).queryByLabelText('Розподіляю сам')).toBeNull();
    expect(within(person('Оля')).getByText('Червоні')).toBeTruthy();
    fireEvent.click(within(group).getByLabelText('Кубик'));
    expect(onCommand).toHaveBeenLastCalledWith({ type: 'team-form', form: 'dice' });
    cleanup();
    show(room({ teams: { form: 'host' } }));
    expect((screen.getByLabelText('Випадково') as HTMLInputElement).checked).toBe(true);
    cleanup();
    show(room({ teams: null }));
    expect(screen.queryByRole('group', { name: 'Як формуємо команди' })).toBeNull();
    cleanup();
    show(room({ status: 'playing', teams: { form: 'pick' } }));
    expect(screen.queryByRole('group', { name: 'Як формуємо команди' })).toBeNull();
  });

  it('playing with an open question: skip, +30 s, end round', () => {
    const confirm = vi.mocked(window.confirm);
    show(room({ status: 'playing', question: true }));
    fireEvent.click(screen.getByRole('button', { name: '+30 с' }));
    expect(onCommand).toHaveBeenLastCalledWith({ type: 'time' });
    fireEvent.click(screen.getByRole('button', { name: 'Пропустити запитання' }));
    expect(confirm).toHaveBeenLastCalledWith('Закрити запитання в грі 123456 зараз? Відповіді, що вже є, зарахуються.');
    expect(onCommand).toHaveBeenLastCalledWith({ type: 'skip' });
    fireEvent.click(screen.getByRole('button', { name: 'Завершити раунд' }));
    expect(confirm).toHaveBeenLastCalledWith(t('endRoundConfirm'));
    expect(onCommand).toHaveBeenLastCalledWith({ type: 'end-round' });
    confirm.mockReturnValue(false);
    onCommand.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Пропустити запитання' }));
    fireEvent.click(screen.getByRole('button', { name: 'Завершити раунд' }));
    fireEvent.click(screen.getByRole('button', { name: 'Завершити гру' }));
    expect(onCommand).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Показувати в списку лобі')).toBeNull();
    expect(screen.queryByLabelText('Пароль гри (необов’язково)')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Гравці' })).toBeTruthy();
    cleanup();
    show(room({ status: 'playing', question: false }));
    expect(screen.queryByRole('button', { name: '+30 с' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Пропустити запитання' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Завершити раунд' })).toBeTruthy();
    cleanup();
    show(room({ status: 'paused', question: true }));
    for (const name of ['+30 с', 'Пропустити запитання', 'Завершити раунд']) expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.getByRole('button', { name: 'Продовжити' })).toBeTruthy();
    cleanup();
    show(room({ status: 'playing', question: true }), true);
    expect((screen.getByRole('button', { name: '+30 с' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(person('Оля')).getByRole('button', { name: 'Вилучити' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a continued game offers release', () => {
    const confirm = vi.mocked(window.confirm);
    show(room({ status: 'playing', continued: true }));
    fireEvent.click(within(person('Оля')).getByRole('button', { name: 'Звільнити' }));
    expect(confirm).toHaveBeenLastCalledWith('Звільнити місце «Оля»? Бали лишаться в таблиці.');
    expect(onCommand).toHaveBeenLastCalledWith({ type: 'release', playerId: 'p1' });
  });

  it('nobody yet, and a finished room has no people and no buttons', () => {
    show(room({ people: [] }));
    expect(screen.getByText('Ще ніхто не приєднався.')).toBeTruthy();
    cleanup();
    show(room({ status: 'finished' }));
    expect(screen.queryByRole('heading', { name: 'Гравці' })).toBeNull();
    expect(screen.queryAllByRole('button')).toEqual([]);
  });

  it('ending asks first', () => {
    const confirm = vi.mocked(window.confirm);
    show(room());
    fireEvent.click(screen.getByRole('button', { name: 'Завершити гру' }));
    expect(confirm).toHaveBeenLastCalledWith('Завершити гру 123456 «Річки України 62»? Гравці побачать кінець гри.');
    expect(onCommand).toHaveBeenLastCalledWith({ type: 'end' });
    fireEvent.click(screen.getByRole('button', { name: 'Почати гру' }));
    expect(onCommand).toHaveBeenLastCalledWith({ type: 'start' });
  });
});
