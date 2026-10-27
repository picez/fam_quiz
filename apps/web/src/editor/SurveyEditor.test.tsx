// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Question } from '@quiz/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n';
import { newQuestion } from './draft';
import { SurveyEditor } from './SurveyEditor';

type Survey = Extract<Question, { type: 'survey' }>;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const survey = (): Survey => newQuestion('survey') as Survey;
const withPopularity = (question: Survey, values: number[]): Survey => ({
  ...question,
  rows: question.rows.map((row, i) => ({ ...row, text: `Відповідь ${i + 1}`, popularity: values[i] ?? 0 })),
});
const last = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.calls.at(-1)?.[0] as Survey;
const clouds = [
  { n: 1, id: 'c1', text: 'Фрукти' },
  { n: 2, id: 'c2', text: 'Міста' },
];
const view = (question: Survey, onChange = vi.fn(), options: { clouds?: typeof clouds; allowCloud?: boolean } = {}) =>
  render(<SurveyEditor question={question} onChange={onChange} clouds={options.clouds ?? []} allowCloud={options.allowCloud ?? true} />);
const card = (n: number) => screen.getByRole('group', { name: t('surveyRowCard', { n }) });

describe('SurveyEditor', () => {
  it('shows five row cards, the answers field at 3 and the points hint', () => {
    view(survey());
    expect(screen.getAllByRole('group', { name: /^Рядок \d$/ })).toHaveLength(5);
    expect((screen.getByLabelText('Відповідей від гравця') as HTMLInputElement).value).toBe('3');
    expect(screen.getByText(t('surveyPointsHint'))).toBeTruthy();
    expect(screen.getByRole('button', { name: t('surveySourceHost') }).getAttribute('aria-pressed')).toBe('true');
  });

  it('changing an answer or the popularity calls onChange with that row only', () => {
    const onChange = vi.fn();
    const question = survey();
    view(question, onChange);
    fireEvent.change(within(card(1)).getByLabelText('Відповідь 1'), { target: { value: 'Яблуко' } });
    expect(last(onChange).rows[0]).toMatchObject({ text: 'Яблуко', popularity: 0 });
    expect(last(onChange).rows[1]).toEqual(question.rows[1]);
    fireEvent.change(within(card(2)).getByLabelText('Людей зі 100'), { target: { value: '32' } });
    expect(last(onChange).rows[1].popularity).toBe(32);
    fireEvent.change(within(card(2)).getByLabelText('Людей зі 100'), { target: { value: '' } });
    expect(last(onChange).rows[1].popularity).toBe(0);
  });

  it('a blank row shows an empty popularity field, not zero', () => {
    view(survey());
    expect((within(card(1)).getByLabelText('Людей зі 100') as HTMLInputElement).value).toBe('');
  });

  it('shows the running total and warns above 100', () => {
    const { rerender } = view(withPopularity(survey(), [30, 25, 15, 10, 10]));
    expect(screen.getByText('Разом: 90 зі 100')).toBeTruthy();
    expect(screen.queryByText(t('surveyTotalOver'), { exact: false })).toBeNull();
    rerender(<SurveyEditor question={withPopularity(survey(), [40, 30, 20, 10, 10])} onChange={vi.fn()} clouds={[]} allowCloud />);
    const total = screen.getByText(/^Разом: 110 зі 100/);
    expect(total.textContent).toContain(t('surveyTotalOver'));
    expect(total.className).toContain('is-over');
  });

  it('the multiple checkbox sets multiple: true and unchecking removes the field', () => {
    const onChange = vi.fn();
    const question = withPopularity(survey(), [40, 30, 20, 10, 10]);
    const { rerender } = view(question, onChange);
    const box = screen.getByRole('checkbox', { name: t('surveyMultiple') }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(last(onChange).multiple).toBe(true);
    const many = { ...question, multiple: true };
    rerender(<SurveyEditor question={many} onChange={onChange} clouds={[]} allowCloud />);
    expect((screen.getByRole('checkbox', { name: t('surveyMultiple') }) as HTMLInputElement).checked).toBe(true);
    const total = screen.getByText(t('surveyTotalMultiple', { total: 110 }));
    expect(total.textContent).not.toContain(t('surveyTotalOver'));
    expect(total.className).not.toContain('is-over');
    fireEvent.click(screen.getByRole('checkbox', { name: t('surveyMultiple') }));
    expect('multiple' in last(onChange)).toBe(false);
  });

  it('adds rows up to eight and then the button is disabled', () => {
    const onChange = vi.fn();
    const { rerender } = view(survey(), onChange);
    fireEvent.click(screen.getByRole('button', { name: '＋ Рядок' }));
    const next = last(onChange);
    expect(next.rows).toHaveLength(6);
    expect(next.rows[5]).toMatchObject({ text: '', popularity: 0, accepted: [] });
    const eight = { ...survey(), rows: [...survey().rows, ...survey().rows.slice(0, 3)] };
    rerender(<SurveyEditor question={eight} onChange={onChange} clouds={[]} allowCloud />);
    expect((screen.getByRole('button', { name: '＋ Рядок' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('removing a row is possible only from five rows', () => {
    const onChange = vi.fn();
    const { rerender } = view(survey(), onChange);
    fireEvent.click(screen.getByRole('button', { name: 'Прибрати рядок 2' }));
    expect(last(onChange).rows).toHaveLength(4);
    const four = { ...survey(), rows: survey().rows.slice(0, 4) };
    rerender(<SurveyEditor question={four} onChange={onChange} clouds={[]} allowCloud />);
    for (const button of screen.getAllByRole('button', { name: /^Прибрати рядок \d$/ })) expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('other spellings of a row are edited inside its card', () => {
    const onChange = vi.fn();
    view(survey(), onChange);
    fireEvent.click(within(card(1)).getByRole('button', { name: t('addSpelling') }));
    expect(last(onChange).rows[0].accepted).toEqual(['']);
    expect(last(onChange).rows[1].accepted).toEqual([]);
  });

  it('answers from a cloud are off without clouds, with the explanation', () => {
    view(survey());
    expect((screen.getByRole('button', { name: t('surveySourceCloud') }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(t('surveyNoClouds'))).toBeTruthy();
  });

  it('answers from a cloud are off on the board even with clouds', () => {
    view(survey(), vi.fn(), { clouds, allowCloud: false });
    expect((screen.getByRole('button', { name: t('surveySourceCloud') }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('choosing the cloud source picks the nearest cloud and hides the blank rows', () => {
    const onChange = vi.fn();
    view(survey(), onChange, { clouds });
    fireEvent.click(screen.getByRole('button', { name: t('surveySourceCloud') }));
    expect(last(onChange)).toMatchObject({ cloudId: 'c2', rows: [] });
  });

  it('text already written becomes spare rows when switching to a cloud', () => {
    const onChange = vi.fn();
    view(withPopularity(survey(), [30, 25, 15, 10, 10]), onChange, { clouds });
    fireEvent.click(screen.getByRole('button', { name: t('surveySourceCloud') }));
    expect(last(onChange).rows).toHaveLength(5);
  });

  it('with a cloud: the select, the hint, no rows and the skip hint', () => {
    const onChange = vi.fn();
    view({ ...survey(), rows: [], cloudId: 'c1' }, onChange, { clouds });
    expect(screen.getByRole('button', { name: t('surveySourceCloud') }).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByLabelText(t('surveyCloudSelect')) as HTMLSelectElement).value).toBe('c1');
    expect(screen.getByRole('option', { name: 'Хмара №1: «Фрукти»' })).toBeTruthy();
    expect(screen.getByText(t('surveyCloudHint'))).toBeTruthy();
    expect(screen.getByText('Якщо хмара не дасть жодного слова, запитання пропуститься.')).toBeTruthy();
    expect(screen.queryByRole('group', { name: /^Рядок \d$/ })).toBeNull();
    expect(screen.queryByText(/^Разом/)).toBeNull();
    fireEvent.change(screen.getByLabelText(t('surveyCloudSelect')), { target: { value: 'c2' } });
    expect(last(onChange).cloudId).toBe('c2');
  });

  it('a cloud that is no longer above is shown as unchosen, not as the first one', () => {
    view({ ...survey(), rows: [], cloudId: 'gone' }, vi.fn(), { clouds });
    expect((screen.getByLabelText(t('surveyCloudSelect')) as HTMLSelectElement).value).toBe('');
  });

  it('the spare switch gives four blank rows; switching off asks first if there is text', () => {
    const onChange = vi.fn();
    const { rerender } = view({ ...survey(), rows: [], cloudId: 'c1' }, onChange, { clouds });
    fireEvent.click(screen.getByRole('checkbox', { name: t('surveySpare') }));
    const on = last(onChange);
    expect(on.rows).toHaveLength(4);
    expect(on.rows.every((row) => row.text === '' && row.popularity === 0)).toBe(true);

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    onChange.mockClear();
    rerender(<SurveyEditor question={{ ...withPopularity(survey(), [30, 25, 15, 10]), rows: withPopularity(survey(), [30, 25, 15, 10]).rows.slice(0, 4), cloudId: 'c1' }} onChange={onChange} clouds={clouds} allowCloud />);
    expect((screen.getByRole('checkbox', { name: t('surveySpare') }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('Разом: 80 зі 100')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: t('surveySpare') }));
    expect(confirm).toHaveBeenCalledWith(t('surveySpareDropConfirm'));
    expect(onChange).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('checkbox', { name: t('surveySpare') }));
    expect(last(onChange).rows).toEqual([]);
  });

  it('switching off blank spares asks nothing', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onChange = vi.fn();
    view({ ...survey(), rows: survey().rows.slice(0, 4), cloudId: 'c1' }, onChange, { clouds });
    fireEvent.click(screen.getByRole('checkbox', { name: t('surveySpare') }));
    expect(confirm).not.toHaveBeenCalled();
    expect(last(onChange).rows).toEqual([]);
  });

  it('back to my answers drops the cloud and brings blank rows if there were none', () => {
    const onChange = vi.fn();
    view({ ...survey(), rows: [], cloudId: 'c1' }, onChange, { clouds });
    fireEvent.click(screen.getByRole('button', { name: t('surveySourceHost') }));
    const next = last(onChange);
    expect('cloudId' in next).toBe(false);
    expect(next.rows).toHaveLength(5);
  });

  it('the answers per player is a number field', () => {
    const onChange = vi.fn();
    view(survey(), onChange);
    fireEvent.change(screen.getByLabelText('Відповідей від гравця'), { target: { value: '5' } });
    expect(last(onChange).answers).toBe(5);
  });
});
