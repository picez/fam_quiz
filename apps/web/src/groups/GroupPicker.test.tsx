// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seededRng, type GroupCard, type GroupDetail, type GroupItem } from '@quiz/shared';
import { getGroup, getGroupItems, getGroups } from '../api';
import { questionTypesFor } from '../editor/draft';
import { GroupPicker, type PickerTarget } from './GroupPicker';

vi.mock('../api', () => ({ getGroups: vi.fn(), getGroup: vi.fn(), getGroupItems: vi.fn() }));

const at = '2026-11-14T10:00:00.000Z';
const card = (id: string, name: string): GroupCard => ({ id, name, emoji: '🌻', description: '', role: 'owner', people: 3, items: 4, joinedAt: at });
const detail: GroupDetail = {
  ...card('g1', 'Родина Квіткових'),
  members: [
    { id: 'u-olia', nickname: 'Оля Квіткова', avatar: null, role: 'owner', joinedAt: at, you: true },
    { id: 'u-petro', nickname: 'Петро Гай', avatar: null, role: 'member', joinedAt: at, you: false },
    { id: 'u-ira', nickname: 'Іра Лис', avatar: null, role: 'member', joinedAt: at, you: false },
  ],
};
const item = (id: string, over: Partial<GroupItem>): GroupItem => ({
  id,
  kind: 'fact',
  text: '',
  about: [],
  answer: null,
  year: null,
  photo: null,
  surprise: false,
  author: null,
  mine: true,
  canDelete: true,
  uses: [],
  createdAt: at,
  updatedAt: at,
  ...over,
});
const STORY = 'Як тато заблукав у лісі по гриби й вийшов до сусіднього села. Шукали всім селом. Знайшовся з повним кошиком.';
const story = item('i-story', {
  kind: 'story',
  text: STORY,
  about: [{ kind: 'name', name: 'тато' }],
  answer: 'Тато',
  year: 1998,
  uses: [{ quizId: 'q1', title: 'Вікторина: Родина Квіткових', mine: true, at }],
});
const fact = item('i-fact', { text: 'Бабуся Ніна свистить двома пальцями голосніше за всіх', about: [{ kind: 'name', name: 'бабуся Ніна' }] });
const date = item('i-date', { kind: 'date', text: 'Перша поїздка на море всією родиною у 2004 році', answer: 'Затока', year: 2004 });
const items = [story, fact, date];

const classic: PickerTarget = { types: questionTypesFor('classic'), booleans: { yes: 0, no: 0 } };

function open(target: PickerTarget = classic) {
  const onPick = vi.fn();
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <GroupPicker target={target} onPick={onPick} onClose={onClose} rng={seededRng(3)} year={2026} />
    </MemoryRouter>,
  );
  return { onPick, onClose };
}

