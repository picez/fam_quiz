// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type Question } from '@quiz/shared';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n';
import { newQuestion, type MemoryQuestion } from './draft';
import { MemoryEditor } from './MemoryEditor';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function Harness({ initial, spy }: { initial: MemoryQuestion; spy: (q: MemoryQuestion) => void }) {
  const [question, setQuestion] = useState(initial);
  return (
    <MemoryEditor
      question={question}
      onChange={(next: Question) => {
        spy(next as MemoryQuestion);
        setQuestion(next as MemoryQuestion);
      }}
    />
  );
}

const view = (patch: Partial<MemoryQuestion> = {}) => {
  const spy = vi.fn<(q: MemoryQuestion) => void>();
  const base = newQuestion('memory') as MemoryQuestion;
  render(<Harness initial={{ ...base, ...patch }} spy={spy} />);
  return { last: () => spy.mock.calls.at(-1)![0], calls: spy.mock.calls };
};
const gridButton = (cols: number, rows: number, pairs: number) => screen.getByRole('button', { name: t('memoryGrid', { cols, rows, pairs }) });
const pairCount = () => screen.getAllByRole('group', { name: /./ }).filter((group) => group.className.includes('memory-pair')).length;

describe('MemoryEditor', () => {
  it('the grid buttons resize the pairs', () => {
    const { last } = view();
    expect(pairCount()).toBe(6);
    fireEvent.change(screen.getByLabelText(`${t('memoryPairLabel', { n: 1 })}: ${t('memoryTextPlaceholderA')}`), { target: { value: 'Україна' } });
    fireEvent.click(gridButton(4, 5, 10));
    expect(last().grid).toBe('4x5');
    expect(last().pairs).toHaveLength(10);
    expect(pairCount()).toBe(10);
    fireEvent.click(gridButton(3, 4, 6));
    expect(last().grid).toBe('3x4');
    expect(last().pairs).toHaveLength(6);
    expect(last().pairs[0]!.a.text).toBe('Україна');
    expect(gridButton(3, 4, 6).getAttribute('aria-pressed')).toBe('true');
  });

  it('a half switches between text and picture', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ url: '/uploads/aaaaaaaaaaaaaaaaaaaa.png' }), { status: 201 })));
    const { last } = view();
    const halfB = (n: number) => `${t('memoryPairLabel', { n })}: ${t('memoryTextPlaceholderB')}`;
    fireEvent.change(screen.getByLabelText(halfB(1)), { target: { value: 'Київ' } });
    fireEvent.click(screen.getAllByRole('button', { name: t('memoryHalfImage') })[1]!);
    // Перемикач сам нічого не вантажить; текст зник.
    expect(last().pairs[0]!.b).toEqual({ text: '' });
    expect(screen.queryByLabelText(halfB(1))).toBeNull();
    const input = screen.getByLabelText(`${t('memoryPairLabel', { n: 1 })}: ${t('memoryTextPlaceholderB')} · ${t('memoryHalfImage')}`) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    await waitFor(() => expect(last().pairs[0]!.b).toEqual({ text: '', imageUrl: '/uploads/aaaaaaaaaaaaaaaaaaaa.png' }));
    fireEvent.click(screen.getAllByRole('button', { name: t('memoryHalfText') })[1]!);
    expect(last().pairs[0]!.b).toEqual({ text: '' });
    expect(last().pairs[0]!.b).not.toHaveProperty('imageUrl');
    expect(screen.getByLabelText(halfB(1))).toBeTruthy();
  });

  it('a new empty pair after a resize opens in text mode', () => {
    view();
    fireEvent.click(gridButton(4, 5, 10));
    // Пара 7: друга половина-картинка (кнопки йдуть парами a, b).
    fireEvent.click(screen.getAllByRole('button', { name: t('memoryHalfImage') })[12]!);
    expect(screen.queryByLabelText(`${t('memoryPairLabel', { n: 7 })}: ${t('memoryTextPlaceholderA')}`)).toBeNull();
    fireEvent.click(gridButton(3, 4, 6));
    fireEvent.click(gridButton(4, 5, 10));
    expect(screen.getByLabelText(`${t('memoryPairLabel', { n: 7 })}: ${t('memoryTextPlaceholderA')}`)).toBeTruthy();
  });

  it('a pair kept by a resize keeps its picture mode', () => {
    view();
    fireEvent.click(screen.getAllByRole('button', { name: t('memoryHalfImage') })[0]!);
    fireEvent.click(gridButton(4, 5, 10));
    expect(screen.queryByLabelText(`${t('memoryPairLabel', { n: 1 })}: ${t('memoryTextPlaceholderA')}`)).toBeNull();
  });

  it('text is cut at forty', () => {
    view();
    const field = screen.getByLabelText(`${t('memoryPairLabel', { n: 2 })}: ${t('memoryTextPlaceholderA')}`) as HTMLInputElement;
    expect(field.maxLength).toBe(40);
  });

  it('shuffle gives a new seed', () => {
    const pairs = (newQuestion('memory') as MemoryQuestion).pairs.map((pair, i) => ({ ...pair, a: { text: `Q${i}` } }));
    const { last } = view({ seed: 123, pairs });
    fireEvent.click(screen.getByRole('button', { name: t('memoryShuffle') }));
    expect(last().seed).not.toBe(123);
    expect(last().pairs).toEqual(pairs);
  });

  it('the timer floor is 25', () => {
    const { last, calls } = view();
    const field = screen.getByRole('textbox', { name: t('timeLimit') });
    fireEvent.change(field, { target: { value: '24' } });
    expect(calls).toHaveLength(0);
    fireEvent.change(field, { target: { value: '25' } });
    expect(last().timeLimit).toBe(25);
  });
});
