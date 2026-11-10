// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { layoutCrossword, pickKeyCells, type Question } from '@quiz/shared';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n';
import { newQuestion } from './draft';
import { CrosswordEditor } from './CrosswordEditor';

type Crossword = Extract<Question, { type: 'crossword' }>;

afterEach(cleanup);

const WORDS = [
  ['калина', 'Червона ягода, символ України'],
  ['лелека', 'Птах, що приносить весну'],
  ['вишня', 'Дерево в садку біля хати'],
  ['сонях', 'Жовта квітка, що дивиться на сонце'],
];

function Harness({ initial, spy }: { initial: Crossword; spy: (q: Crossword) => void }) {
  const [question, setQuestion] = useState(initial);
  return (
    <CrosswordEditor
      question={question}
      onChange={(next) => {
        spy(next as Crossword);
        setQuestion(next as Crossword);
      }}
    />
  );
}

const view = (initial: Crossword = newQuestion('crossword') as Crossword) => {
  const spy = vi.fn<(q: Crossword) => void>();
  const rendered = render(<Harness initial={initial} spy={spy} />);
  return { ...rendered, last: () => spy.mock.calls.at(-1)![0] };
};
const row = (index: number) => within(screen.getByRole('group', { name: t('crosswordWordN', { index }) }));
const type = (words: string[][]) =>
  words.forEach(([answer, clue], i) => {
    fireEvent.change(row(i + 1).getByLabelText(t('crosswordAnswer')), { target: { value: answer } });
    fireEvent.change(row(i + 1).getByLabelText(t('crosswordClue')), { target: { value: clue } });
  });
const preview = () => screen.getByRole('table', { name: t('crosswordPreview') });

describe('CrosswordEditor', () => {
  it('lays out the words as you type', () => {
    const { last } = view();
    expect(screen.queryByRole('table', { name: t('crosswordPreview') })).toBeNull();
    type(WORDS);
    const entries = last().entries;
    const expected = layoutCrossword(entries);
    expect(expected.ok).toBe(true);
    if (!expected.ok) return;
    expect(last().layout).toEqual(expected.layout);
    // Прев'ю: розмір сітки, номери 1–4, літери слів і підказки по напрямках.
    const grid = preview();
    expect(grid.querySelectorAll('tr')).toHaveLength(expected.layout.height);
    expect([...grid.querySelectorAll('.crossword-number')].map((n) => n.textContent)).toEqual(['1', '2', '3', '4']);
    expect(grid.querySelectorAll('.crossword-cell.is-letter')).toHaveLength(6 + 6 + 5 + 5 - 3);
    expect(grid.textContent).toContain('л');
    const across = within(screen.getByRole('list', { name: t('crosswordAcross') }));
    const down = within(screen.getByRole('list', { name: t('crosswordDown') }));
    expect(across.getByText(/Птах, що приносить весну/)).toBeTruthy();
    expect(down.getByText(/Червона ягода/)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('warns about words that do not cross', () => {
    const { last } = view();
    type([...WORDS.slice(0, 3), ['дуб', 'Могутнє дерево']]);
    expect(last().layout).toBeNull();
    expect(screen.getByRole('status').textContent).toBe(t('crosswordUnplaced', { words: 'дуб' }));
    // Не українське слово — інше попередження.
    fireEvent.change(row(4).getByLabelText(t('crosswordAnswer')), { target: { value: 'oak' } });
    expect(screen.getByRole('status').textContent).toBe(t('crosswordBadWords', { words: 'oak', min: 2, max: 12 }));
  });

  it('shows missing key letters', () => {
    const { last } = view();
    type(WORDS);
    fireEvent.click(screen.getByRole('radio', { name: t('crosswordModeKey') }));
    expect(last()).toMatchObject({ mode: 'key', key: '' });
    fireEvent.change(screen.getByLabelText(t('crosswordKeyLabel')), { target: { value: 'фото' } });
    expect(last()).toMatchObject({ key: 'фото', layout: null });
    expect(screen.getByRole('status').textContent).toBe(t('crosswordMissing', { letters: 'ф, т, о' }));
    // Прев'ю лишається: слова складаються, бракує лише літер ключа.
    expect(preview()).toBeTruthy();
    // Назад до всього кросворду: ключ зникає, сітка знову зберігається.
    fireEvent.click(screen.getByRole('radio', { name: t('crosswordModeFull') }));
    expect(last().key).toBeNull();
    expect(last().layout?.keyCells).toEqual([]);
  });

  it('key cells are marked in the preview', () => {
    const { last } = view();
    type(WORDS);
    fireEvent.click(screen.getByRole('radio', { name: t('crosswordModeKey') }));
    fireEvent.change(screen.getByLabelText(t('crosswordKeyLabel')), { target: { value: 'калина' } });
    const layout = last().layout!;
    expect(layout.keyCells).toEqual(pickKeyCells(layout, last().entries, 'калина'));
    const marked = [...preview().querySelectorAll('.crossword-cell.is-key')];
    expect(marked).toHaveLength(6);
    expect(marked.map((cell) => cell.getAttribute('data-cell')).map(Number).sort((a, b) => a - b)).toEqual([...layout.keyCells].sort((a, b) => a - b));
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('adds, moves and removes words within 4–8', () => {
    const { last } = view();
    type(WORDS);
    const remove = (index: number) => row(index).getByRole('button', { name: t('removeCrosswordWord', { index }) });
    expect((remove(1) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: t('addCrosswordWord') }));
    expect(last().entries).toHaveLength(5);
    fireEvent.click(row(2).getByRole('button', { name: t('crosswordWordUp', { index: 2 }) }));
    expect(last().entries.map((e) => e.answer).slice(0, 2)).toEqual(['лелека', 'калина']);
    fireEvent.click(remove(5));
    expect(last().entries).toHaveLength(4);
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: t('addCrosswordWord') }));
    expect(last().entries).toHaveLength(8);
    expect((screen.getByRole('button', { name: t('addCrosswordWord') }) as HTMLButtonElement).disabled).toBe(true);
  });
});