const record = (text: RegExp) => screen.findByRole('button', { name: text });
const template = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name.replace('?', '\\?')}`) }) as HTMLButtonElement;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getGroups).mockResolvedValue({ ok: true, groups: [card('g1', 'Родина Квіткових')], invites: [] });
  vi.mocked(getGroup).mockResolvedValue({ ok: true, ...detail });
  vi.mocked(getGroupItems).mockResolvedValue({ ok: true, data: items });
});
afterEach(cleanup);

describe('GroupPicker (12l)', () => {
  it('without groups says how to start and links to «Групи»', async () => {
    vi.mocked(getGroups).mockResolvedValue({ ok: true, groups: [], invites: [] });
    open();
    expect(await screen.findByText(/Ти ще не в жодній групі/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Відкрити «Групи»' }).getAttribute('href')).toBe('/profile/groups');
  });

  it('one group opens its records at once; two groups ask first and «Назад» returns', async () => {
    open();
    expect(await record(/^Як тато заблукав/)).toBeTruthy();
    expect(getGroup).toHaveBeenCalledWith('g1');
    cleanup();

    vi.mocked(getGroups).mockResolvedValue({ ok: true, groups: [card('g1', 'Родина Квіткових'), card('g2', 'Друзі з двору')], invites: [] });
    open();
    fireEvent.click(await screen.findByRole('button', { name: /Друзі з двору/ }));
    expect(await record(/^Як тато заблукав/)).toBeTruthy();
    expect(getGroup).toHaveBeenLastCalledWith('g2');
    fireEvent.click(screen.getByRole('button', { name: /Назад/ }));
    expect(await screen.findByRole('button', { name: /Родина Квіткових/ })).toBeTruthy();
  });

  it('shows where a record was used and hides it with «Ще не використані»', async () => {
    open();
    const used = await record(/^Як тато заблукав/);
    expect(used.textContent).toContain('Використано у «Вікторина: Родина Квіткових»');
    const unused = screen.getByRole('button', { name: 'Ще не використані' });
    expect(unused.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(unused);
    expect(unused.getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('button', { name: /^Як тато заблукав/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Бабуся Ніна/ })).toBeTruthy();
  });

  it('a record without a year and an answer disables the templates that need them, with the reason', async () => {
    open();
    fireEvent.click(await record(/^Бабуся Ніна/));
    const when = template('Коли це було?');
    expect(when.disabled).toBe(true);
    expect(when.textContent).toContain('Потрібен рік');
    expect(document.getElementById(when.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Потрібен рік');
    for (const name of ['Відкрите запитання', 'Блеф']) {
      expect(template(name).disabled, name).toBe(true);
      expect(template(name).textContent, name).toContain('Потрібна коротка відповідь');
    }
    expect(template('Хто це?').disabled).toBe(false);
  });

  it('on a board «Блеф» is not available', async () => {
    open({ types: questionTypesFor('board'), booleans: { yes: 0, no: 0 } });
    fireEvent.click(await record(/^Як тато заблукав/));
    expect(template('Блеф').disabled).toBe(true);
    expect(template('Блеф').textContent).toContain('У цьому раунді таких запитань немає');
  });

  it('«Хто це?» previews the question with four options and inserts it with the source', async () => {
    const { onPick } = open();
    fireEvent.click(await record(/^Як тато заблукав/));
    fireEvent.click(template('Хто це?'));
    expect(template('Хто це?').getAttribute('aria-pressed')).toBe('true');
    const preview = screen.getByRole('region', { name: 'Як вийде' });
    expect(preview.textContent).toContain('Хто це? Як ___ заблукав');
    expect(within(preview).getAllByRole('listitem')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Вставити запитання' }));
    expect(onPick).toHaveBeenCalledTimes(1);
    const [draft, source] = onPick.mock.calls[0]!;
    expect(draft.question.type).toBe('single');
    expect(draft.question.text.startsWith('Хто це? Як ___ заблукав')).toBe(true);
    expect(source).toEqual({ groupId: 'g1', itemId: 'i-story' });
  });

  it('«Правда чи вигадка?» picks what is fewer, suggests a swap and will not insert an unchanged «ні»', async () => {
    const { onPick } = open({ types: questionTypesFor('classic'), booleans: { yes: 2, no: 0 } });
    fireEvent.click(await record(/^Перша поїздка/));
    fireEvent.click(template('Правда чи вигадка?'));
    expect(screen.getByText('У раунді: «так» — 2, «ні» — 0')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Вигадка' }).getAttribute('aria-checked')).toBe('true');
    const field = screen.getByLabelText('Текст вигадки') as HTMLTextAreaElement;
    expect(field.value).not.toBe(date.text);
    expect(field.value).toMatch(/^Перша поїздка на море всією родиною у \d{4} році$/);
    expect(screen.getByText(/^Підмінено: 2004 → \d{4}\. Перевір, чи звучить природно\.$/)).toBeTruthy();

    fireEvent.change(field, { target: { value: date.text } });
    const insert = screen.getByRole('button', { name: 'Вставити запитання' }) as HTMLButtonElement;
    expect(insert.disabled).toBe(true);
    expect(screen.getByText('Текст ще такий самий, як у записі, — зміни деталь.')).toBeTruthy();

    fireEvent.change(field, { target: { value: 'Перша поїздка в гори всією родиною у 2004 році' } });
    expect(insert.disabled).toBe(false);
    fireEvent.click(insert);
    const [draft] = onPick.mock.calls[0]!;
    expect(draft.question).toMatchObject({ type: 'boolean', correct: false, text: 'Правда чи вигадка? Перша поїздка в гори всією родиною у 2004 році' });
  });

  it('with fewer «так» in the round it starts at «Правда»', async () => {
    open({ types: questionTypesFor('classic'), booleans: { yes: 0, no: 1 } });
    fireEvent.click(await record(/^Перша поїздка/));
    fireEvent.click(template('Правда чи вигадка?'));
    expect(screen.getByRole('radio', { name: 'Правда' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByLabelText('Текст вигадки')).toBeNull();
  });

  it('Escape and ✕ close; the heading takes the focus', async () => {
    const { onClose } = open();
    const heading = await screen.findByRole('heading', { name: 'Запитання з групи' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Закрити' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('Escape with the help open closes only the help; closing returns the focus to the opener', async () => {
    const onClose = vi.fn();
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <MemoryRouter>
          <button type="button" onClick={() => setOpen(true)}>
            Із групи
          </button>
          {open && (
            <GroupPicker
              target={classic}
              onPick={vi.fn()}
              onClose={() => {
                onClose();
                setOpen(false);
              }}
              rng={seededRng(3)}
              year={2026}
            />
          )}
        </MemoryRouter>
      );
    }
    render(<Host />);
    const opener = screen.getByRole('button', { name: 'Із групи' });
    opener.focus();
    fireEvent.click(opener);
    await screen.findByRole('dialog', { name: 'Запитання з групи' });
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Запитання з групи' })).getByRole('button', { name: /^Довідка/ }));
    expect(document.querySelector('.help-pop')).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector('.help-pop')).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: 'Запитання з групи' })).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('a failed request says so', async () => {
    vi.mocked(getGroupItems).mockResolvedValue({ ok: false, error: 'offline' });
    open();
    expect((await screen.findByRole('alert')).textContent).not.toBe('');
  });
});
