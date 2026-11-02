// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CalendarEvent } from '@quiz/shared';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuizSummary } from '../api';
import { CalendarForm } from './CalendarForm';

const quizzes: QuizSummary[] = [
  { id: 'q1', title: 'Україна', description: '', questionCount: 5, updatedAt: '2026-11-01T10:00:00.000Z' },
  { id: 'q2', title: 'Кіно', description: '', questionCount: 5, updatedAt: '2026-11-01T10:00:00.000Z' },
];
const now = new Date('2026-11-02T10:00:00.000Z');

const show = (props: Partial<Parameters<typeof CalendarForm>[0]> = {}) => {
  const onSubmit = vi.fn().mockResolvedValue(null);
  const onCancel = vi.fn();
  render(
    <MemoryRouter>
      <CalendarForm quizzes={quizzes} zone="Europe/Kyiv" now={now} onSubmit={onSubmit} onCancel={onCancel} {...props} />
    </MemoryRouter>,
  );
  return { onSubmit, onCancel };
};

afterEach(cleanup);

describe('CalendarForm', () => {
  it('submits the title, the instant in UTC (by zone) and the quiz', async () => {
    const { onSubmit } = show();
    fireEvent.change(screen.getByLabelText('Назва'), { target: { value: 'Вечір загадок' } });
    fireEvent.change(screen.getByLabelText('Дата й час'), { target: { value: '2026-11-07T19:00' } });
    fireEvent.change(screen.getByLabelText('Вікторина'), { target: { value: 'q1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ title: 'Вечір загадок', startsAt: '2026-11-07T17:00:00.000Z', quizId: 'q1' }));
  });

  it('shows the start in the viewer zone when editing', () => {
    const initial = { title: 'Старе', startsAt: '2026-11-07T17:00:00.000Z', quiz: { id: 'q2', title: 'Кіно' } } as CalendarEvent;
    show({ initial });
    expect((screen.getByLabelText('Дата й час') as HTMLInputElement).value).toBe('2026-11-07T19:00');
    expect((screen.getByLabelText('Назва') as HTMLInputElement).value).toBe('Старе');
    expect((screen.getByLabelText('Вікторина') as HTMLSelectElement).value).toBe('q2');
  });

  it('limits the earliest time to now in the zone and the title length', () => {
    show();
    const when = screen.getByLabelText('Дата й час') as HTMLInputElement;
    expect(when.type).toBe('datetime-local');
    expect(when.min).toBe('2026-11-02T12:00');
    expect((screen.getByLabelText('Назва') as HTMLInputElement).maxLength).toBe(80);
  });

  it('keeps the form and shows the refusal text', async () => {
    const { onSubmit } = show({ onSubmit: vi.fn().mockResolvedValue('Обери час…') });
    void onSubmit;
    fireEvent.change(screen.getByLabelText('Назва'), { target: { value: 'А' } });
    fireEvent.change(screen.getByLabelText('Дата й час'), { target: { value: '2026-11-07T19:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Обери час…');
    expect(screen.getByLabelText('Назва')).toBeTruthy();
  });

  it('cancel calls onCancel', () => {
    const { onCancel } = show();
    fireEvent.click(screen.getByRole('button', { name: 'Не зберігати' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('without quizzes offers to create one instead of the fields', () => {
    show({ quizzes: [] });
    expect(screen.getByRole('link', { name: 'Нова вікторина' }).getAttribute('href')).toBe('/quizzes/new');
    expect(screen.queryByLabelText('Назва')).toBeNull();
  });
});
