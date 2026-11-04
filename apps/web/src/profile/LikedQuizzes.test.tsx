// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GivenLike, ReceivedLike } from '@quiz/shared';
import { getLikesGiven, getLikesReceived } from '../api';
import { nickText } from '../nick';
import { LikedQuizzes } from './LikedQuizzes';

vi.mock('../api', () => ({ getLikesGiven: vi.fn(), getLikesReceived: vi.fn() }));

const author = { id: 'a1', nickname: 'Зірка', avatar: null };
const given = (over: Partial<GivenLike> = {}): GivenLike => ({
  quizId: 'q1',
  quiz: { title: 'Космос', author },
  count: 3,
  lastAt: '2026-11-01T10:00:00.000Z',
  quizLiked: true,
  questions: ['Яка планета найбільша?', 'Скільки місяців у Марса?'],
  gone: 0,
  ...over,
});
const received = (over: Partial<ReceivedLike> = {}): ReceivedLike => ({
  quizId: 'q1',
  title: 'Моя вікторина',
  total: 5,
  people: 2,
  top: [
    { text: 'Перше', count: 2 },
    { text: 'Друге', count: 2 },
    { text: 'Третє', count: 1 },
  ],
  ...over,
});
const givenPage = (items: GivenLike[], next: number | null = null) => vi.mocked(getLikesGiven).mockResolvedValue({ ok: true, data: { items, next } });
const receivedPage = (items: ReceivedLike[], next: number | null = null) => vi.mocked(getLikesReceived).mockResolvedValue({ ok: true, data: { items, next } });
const show = () =>
  render(
    <MemoryRouter>
      <LikedQuizzes />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.mocked(getLikesGiven).mockReset();
  vi.mocked(getLikesReceived).mockReset();
  receivedPage([]);
});
afterEach(cleanup);

describe('LikedQuizzes', () => {
  it('opens «Мені сподобались» first and lists rows: title, author link, count, date', async () => {
    givenPage([given()]);
    const { container } = show();
    expect(screen.getByRole('tab', { name: 'Мені сподобались' }).getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByText('Космос')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Зірка/ }).getAttribute('href')).toBe('/profile/a1');
    expect(container.querySelector('.liked-row')?.textContent).toContain('❤️ 3');
    expect(container.querySelector('.liked-row')?.textContent).toContain('востаннє');
  });

  it('expands the liked question texts and «уся вікторина», no answers', async () => {
    givenPage([given({ gone: 1 })]);
    show();
    const button = await screen.findByRole('button', { name: 'Запитання' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Яка планета найбільша?')).toBeNull();
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Яка планета найбільша?')).toBeTruthy();
    expect(screen.getByText('Скільки місяців у Марса?')).toBeTruthy();
    expect(screen.getByText('уся вікторина')).toBeTruthy();
    expect(screen.getByText('ще 1 запитання змінено чи прибрано')).toBeTruthy();
  });

  it('a deleted quiz is «Вікторину видалено» without the expand button', async () => {
    givenPage([given({ quiz: null, count: 0, quizLiked: false, questions: [], gone: 0 })]);
    const { container } = show();
    expect(await screen.findByText('Вікторину видалено')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Запитання' })).toBeNull();
    expect(container.querySelector('.liked-author')).toBeNull();
  });

  it('author without nickname shows the fallback nick', async () => {
    givenPage([given({ quiz: { title: 'Космос', author: { id: 'a2', nickname: null, avatar: null } } })]);
    show();
    const link = await screen.findByRole('link', { name: new RegExp(nickText(null)) });
    expect(link.getAttribute('href')).toBe('/profile/a2');
  });

  it('«Сподобались іншим»: total, people, top questions, title opens the editor', async () => {
    givenPage([]);
    receivedPage([received()]);
    const { container } = show();
    fireEvent.click(screen.getByRole('tab', { name: 'Сподобались іншим' }));
    const link = await screen.findByRole('link', { name: 'Моя вікторина' });
    expect(link.getAttribute('href')).toBe('/quizzes/q1');
    expect(getLikesReceived).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.liked-row')?.textContent).toContain('❤️ 5');
    expect(screen.getByText('2 людини')).toBeTruthy();
    expect(container.querySelectorAll('ol.liked-top li')).toHaveLength(3);
  });

  it('empty tabs show their hint', async () => {
    givenPage([]);
    show();
    expect(await screen.findByText(/Ти ще нічого не вподобав/)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Сподобались іншим' }));
    expect(await screen.findByText('Твоїм вікторинам ще ніхто не ставив ❤️.')).toBeTruthy();
  });

  it('more: «Показати ще» only while next is set; the next page appends', async () => {
    vi.mocked(getLikesGiven)
      .mockResolvedValueOnce({ ok: true, data: { items: [given({ quizId: 'q1', quiz: { title: 'Перша', author } })], next: 20 } })
      .mockResolvedValueOnce({ ok: true, data: { items: [given({ quizId: 'q2', quiz: { title: 'Друга', author } })], next: null } });
    show();
    expect(await screen.findByText('Перша')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Показати ще' }));
    expect(await screen.findByText('Друга')).toBeTruthy();
    expect(getLikesGiven).toHaveBeenLastCalledWith(20);
    expect(screen.getByText('Перша')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Показати ще' })).toBeNull();
  });

  it('a failed «Показати ще» keeps the shown rows', async () => {
    vi.mocked(getLikesGiven)
      .mockResolvedValueOnce({ ok: true, data: { items: [given()], next: 20 } })
      .mockResolvedValueOnce({ ok: false, error: 'network' });
    show();
    await screen.findByText('Космос');
    fireEvent.click(screen.getByRole('button', { name: 'Показати ще' }));
    expect((await screen.findByRole('alert')).textContent).toBeTruthy();
    expect(screen.getByText('Космос')).toBeTruthy();
  });

  it('arrow keys move between tabs; returning does not refetch', async () => {
    givenPage([given()]);
    show();
    await screen.findByText('Космос');
    const mine = screen.getByRole('tab', { name: 'Мені сподобались' });
    const others = screen.getByRole('tab', { name: 'Сподобались іншим' });
    fireEvent.keyDown(mine, { key: 'ArrowRight' });
    expect(others.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(others);
    fireEvent.keyDown(others, { key: 'ArrowLeft' });
    expect(mine.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(mine);
    expect(await screen.findByText('Космос')).toBeTruthy();
    expect(getLikesGiven).toHaveBeenCalledTimes(1);
    expect(getLikesReceived).toHaveBeenCalledTimes(1);
  });

  it('a failed load shows an error, not a crash', async () => {
    vi.mocked(getLikesGiven).mockResolvedValue({ ok: false, error: 'network' });
    show();
    expect((await screen.findByRole('alert')).textContent).toBeTruthy();
  });
});
