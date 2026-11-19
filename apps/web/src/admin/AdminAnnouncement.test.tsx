// @vitest-environment jsdom
import type { Announcement } from '@quiz/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localInputToIso, viewerZone } from '../calendar/calendar-time';
import { errorText } from '../i18n';
import { AdminAnnouncement } from './AdminAnnouncement';
import { adminAnnouncement, clearAnnouncement, saveAnnouncement } from './admin-api';

vi.mock('./admin-api', () => ({ adminAnnouncement: vi.fn(), saveAnnouncement: vi.fn(), clearAnnouncement: vi.fn() }));

const current = (over: Partial<Announcement> = {}): Announcement => ({
  id: 'a1',
  text: 'Субота — сімейна гра о 19:00',
  url: null,
  expiresAt: null,
  createdAt: '2026-11-19T08:00:00.000Z',
  ...over,
});
const open = () =>
  render(
    <MemoryRouter>
      <AdminAnnouncement />
    </MemoryRouter>,
  );
const field = () => screen.getByLabelText('Текст оголошення') as HTMLTextAreaElement;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.mocked(adminAnnouncement).mockResolvedValue({ ok: true, data: { announcement: null } });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AdminAnnouncement', () => {
  it('shows «Оголошення немає.» and publishes text with a link «доки не приберу»', async () => {
    const saved = current({ url: '/feed/calendar' });
    vi.mocked(saveAnnouncement).mockResolvedValue({ ok: true, data: saved });
    open();
    await screen.findByText('Оголошення немає.');
    fireEvent.change(field(), { target: { value: 'Субота — сімейна гра о 19:00' } });
    fireEvent.change(screen.getByLabelText("Посилання (необов'язково)"), { target: { value: '/feed/calendar' } });
    expect((screen.getByRole('radio', { name: 'Доки не приберу' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Опублікувати' }));
    await screen.findByText('Оголошення опубліковано.');
    expect(saveAnnouncement).toHaveBeenCalledWith({ text: 'Субота — сімейна гра о 19:00', url: '/feed/calendar', expiresAt: null });
    expect(screen.getByText('Зараз показується')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Замінити оголошення' })).toBeTruthy();
  });

  it('the counter shows «N з 200» and the field stops at 200', async () => {
    open();
    await screen.findByText('Оголошення немає.');
    expect(screen.getByText('0 з 200')).toBeTruthy();
    expect(field().maxLength).toBe(200);
    fireEvent.change(field(), { target: { value: 'абв' } });
    expect(screen.getByText('3 з 200')).toBeTruthy();
  });

  it('the preview shows the text as it will look', async () => {
    open();
    await screen.findByText('Оголошення немає.');
    fireEvent.change(field(), { target: { value: '<b>Привіт</b>' } });
    const preview = screen.getByText('Так його побачать').parentElement as HTMLElement;
    expect(preview.textContent).toContain('<b>Привіт</b>');
    expect(preview.querySelector('b')).toBeNull();
  });

  it('«До дати й часу» sends the time with the zone', async () => {
    vi.mocked(saveAnnouncement).mockResolvedValue({ ok: true, data: current() });
    open();
    await screen.findByText('Оголошення немає.');
    fireEvent.change(field(), { target: { value: 'Привіт' } });
    fireEvent.click(screen.getByRole('radio', { name: 'До дати й часу' }));
    const publish = screen.getByRole('button', { name: 'Опублікувати' }) as HTMLButtonElement;
    expect(publish.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('До дати й часу', { selector: 'input[type="datetime-local"]' }), { target: { value: '2026-11-20T19:00' } });
    expect(publish.disabled).toBe(false);
    fireEvent.click(publish);
    await waitFor(() => expect(saveAnnouncement).toHaveBeenCalled());
    expect(saveAnnouncement).toHaveBeenCalledWith({ text: 'Привіт', url: null, expiresAt: localInputToIso('2026-11-20T19:00', viewerZone()) });
  });

  it('refuses a link that is not https or a site path', async () => {
    open();
    await screen.findByText('Оголошення немає.');
    fireEvent.change(field(), { target: { value: 'Привіт' } });
    fireEvent.change(screen.getByLabelText("Посилання (необов'язково)"), { target: { value: 'http://example.com' } });
    expect((screen.getByRole('button', { name: 'Опублікувати' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toBe('https://… або сторінка сайту, наприклад /library');
    fireEvent.change(screen.getByLabelText("Посилання (необов'язково)"), { target: { value: '//evil.com' } });
    expect((screen.getByRole('button', { name: 'Опублікувати' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Посилання (необов'язково)"), { target: { value: 'https://example.com/a' } });
    expect((screen.getByRole('button', { name: 'Опублікувати' }) as HTMLButtonElement).disabled).toBe(false);
    expect(saveAnnouncement).not.toHaveBeenCalled();
  });

  it('«Прибрати оголошення» asks first and clears', async () => {
    vi.mocked(adminAnnouncement).mockResolvedValue({ ok: true, data: { announcement: current() } });
    vi.mocked(clearAnnouncement).mockResolvedValue({ ok: true });
    open();
    await screen.findByText('Зараз показується');
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: 'Прибрати оголошення' }));
    expect(clearAnnouncement).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Прибрати оголошення' }));
    await screen.findByText('Оголошення немає.');
    expect(window.confirm).toHaveBeenLastCalledWith('Прибрати оголошення для всіх?');
    expect(clearAnnouncement).toHaveBeenCalledTimes(1);
  });

  it("the server's «announcement_expiry» is shown as an alert", async () => {
    vi.mocked(saveAnnouncement).mockResolvedValue({ ok: false, error: 'announcement_expiry' });
    open();
    await screen.findByText('Оголошення немає.');
    fireEvent.change(field(), { target: { value: 'Привіт' } });
    fireEvent.click(screen.getByRole('button', { name: 'Опублікувати' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(errorText('announcement_expiry'));
  });
});
