// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroupDetail, GroupItem } from '@quiz/shared';
import { deleteGroupItem, getGroupItems } from '../api';
import { ItemList } from './ItemList';

vi.mock('../api', () => ({ getGroupItems: vi.fn(), deleteGroupItem: vi.fn() }));

const at = '2026-11-14T10:00:00.000Z';
const group: GroupDetail = {
  id: 'g1',
  name: 'Родина Квіткових',
  emoji: '🌻',
  description: '',
  role: 'member',
  people: 3,
  items: 3,
  joinedAt: at,
  members: [
    { id: 'u1', nickname: 'Оля', avatar: null, role: 'owner', joinedAt: at, you: false },
    { id: 'u2', nickname: 'Петро', avatar: null, role: 'member', joinedAt: at, you: false },
    { id: 'u3', nickname: 'Іра', avatar: null, role: 'member', joinedAt: at, you: true },
  ],
};
const item = (id: string, extra: Partial<GroupItem>): GroupItem => ({
  id,
  kind: 'fact',
  text: '',
  about: [],
  answer: null,
  year: null,
  photo: null,
  surprise: false,
  author: { id: 'u2', nickname: 'Петро', avatar: null },
  mine: false,
  canDelete: false,
  uses: [],
  createdAt: at,
  updatedAt: at,
  ...extra,
});
const items = [
  item('i1', { kind: 'story', text: 'Як тато заблукав у лісі по гриби', about: [{ kind: 'name', name: 'тато' }], answer: 'Тато', year: 1998, author: null }),
  item('i2', { kind: 'quote', text: '„Хто рано встає, тому кава гаряча“ — дідусь Іван', mine: true, canDelete: true, author: { id: 'u3', nickname: 'Іра', avatar: null } }),
  item('i3', { text: 'Оля колись спекла торт без борошна', about: [{ kind: 'member', userId: 'u1', name: 'Оля', former: false }], surprise: true }),
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getGroupItems).mockResolvedValue({ ok: true, data: items });
  vi.mocked(deleteGroupItem).mockResolvedValue({ ok: true });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const open = () =>
  render(
    <MemoryRouter>
      <ItemList group={group} />
    </MemoryRouter>,
  );
const texts = () => [...document.querySelectorAll('.group-item-text')].map((p) => p.textContent);

describe('ItemList (12k)', () => {
  it('searches, filters by kind and by «про кого»', async () => {
    open();
    await screen.findByText('Як тато заблукав у лісі по гриби');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Пошук у записах' }), { target: { value: 'гриб' } });
    expect(texts()).toEqual(['Як тато заблукав у лісі по гриби']);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Пошук у записах' }), { target: { value: 'щось інше' } });
    expect(screen.getByText('Нічого не знайшлося. Спробуй інше слово чи прибери фільтр.')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Пошук у записах' }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Цитата' }));
    expect(texts()).toEqual(['„Хто рано встає, тому кава гаряча“ — дідусь Іван']);
    fireEvent.click(screen.getByRole('radio', { name: 'Усі' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Про кого' }), { target: { value: 'u1' } });
    expect(texts()).toEqual(['Оля колись спекла торт без борошна']);
  });

  it('shows the author or «вже не в групі», the surprise note, edit only for mine and delete with a confirm', async () => {
    open();
    await screen.findByText('Як тато заблукав у лісі по гриби');
    const cards = [...document.querySelectorAll('article.group-item')];
    expect(cards[0]!.textContent).toContain('✍️ вже не в групі');
    expect(cards[0]!.textContent).toContain('Відповідь: Тато');
    expect(cards[2]!.textContent).toContain('🤫 Сюрприз для: Оля');
    expect(screen.getAllByRole('link', { name: 'Змінити' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Змінити' }).getAttribute('href')).toBe('/profile/groups/g1/items/i2');
    fireEvent.click(screen.getByRole('button', { name: 'Видалити' }));
    await waitFor(() => expect(texts()).not.toContain('„Хто рано встає, тому кава гаряча“ — дідусь Іван'));
    expect(deleteGroupItem).toHaveBeenCalledWith('g1', 'i2');
    expect(window.confirm).toHaveBeenCalledWith('Видалити цей запис?');
  });

  it('an empty group invites to add the first record', async () => {
    vi.mocked(getGroupItems).mockResolvedValue({ ok: true, data: [] });
    open();
    expect(await screen.findByText(/Тут житимуть ваші історії/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Додати запис' }).getAttribute('href')).toBe('/profile/groups/g1/new');
  });

  it('at 500 records «Додати запис» is disabled', async () => {
    vi.mocked(getGroupItems).mockResolvedValue({ ok: true, data: Array.from({ length: 500 }, (_, i) => item(`x${i}`, { text: `Факт ${i}` })) });
    open();
    const add = await screen.findByRole('button', { name: 'Додати запис' });
    expect((add as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('У групі вже 500 записів — це межа.')).toBeTruthy();
  });
});

describe('ItemList: «використано» and «Вікторина з групи» (12l)', () => {
  const used = { quizId: 'q1', title: 'Вікторина: Родина Квіткових', mine: false, at };

  it('a used record says where; «Ще не використані» keeps the unused ones', async () => {
    vi.mocked(getGroupItems).mockResolvedValue({ ok: true, data: [{ ...items[0]!, uses: [used] }, items[1]!, items[2]!] });
    open();
    await screen.findByText('Як тато заблукав у лісі по гриби');
    const card = document.querySelector('article.group-item')!;
    expect(card.querySelector('.group-item-used')?.textContent).toBe('Використано у «Вікторина: Родина Квіткових»');
    const unused = screen.getByRole('button', { name: 'Ще не використані' });
    fireEvent.click(unused);
    expect(unused.getAttribute('aria-pressed')).toBe('true');
    expect(texts()).toEqual(['„Хто рано встає, тому кава гаряча“ — дідусь Іван', 'Оля колись спекла торт без борошна']);
  });

  it('«Вікторина з групи» turns the cards into checkboxes; «Скасувати» brings back the usual cards', async () => {
    open();
    await screen.findByText('Як тато заблукав у лісі по гриби');
    fireEvent.click(screen.getByRole('button', { name: 'Вікторина з групи' }));
    expect(screen.queryByRole('link', { name: 'Змінити' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Видалити' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Скласти вікторину · 0' }) as HTMLButtonElement).disabled).toBe(true);
    const boxes = screen.getAllByRole('checkbox', { name: 'Узяти у вікторину' });
    expect(boxes).toHaveLength(3);
    for (const box of boxes) fireEvent.click(box);
    expect((screen.getByRole('button', { name: 'Скласти вікторину · 3' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Скасувати' }));
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByRole('link', { name: 'Змінити' })).toBeTruthy();
  });

  it('no records — no «Вікторина з групи»', async () => {
    vi.mocked(getGroupItems).mockResolvedValue({ ok: true, data: [] });
    open();
    await screen.findByText(/Тут житимуть ваші історії/);
    expect(screen.queryByRole('button', { name: 'Вікторина з групи' })).toBeNull();
  });
});
