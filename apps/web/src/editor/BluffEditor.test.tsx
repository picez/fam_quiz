// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Question } from '@quiz/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n';
import { newQuestion } from './draft';
import { BluffEditor } from './BluffEditor';

type Bluff = Extract<Question, { type: 'bluff' }>;

afterEach(cleanup);

const bluff = (patch: Partial<Bluff> = {}): Bluff => ({ ...(newQuestion('bluff') as Bluff), ...patch });
const last = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.calls.at(-1)?.[0] as Bluff;

describe('BluffEditor', () => {
  it('shows the hints, the truth, two spare lies and the choice time', () => {
    render(<BluffEditor question={bluff()} onChange={vi.fn()} />);
    screen.getByText(t('bluffFactHint'));
    screen.getByText(t('bluffTruthHint'));
    screen.getByText(t('bluffSpareHint'));
    screen.getByText(t('bluffPointsHint'));
    expect((screen.getByLabelText('Правда') as HTMLInputElement).maxLength).toBe(60);
    expect(screen.getAllByLabelText(/^Запасна вигадка \d$/)).toHaveLength(2);
    expect((screen.getByLabelText('Час на вибір, с') as HTMLInputElement).value).toBe('30');
  });

  it('the truth field edits accepted[0]; other spellings edit accepted[1]', () => {
    const onChange = vi.fn();
    const { rerender } = render(<BluffEditor question={bluff()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Правда'), { target: { value: 'Барселона' } });
    expect(last(onChange).accepted).toEqual(['Барселона']);
    rerender(<BluffEditor question={bluff({ accepted: ['Барселона'] })} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: t('addSpelling') }));
    expect(last(onChange).accepted).toEqual(['Барселона', '']);
    rerender(<BluffEditor question={bluff({ accepted: ['Барселона', ''] })} onChange={onChange} />);
    fireEvent.change(within(screen.getByRole('group', { name: t('bluffOtherSpellings') })).getByLabelText('Написання 1'), { target: { value: 'Барса' } });
    expect(last(onChange).accepted).toEqual(['Барселона', 'Барса']);
  });

  it('adds spare lies up to three, then no button; removing is only possible with three', () => {
    const onChange = vi.fn();
    const { rerender } = render(<BluffEditor question={bluff()} onChange={onChange} />);
    expect(screen.queryByRole('button', { name: /^Прибрати запасну вигадку/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '＋ Вигадка' }));
    expect(last(onChange).lies).toEqual(['', '', '']);
    rerender(<BluffEditor question={bluff({ lies: ['а', 'б', 'в'] })} onChange={onChange} />);
    expect(screen.queryByRole('button', { name: '＋ Вигадка' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Прибрати запасну вигадку 2' }));
    expect(last(onChange).lies).toEqual(['а', 'в']);
  });

  it('a spare lie edits its slot', () => {
    const onChange = vi.fn();
    render(<BluffEditor question={bluff()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Запасна вигадка 2'), { target: { value: 'Лондон' } });
    expect(last(onChange).lies).toEqual(['', 'Лондон']);
  });

  it('the choice time edits choiceTime', () => {
    const onChange = vi.fn();
    render(<BluffEditor question={bluff()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Час на вибір, с'), { target: { value: '45' } });
    expect(last(onChange).choiceTime).toBe(45);
  });
});
