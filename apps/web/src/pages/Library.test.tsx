// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { LibraryCard } from '@quiz/shared';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n';
import { libraryCatalog } from '../library/library-api';
import { Library } from './Library';

vi.mock('../library/library-api', () => ({ libraryCatalog: vi.fn() }));

const card = (over: Partial<LibraryCard> = {}): LibraryCard => ({
  id: 'e1',
  title: 'Річки України',
  description: '',
  author: 'Олена',
  questionCount: 6,
  roundTypes: ['classic', 'blitz'],
  language: 'uk',
  likes: 3,
  plays: 1,
  ...over,
});

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}
const show = (path = '/library') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/library" element={<><Library /><Where /></>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(libraryCatalog).mockResolvedValue({ ok: true, data: { items: [card()], next: null } });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Library', () => {
  it('lists cards for a guest with author, questions, round types, likes and plays', async () => {
    vi.mocked(libraryCatalog).mockResolvedValue({
      ok: true,
      data: { items: [card(), card({ id: 'e2', title: 'Столиці', plays: 2, questionCount: 12, roundTypes: ['classic'] }), card({ id: 'e3', title: 'Ліси', plays: 5 })], next: null },
    });
    show();
    expect(screen.getByRole('heading', { level: 1, name: 'Бібліотека' })).toBeTruthy();
    const list = await screen.findByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]!.textContent).toContain('Автор: Олена');
    expect(items[0]!.textContent).toContain('6 запитань');
    expect(items[0]!.textContent).toContain('зіграли 1 раз');
    expect(items[0]!.textContent).toContain('Класичний');
    expect(items[1]!.textContent).toContain('12 запитань');
    expect(items[1]!.textContent).toContain('зіграли 2 рази');
    expect(items[2]!.textContent).toContain('зіграли 5 разів');
    expect(within(items[0]!).getByRole('link').getAttribute('href')).toBe('/library/e1');
    expect(libraryCatalog).toHaveBeenCalledWith({ q: '', sort: 'popular', lang: '', offset: 0 });
  });

  it('searches after a pause and keeps the query in the address', async () => {
    vi.useFakeTimers();
    show();
    await act(async () => {});
    vi.mocked(libraryCatalog).mockClear();
    fireEvent.change(screen.getByLabelText('Пошук за назвою чи описом'), { target: { value: 'дніпро' } });
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(libraryCatalog).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(150); });
    expect(libraryCatalog).toHaveBeenCalledTimes(1);
    expect(libraryCatalog).toHaveBeenCalledWith({ q: 'дніпро', sort: 'popular', lang: '', offset: 0 });
    expect(screen.getByTestId('where').textContent).toContain('q=');
  });

  it('switches to the newest and filters by language', async () => {
    show();
    await screen.findByRole('list');
    fireEvent.change(screen.getByLabelText('Порядок'), { target: { value: 'new' } });
    await vi.waitFor(() => expect(libraryCatalog).toHaveBeenLastCalledWith({ q: '', sort: 'new', lang: '', offset: 0 }));
    fireEvent.change(screen.getByLabelText('Мова'), { target: { value: 'en' } });
    await vi.waitFor(() => expect(libraryCatalog).toHaveBeenLastCalledWith({ q: '', sort: 'new', lang: 'en', offset: 0 }));
    expect(screen.getByTestId('where').textContent).toBe('/library?sort=new&lang=en');
    const options = within(screen.getByLabelText('Мова')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Усі мови', 'Українська', 'English', 'Polski', 'Deutsch', 'Español', 'Italiano', 'العربية']);
  });

  it('starts from the address and adds the next page', async () => {
    vi.mocked(libraryCatalog).mockResolvedValueOnce({ ok: true, data: { items: [card()], next: 20 } });
    show('/library?q=ab&sort=new&lang=pl');
    await screen.findByRole('list');
    expect(libraryCatalog).toHaveBeenCalledWith({ q: 'ab', sort: 'new', lang: 'pl', offset: 0 });
    expect((screen.getByLabelText('Пошук за назвою чи описом') as HTMLInputElement).value).toBe('ab');
    vi.mocked(libraryCatalog).mockResolvedValueOnce({ ok: true, data: { items: [card({ id: 'e9', title: 'Друга' })], next: null } });
    fireEvent.click(screen.getByRole('button', { name: 'Показати ще' }));
    await screen.findByText('Друга');
    expect(libraryCatalog).toHaveBeenLastCalledWith({ q: 'ab', sort: 'new', lang: 'pl', offset: 20 });
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Показати ще' })).toBeNull();
  });

  it('ignores a late "Show more" answer after the filters changed and blocks the button while reloading', async () => {
    vi.mocked(libraryCatalog).mockResolvedValueOnce({ ok: true, data: { items: [card()], next: 20 } });
    show();
    await screen.findByRole('list');
    type Answer = Awaited<ReturnType<typeof libraryCatalog>>;
    let late!: (value: Answer) => void;
    vi.mocked(libraryCatalog).mockReturnValueOnce(new Promise<Answer>((resolve) => { late = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: 'Показати ще' }));
    let reload!: (value: Answer) => void;
    vi.mocked(libraryCatalog).mockReturnValueOnce(new Promise<Answer>((resolve) => { reload = resolve; }));
    fireEvent.change(screen.getByLabelText('Порядок'), { target: { value: 'new' } });
    expect(screen.queryByRole('button', { name: 'Показати ще' })).toBeNull();
    await act(async () => late({ ok: true, data: { items: [card({ id: 'old', title: 'Стара' })], next: null } }));
    await act(async () => reload({ ok: true, data: { items: [card({ id: 'fresh', title: 'Свіжа' })], next: null } }));
    expect(await screen.findByText('Свіжа')).toBeTruthy();
    expect(screen.queryByText('Стара')).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('keeps a sort change made while the search is still waiting', async () => {
    vi.useFakeTimers();
    show();
    await act(async () => {});
    fireEvent.change(screen.getByLabelText('Пошук за назвою чи описом'), { target: { value: 'ліс' } });
    await act(async () => { vi.advanceTimersByTime(100); });
    fireEvent.change(screen.getByLabelText('Порядок'), { target: { value: 'new' } });
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(libraryCatalog).toHaveBeenLastCalledWith({ q: 'ліс', sort: 'new', lang: '', offset: 0 });
  });

  it('says so when nothing is found', async () => {
    vi.mocked(libraryCatalog).mockResolvedValue({ ok: true, data: { items: [], next: null } });
    show();
    expect(await screen.findByText('Нічого не знайдено.')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
    // Без пошуку очищати нічого.
    expect(screen.queryByRole('button', { name: 'Очистити пошук' })).toBeNull();
  });

  it('nothing found for a search offers «Очистити пошук» (76)', async () => {
    vi.mocked(libraryCatalog).mockResolvedValue({ ok: true, data: { items: [], next: null } });
    show('/library?q=xyz&lang=pl&sort=new');
    fireEvent.click(await screen.findByRole('button', { name: 'Очистити пошук' }));
    expect(screen.getByTestId('where').textContent).toBe('/library?sort=new');
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
  });

  it('a failed first page offers «Спробувати ще раз» (76)', async () => {
    vi.mocked(libraryCatalog).mockResolvedValueOnce({ ok: false, error: 'offline' });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Спробувати ще раз' }));
    expect(await screen.findByRole('list')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows an error when the catalog cannot be loaded', async () => {
    vi.mocked(libraryCatalog).mockResolvedValue({ ok: false, error: 'network' });
    show();
    expect((await screen.findByRole('alert')).textContent).not.toBe('');
  });
  it('the heading has the ⓘ help with the library entry', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: t('helpOpen', { title: 'Бібліотека вікторин' }) }));
    expect(document.querySelector('.help-pop')!.textContent).toContain('Бібліотека вікторин');
  });
});
