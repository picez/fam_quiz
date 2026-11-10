// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Question } from '@quiz/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n';
import { newQuestion } from './draft';
import { TimedListEditor } from './TimedListEditor';

type List = Extract<Question, { type: 'timedlist' }>;

afterEach(cleanup);

const list = (): List => newQuestion('timedlist') as List;
const named = (texts: string[]): List => ({ ...list(), items: texts.map((text, i) => ({ id: `l${i + 1}`, text, accepted: [] })) });
const last = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.calls.at(-1)?.[0] as List;
const view = (question: List, onChange = vi.fn()) => render(<TimedListEditor question={question} onChange={onChange} />);
const card = (index: number) => screen.getByRole('group', { name: t('listItemN', { index }) });

describe('TimedListEditor', () => {
  it('shows three item cards, the price, the hint and the minus switched off', () => {
    view(list());
    expect(screen.getAllByRole('group', { name: /^Пункт \d+$/ })).toHaveLength(3);
    expect((screen.getByLabelText(t('listPrice')) as HTMLInputElement).value).toBe('100');
    expect(screen.getByText(t('listHint'))).toBeTruthy();
    expect((screen.getByRole('checkbox', { name: t('listMinusOn') }) as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByLabelText(t('listMinus'))).toBeNull();
  });

  it('edits items, spellings, order, price and the minus', () => {
    const onChange = vi.fn();
    const { rerender } = view(named(['Меркурій', 'Венера', 'Земля']), onChange);

    // Додати пункт.
    fireEvent.click(screen.getByRole('button', { name: t('addListItem') }));
    expect(last(onChange).items).toHaveLength(4);
    expect(last(onChange).items[3]).toMatchObject({ text: '', accepted: [] });

    // Назва.
    fireEvent.change(within(card(2)).getByLabelText(t('listItemN', { index: 2 })), { target: { value: 'Венера!' } });
    expect(last(onChange).items[1].text).toBe('Венера!');
    expect(last(onChange).items[0].text).toBe('Меркурій');

    // Інше написання.
    fireEvent.click(within(card(1)).getByRole('button', { name: t('addSpelling') }));
    expect(last(onChange).items[0].accepted).toEqual(['']);
    expect(last(onChange).items[1].accepted).toEqual([]);

    // «Нижче» міняє номери клітинок.
    fireEvent.click(within(card(1)).getByRole('button', { name: t('listItemDown') }));
    expect(last(onChange).items.map((item) => item.text)).toEqual(['Венера', 'Меркурій', 'Земля']);
    fireEvent.click(within(card(3)).getByRole('button', { name: t('listItemUp') }));
    expect(last(onChange).items.map((item) => item.text)).toEqual(['Меркурій', 'Земля', 'Венера']);
    expect((within(card(1)).getByRole('button', { name: t('listItemUp') }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(card(3)).getByRole('button', { name: t('listItemDown') }) as HTMLButtonElement).disabled).toBe(true);

    // Ціна.
    fireEvent.change(screen.getByLabelText(t('listPrice')), { target: { value: '60' } });
    expect(last(onChange).points).toBe(60);

    // Мінус: прапорець ставить типове значення, поле його міняє, зняття повертає null.
    fireEvent.click(screen.getByRole('checkbox', { name: t('listMinusOn') }));
    expect(last(onChange).minus).toBe(50);
    rerender(<TimedListEditor question={{ ...named(['а', 'б', 'в']), minus: 50 }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(t('listMinus')), { target: { value: '25' } });
    expect(last(onChange).minus).toBe(25);
    fireEvent.click(screen.getByRole('checkbox', { name: t('listMinusOn') }));
    expect(last(onChange).minus).toBeNull();
  });

  it('removing an item is possible only above the minimum, and adding stops at the maximum', () => {
    const onChange = vi.fn();
    const { rerender } = view(named(['а', 'б', 'в', 'г']), onChange);
    fireEvent.click(screen.getByRole('button', { name: t('removeListItem', { index: 2 }) }));
    expect(last(onChange).items.map((item) => item.text)).toEqual(['а', 'в', 'г']);
    rerender(<TimedListEditor question={named(['а', 'б', 'в'])} onChange={onChange} />);
    for (const button of screen.getAllByRole('button', { name: /^Прибрати пункт \d+$/ })) expect((button as HTMLButtonElement).disabled).toBe(true);
    const many = named(Array.from({ length: 30 }, (_, i) => `п${i}`));
    rerender(<TimedListEditor question={many} onChange={onChange} />);
    expect((screen.getByRole('button', { name: t('addListItem') }) as HTMLButtonElement).disabled).toBe(true);
  });
});
