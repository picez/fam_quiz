// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroupDetail, GroupItem, Quiz } from '@quiz/shared';
import { newQuiz } from '../editor/draft';
import { saveDraft } from '../editor/draft-storage';
import { GroupQuizBar } from './GroupQuizBar';

const at = '2026-11-14T10:00:00.000Z';
const group: GroupDetail = {
  id: 'g1',
  name: 'Родина Квіткових',
  emoji: '🌻',
  description: '',
  role: 'owner',
  people: 2,
  items: 3,
  joinedAt: at,
  members: [
    { id: 'u1', nickname: 'Оля', avatar: null, role: 'owner', joinedAt: at, you: true },
    { id: 'u2', nickname: 'Петро', avatar: null, role: 'member', joinedAt: at, you: false },
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
const items = [
  item('i1', { kind: 'story', text: 'Як тато заблукав у лісі по гриби', about: [{ kind: 'name', name: 'тато' }], answer: 'Тато', year: 1998 }),
  item('i2', { text: 'Бабуся Ніна свистить двома пальцями голосніше за всіх', about: [{ kind: 'name', name: 'бабуся Ніна' }] }),
  item('i3', { kind: 'date', text: 'Перша поїздка на море всією родиною у 2004 році', answer: 'Затока', year: 2004 }),
];

function open(picked: GroupItem[] = items) {
  const onCancel = vi.fn();
  render(
    <MemoryRouter initialEntries={['/profile/groups/g1']}>
      <Routes>
        <Route path="/profile/groups/g1" element={<GroupQuizBar group={group} items={items} picked={picked} onCancel={onCancel} />} />
        <Route path="/quizzes/new" element={<p>редактор</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return { onCancel };
}

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('GroupQuizBar (12l)', () => {
  it('says which records fall back to «Правда чи вигадка?» for one template', () => {
    open();
    expect(screen.queryByText(/Без потрібних полів/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Шаблон'), { target: { value: 'when' } });
    expect(screen.getByText('Без потрібних полів: 1 — стануть «Правда чи вигадка?»')).toBeTruthy();
  });

  it('makes a one-round draft and opens the editor', () => {
    open();
    fireEvent.change(screen.getByLabelText('Шаблон'), { target: { value: 'when' } });
    fireEvent.click(screen.getByRole('button', { name: 'Скласти вікторину · 3' }));
    expect(screen.getByText('редактор')).toBeTruthy();
    const quiz = JSON.parse(sessionStorage.getItem('quiz:draft:new')!) as Quiz;
    expect(quiz.title).toBe('Вікторина: Родина Квіткових');
    const round = quiz.rounds[0]!;
    if (round.type !== 'classic') throw new Error(round.type);
    expect(round.questions.map((q) => q.type)).toEqual(['slider', 'boolean', 'slider']);
    const drafts = JSON.parse(sessionStorage.getItem('quiz:groupdraft:new')!);
    expect(drafts.fresh).toBe(true);
    expect(Object.values(drafts.entries).map((entry) => (entry as { groupId: string; itemId: string }).itemId)).toEqual(['i1', 'i2', 'i3']);
    expect(Object.values(drafts.entries).every((entry) => (entry as { groupId: string }).groupId === 'g1')).toBe(true);
  });

  it('asks before replacing an unsaved new quiz; a refusal changes nothing', () => {
    const mine = { ...newQuiz(), title: 'Моя чернетка' };
    saveDraft(undefined, mine);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Скласти вікторину · 3' }));
    expect(confirm).toHaveBeenCalledWith('У тебе є незбережена нова вікторина. Замінити її цією?');
    expect(screen.queryByText('редактор')).toBeNull();
    expect((JSON.parse(sessionStorage.getItem('quiz:draft:new')!) as Quiz).title).toBe('Моя чернетка');
    expect(sessionStorage.getItem('quiz:groupdraft:new')).toBeNull();
  });

  it('nothing picked — the button is off; «Скасувати» leaves the mode', () => {
    const { onCancel } = open([]);
    expect((screen.getByRole('button', { name: 'Скласти вікторину · 0' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Скасувати' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('more than 100 records is too many', () => {
    open(Array.from({ length: 101 }, (_, i) => item(`x${i}`, { text: `Родинна дрібниця №${i + 1}` })));
    expect((screen.getByRole('button', { name: 'Скласти вікторину · 101' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Щонайбільше 100 записів')).toBeTruthy();
  });
});
