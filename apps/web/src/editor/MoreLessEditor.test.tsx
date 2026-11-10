// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Question } from '@quiz/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n';
import { newQuestion } from './draft';
import { MoreLessEditor } from './MoreLessEditor';

type More = Extract<Question, { type: 'moreless' }>;

afterEach(cleanup);

const named = (): More => {
  const base = newQuestion('moreless') as More;
  const rows = [
    ['Що вище?', 'Говерла', '2061 м', 'Ейфелева вежа', '330 м'],
    ['Що довше?', 'Рейн', '1233 км', 'Дунай', '2850 км'],
    ['Що глибше?', 'Світязь', '58 м', 'Синевир', '22 м'],
  ];
  return { ...base, pairs: base.pairs.map((p, i) => ({ ...p, id: `p${i + 1}`, prompt: rows[i][0], a: { text: rows[i][1], value: rows[i][2] }, b: { text: rows[i][3], value: rows[i][4] } })) };
};
const last = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.calls.at(-1)?.[0] as More;
const view = (question: More, onChange = vi.fn()) => render(<MoreLessEditor question={question} onChange={onChange} />);
const card = (index: number) => screen.getByRole('group', { name: t('morelessPairN', { index }) });

describe('MoreLessEditor', () => {
  it('shows a card per comparison with the prompt, both options with values, the right side and the points, and the total with the hint', () => {
    view(named());
    expect(screen.getAllByRole('group', { name: /^Порівняння \d+$/ })).toHaveLength(3);
    const first = within(card(1));
    expect((first.getByLabelText(t('morelessPrompt')) as HTMLInputElement).value).toBe('Що вище?');
    expect((first.getByLabelText(t('morelessOptionA')) as HTMLInputElement).value).toBe('Говерла');
    expect((first.getByLabelText(t('morelessOptionB')) as HTMLInputElement).value).toBe('Ейфелева вежа');
    expect(first.getAllByLabelText(t('morelessValue')).map((input) => (input as HTMLInputElement).value)).toEqual(['2061 м', '330 м']);
    expect(first.getAllByRole('radio', { name: t('morelessCorrect') }).map((radio) => (radio as HTMLInputElement).checked)).toEqual([true, false]);
    expect((first.getByLabelText(t('morelessPoints')) as HTMLInputElement).value).toBe('100');
    expect(screen.getByText(t('morelessTotal', { points: 300 }))).toBeTruthy();
    expect(screen.getByText(t('morelessHint'))).toBeTruthy();
  });

  it('adds, moves and removes comparisons, marks the right side and keeps the total', () => {
    const onChange = vi.fn();
    const { rerender } = view(named(), onChange);

    // Нове порівняння бере запитання й бали попереднього; сума росте: 300 → 400.
    fireEvent.click(screen.getByRole('button', { name: t('addMoreLessPair') }));
    expect(last(onChange).pairs).toHaveLength(4);
    expect(last(onChange).pairs[3]).toMatchObject({ prompt: 'Що глибше?', a: { text: '', value: '' }, b: { text: '', value: '' }, correct: 'a', points: 100 });
    expect(last(onChange).pairs[3].id).not.toBe('p3');
    expect(last(onChange).points).toBe(400);
    rerender(<MoreLessEditor question={last(onChange)} onChange={onChange} />);
    expect(screen.getByText(t('morelessTotal', { points: 400 }))).toBeTruthy();

    // Тексти й значення.
    fireEvent.change(within(card(2)).getByLabelText(t('morelessPrompt')), { target: { value: 'Що довшe?' } });
    expect(last(onChange).pairs[1].prompt).toBe('Що довшe?');
    fireEvent.change(within(card(2)).getByLabelText(t('morelessOptionB')), { target: { value: 'Дунай!' } });
    expect(last(onChange).pairs[1].b.text).toBe('Дунай!');
    fireEvent.change(within(card(2)).getAllByLabelText(t('morelessValue'))[0], { target: { value: '1233 км ' } });
    expect(last(onChange).pairs[1].a.value).toBe('1233 км ');

    // Правильний варіант.
    fireEvent.click(within(card(1)).getAllByRole('radio', { name: t('morelessCorrect') })[1]);
    expect(last(onChange).pairs[0].correct).toBe('b');
    expect(last(onChange).pairs[1].correct).toBe('a');

    // Бали одного порівняння міняють суму.
    fireEvent.change(within(card(2)).getByLabelText(t('morelessPoints')), { target: { value: '150' } });
    expect(last(onChange).pairs[1].points).toBe(150);
    expect(last(onChange).points).toBe(450);

    // «Однакові бали всім» бере бали першого.
    rerender(<MoreLessEditor question={last(onChange)} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: t('morelessSameAll') }));
    expect(last(onChange).pairs.map((p) => p.points)).toEqual([100, 100, 100, 100]);
    expect(last(onChange).points).toBe(400);

    // Місця.
    rerender(<MoreLessEditor question={named()} onChange={onChange} />);
    fireEvent.click(within(card(1)).getByRole('button', { name: t('moreLessPairDown') }));
    expect(last(onChange).pairs.map((p) => p.id)).toEqual(['p2', 'p1', 'p3']);
    fireEvent.click(within(card(3)).getByRole('button', { name: t('moreLessPairUp') }));
    expect(last(onChange).pairs.map((p) => p.id)).toEqual(['p1', 'p3', 'p2']);
    expect((within(card(1)).getByRole('button', { name: t('moreLessPairUp') }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(card(3)).getByRole('button', { name: t('moreLessPairDown') }) as HTMLButtonElement).disabled).toBe(true);

    // Прибрати.
    fireEvent.click(within(card(2)).getByRole('button', { name: t('removeMoreLessPair', { index: 2 }) }));
    expect(last(onChange).pairs.map((p) => p.id)).toEqual(['p1', 'p3']);
    expect(last(onChange).points).toBe(200);
  });

  it('keeps between 2 and 20 comparisons', () => {
    const two: More = { ...named(), pairs: named().pairs.slice(0, 2) };
    const { rerender } = view(two);
    for (const button of screen.getAllByRole('button', { name: /^Прибрати порівняння/ })) expect((button as HTMLButtonElement).disabled).toBe(true);
    const base = named().pairs[0];
    const many: More = { ...named(), pairs: Array.from({ length: 20 }, (_, i) => ({ ...base, id: `x${i}` })) };
    rerender(<MoreLessEditor question={many} onChange={vi.fn()} />);
    expect((screen.getByRole('button', { name: t('addMoreLessPair') }) as HTMLButtonElement).disabled).toBe(true);
  });
});
