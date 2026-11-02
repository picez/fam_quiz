// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { CalendarEvent } from '@quiz/shared';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CalendarCard } from './CalendarCard';

const host = { id: 'h', nickname: 'Іра', avatar: null };
const ev = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'e1',
  title: 'Вечір загадок',
  startsAt: '2026-11-07T17:00:00.000Z',
  host,
  mine: false,
  quiz: { id: null, title: 'Україна' },
  state: 'planned',
  editedAt: null,
  cancelledAt: null,
  approved: 0,
  myRequest: null,
  requests: null,
  joinCode: null,
  ...over,
});

const show = (event: CalendarEvent, busy = false) => {
  const onAction = vi.fn();
  render(
    <MemoryRouter>
      <CalendarCard event={event} zone="Europe/Kyiv" busy={busy} onAction={onAction} />
    </MemoryRouter>,
  );
  return onAction;
};
const buttons = () => screen.queryAllByRole('button');

afterEach(cleanup);

describe('CalendarCard', () => {
  it('shows the title, time in the zone, host and quiz; id for the anchor', () => {
    show(ev());
    expect(screen.getByText('Вечір загадок')).toBeTruthy();
    expect(screen.getByText(/19:00/)).toBeTruthy();
    expect(screen.getByText('Веде Іра')).toBeTruthy();
    expect(screen.getByText('Україна')).toBeTruthy();
    const li = document.getElementById('event-e1')!;
    expect(li.className).toContain('calendar-card');
    expect(li.getAttribute('data-state')).toBe('planned');
  });

  it('a friend without a request can ask', () => {
    const onAction = show(ev());
    const event = ev();
    fireEvent.click(screen.getByRole('button', { name: 'Хочу взяти участь' }));
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: event.id }), 'request');
  });

  it('pending: label and withdraw', () => {
    const onAction = show(ev({ myRequest: 'pending' }));
    expect(screen.getByText('Запит надіслано')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Скасувати запит' }));
    expect(onAction).toHaveBeenCalledWith(expect.anything(), 'withdraw');
  });

  it('approved in an open game gets a join link', () => {
    show(ev({ myRequest: 'approved', state: 'open', joinCode: '123456' }));
    expect(screen.getByText('Підтверджено')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Приєднатися' }).getAttribute('href')).toBe('/play/123456');
  });

  it('approved before the game has no join link', () => {
    show(ev({ myRequest: 'approved' }));
    expect(screen.getByText('Підтверджено')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Приєднатися' })).toBeNull();
  });

  it('rejected: label only', () => {
    show(ev({ myRequest: 'rejected' }));
    expect(screen.getByText('Відхилено')).toBeTruthy();
    expect(buttons()).toHaveLength(0);
  });

  const requests = [
    { user: { id: 'olya', nickname: 'Оля', avatar: null }, status: 'pending' as const, at: '2026-11-02T10:00:00.000Z' },
    { user: { id: 'petro', nickname: 'Петро', avatar: null }, status: 'approved' as const, at: '2026-11-02T11:00:00.000Z' },
  ];

  it('host of a planned event: actions and the request list', () => {
    const onAction = show(ev({ mine: true, quiz: { id: 'q1', title: 'Україна' }, requests }));
    expect(screen.getByText('Ти ведеш')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Відкрити гру' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Змінити' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Скасувати подію' })).toBeTruthy();
    const olya = screen.getByText('Оля').closest('li')!;
    fireEvent.click(within(olya).getByRole('button', { name: 'Підтвердити' }));
    expect(onAction).toHaveBeenCalledWith(expect.anything(), { decide: 'olya', decision: 'approved' });
    const petro = screen.getByText('Петро').closest('li')!;
    expect(within(petro).queryByRole('button', { name: 'Підтвердити' })).toBeNull();
    fireEvent.click(within(petro).getByRole('button', { name: 'Відхилити' }));
    expect(onAction).toHaveBeenCalledWith(expect.anything(), { decide: 'petro', decision: 'rejected' });
    fireEvent.click(screen.getByRole('button', { name: 'Відкрити гру' }));
    expect(onAction).toHaveBeenCalledWith(expect.anything(), 'open');
  });

  it('host of an open event: to the panel, no edit', () => {
    const onAction = show(ev({ mine: true, state: 'open', joinCode: '123456', requests: [] }));
    expect(screen.getByText('Гра йде')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Змінити' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Відкрити гру' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'До пульта' }));
    expect(onAction).toHaveBeenCalledWith(expect.anything(), 'open');
    expect(screen.getByRole('button', { name: 'Скасувати подію' })).toBeTruthy();
  });

  it('cancelled and played have no action buttons', () => {
    show(ev({ state: 'cancelled', cancelledAt: '2026-11-03T10:00:00.000Z', editedAt: '2026-11-03T09:00:00.000Z' }));
    expect(screen.getByText('Скасовано')).toBeTruthy();
    expect(screen.queryByText('Змінено')).toBeNull();
    expect(buttons()).toHaveLength(0);
    cleanup();
    show(ev({ state: 'played', mine: true, requests: [], quiz: { id: 'q', title: 'Україна' } }));
    expect(screen.getByText('Зіграно')).toBeTruthy();
    expect(buttons()).toHaveLength(0);
  });

  it('shows «Змінено» for an edited event', () => {
    show(ev({ editedAt: '2026-11-03T09:00:00.000Z' }));
    expect(screen.getByText('Змінено')).toBeTruthy();
  });

  it('counts participants', () => {
    show(ev({ approved: 3 }));
    expect(screen.getByText('3 учасники')).toBeTruthy();
  });

  it('a deleted quiz', () => {
    show(ev({ quiz: { id: null, title: null } }));
    expect(screen.getByText('Вікторину видалено')).toBeTruthy();
  });

  it('busy disables the buttons', () => {
    show(ev(), true);
    expect((screen.getByRole('button', { name: 'Хочу взяти участь' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
