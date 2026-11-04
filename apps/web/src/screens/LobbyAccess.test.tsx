// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLobbySettings, saveLobbySettings } from '../api';
import { LobbyAccess } from './LobbyAccess';

vi.mock('../api', () => ({ getLobbySettings: vi.fn(), saveLobbySettings: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getLobbySettings).mockResolvedValue({ ok: true, visibility: 'friends', password: null });
  vi.mocked(saveLobbySettings).mockImplementation(async (_code, settings) => ({ ok: true, ...settings }));
});
afterEach(cleanup);

const group = async () => within(await screen.findByRole('group', { name: 'Хто бачить гру' }));

describe('LobbyAccess', () => {
  it('shows who sees the game as three radios with the saved one chosen', async () => {
    render(<LobbyAccess code="123456" />);
    const radios = (await group()).getAllByRole('radio') as HTMLInputElement[];
    expect(radios.map((r) => r.closest('label')?.textContent)).toEqual(['Усі', 'Лише друзі', 'Прихована (лише за кодом)']);
    expect(radios.map((r) => r.checked)).toEqual([false, true, false]);
    expect(getLobbySettings).toHaveBeenCalledWith('123456');
  });

  it('saves a new visibility at once and says so', async () => {
    render(<LobbyAccess code="123456" />);
    fireEvent.click((await group()).getByRole('radio', { name: 'Усі' }));
    await waitFor(() => expect(saveLobbySettings).toHaveBeenCalledWith('123456', { visibility: 'all', password: null }));
    expect((await screen.findByRole('status')).textContent).toBe('Збережено');
    expect(((await group()).getByRole('radio', { name: 'Усі' }) as HTMLInputElement).checked).toBe(true);
  });

  it('saves a password and shows it, then removes it', async () => {
    render(<LobbyAccess code="123456" />);
    const input = (await screen.findByLabelText('Пароль гри (необов’язково)')) as HTMLInputElement;
    expect(screen.queryByRole('button', { name: 'Прибрати пароль' })).toBeNull();
    fireEvent.change(input, { target: { value: ' сова42 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти пароль' }));
    await waitFor(() => expect(saveLobbySettings).toHaveBeenCalledWith('123456', { visibility: 'friends', password: 'сова42' }));
    await waitFor(() => expect((screen.getByLabelText('Пароль гри (необов’язково)') as HTMLInputElement).value).toBe('сова42'));
    expect((await screen.findByRole('status')).textContent).toBe('Збережено');
    fireEvent.click(screen.getByRole('button', { name: 'Прибрати пароль' }));
    await waitFor(() => expect(saveLobbySettings).toHaveBeenLastCalledWith('123456', { visibility: 'friends', password: null }));
    await waitFor(() => expect((screen.getByLabelText('Пароль гри (необов’язково)') as HTMLInputElement).value).toBe(''));
    expect(screen.queryByRole('button', { name: 'Прибрати пароль' })).toBeNull();
  });

  it('keeps the saved password when visibility changes', async () => {
    vi.mocked(getLobbySettings).mockResolvedValue({ ok: true, visibility: 'friends', password: 'сова42' });
    render(<LobbyAccess code="123456" />);
    fireEvent.click((await group()).getByRole('radio', { name: 'Прихована (лише за кодом)' }));
    await waitFor(() => expect(saveLobbySettings).toHaveBeenCalledWith('123456', { visibility: 'hidden', password: 'сова42' }));
  });

  it('refuses a short password without asking the server', async () => {
    render(<LobbyAccess code="123456" />);
    const input = await screen.findByLabelText('Пароль гри (необов’язково)');
    fireEvent.change(input, { target: { value: 'abc' } });
    expect((screen.getByRole('button', { name: 'Зберегти пароль' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Від 4 до 32 символів/)).toBeTruthy();
    expect(saveLobbySettings).not.toHaveBeenCalled();
  });

  it('shows the server error', async () => {
    vi.mocked(saveLobbySettings).mockResolvedValue({ ok: false, error: 'wrong_phase' });
    render(<LobbyAccess code="123456" />);
    fireEvent.click((await group()).getByRole('radio', { name: 'Усі' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent?.length).toBeGreaterThan(0);
    expect(screen.queryByRole('status')).toBeNull();
    expect(((await group()).getByRole('radio', { name: 'Лише друзі' }) as HTMLInputElement).checked).toBe(true);
  });

  it('keeps keyboard focus on the radio after a save', async () => {
    render(<LobbyAccess code="123456" />);
    const radio = (await group()).getByRole('radio', { name: 'Усі' }) as HTMLInputElement;
    radio.focus();
    fireEvent.click(radio);
    await screen.findByRole('status');
    expect(document.activeElement).toBe(radio);
  });

  it('marks a short password invalid', async () => {
    render(<LobbyAccess code="123456" />);
    const input = await screen.findByLabelText('Пароль гри (необов’язково)');
    expect(input.getAttribute('aria-invalid')).toBe('false');
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('offers a retry when the first load fails', async () => {
    vi.mocked(getLobbySettings).mockResolvedValueOnce({ ok: false, error: 'offline' });
    render(<LobbyAccess code="123456" />);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Спробувати ще' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(((await group()).getByRole('radio', { name: 'Лише друзі' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByRole('button', { name: 'Спробувати ще' })).toBeNull();
  });

  it('keeps what the host types while a radio save is in flight', async () => {
    let release: () => void = () => {};
    vi.mocked(saveLobbySettings).mockImplementationOnce((_code, settings) => new Promise((resolve) => { release = () => resolve({ ok: true, ...settings }); }));
    render(<LobbyAccess code="123456" />);
    fireEvent.click((await group()).getByRole('radio', { name: 'Усі' }));
    const input = screen.getByLabelText('Пароль гри (необов’язково)') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'сова42' } });
    release();
    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
    expect(input.value).toBe('сова42');
  });

  it('saves the latest radio choice made during an in-flight save', async () => {
    let release: () => void = () => {};
    vi.mocked(saveLobbySettings).mockImplementationOnce((_code, settings) => new Promise((resolve) => { release = () => resolve({ ok: true, ...settings }); }));
    render(<LobbyAccess code="123456" />);
    const radios = await group();
    fireEvent.click(radios.getByRole('radio', { name: 'Усі' }));
    fireEvent.click(radios.getByRole('radio', { name: 'Прихована (лише за кодом)' }));
    expect((radios.getByRole('radio', { name: 'Прихована (лише за кодом)' }) as HTMLInputElement).checked).toBe(true);
    release();
    await waitFor(() => expect(saveLobbySettings).toHaveBeenCalledTimes(2));
    expect(saveLobbySettings).toHaveBeenLastCalledWith('123456', { visibility: 'hidden', password: null });
    await waitFor(() => expect((radios.getByRole('radio', { name: 'Прихована (лише за кодом)' }) as HTMLInputElement).checked).toBe(true));
  });
});
