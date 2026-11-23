// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Combobox, type ComboOption } from './Combobox';

afterEach(cleanup);

const groups = [
  { id: 'a', label: 'Вибір' },
  { id: 'b', label: 'Ігри' },
  { id: 'c', label: 'Медіа' },
];
const options: ComboOption<string>[] = [
  { value: 'single', label: 'Один варіант', description: 'Обери одну відповідь', group: 'a' },
  { value: 'multi', label: 'Кілька варіантів', description: 'Декілька правильних', group: 'a' },
  { value: 'boolean', label: 'Так чи ні', description: 'Правда чи ні', group: 'a', keywords: ['так чи ні'] },
  { value: 'memory', label: 'Пам’ять', description: 'Запам’ятай картки', group: 'b' },
  { value: 'pin', label: 'Точка на карті', description: 'Познач місце', group: 'b' },
  { value: 'melody', label: 'Мелодія', description: 'Вгадай пісню', group: 'c' },
  { value: 'round2', label: 'Раунд 2', description: 'Другий', group: 'c', note: 'є помилка' },
];

function setup(value = 'single', onChange = vi.fn()) {
  render(<Combobox label="Тип" value={value} options={options} groups={groups} onChange={onChange} />);
  return onChange;
}
const trigger = () => screen.getByRole('button', { name: /^Тип:/ });

describe('Combobox', () => {
  it('shows the chosen value on a button named after the label', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Тип: Один варіант' }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('opens a grouped list with the search focused and the chosen option active', () => {
    setup('multi');
    fireEvent.click(trigger());
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(screen.getAllByRole('group')).toHaveLength(3);
    expect(screen.getByRole('group', { name: 'Вибір' })).toBeTruthy();
    const search = screen.getByRole('combobox');
    expect(document.activeElement).toBe(search);
    const chosen = screen.getByRole('option', { name: 'Кілька варіантів' });
    expect(search.getAttribute('aria-activedescendant')).toBe(chosen.id);
    expect(chosen.getAttribute('aria-selected')).toBe('true');
  });

  it('filters by label, description and keywords, ignoring case and apostrophe kinds', () => {
    setup();
    fireEvent.click(trigger());
    const search = screen.getByRole('combobox');
    fireEvent.change(search, { target: { value: 'ТАК ЧИ' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    fireEvent.change(search, { target: { value: "пам'ять" } });
    expect(screen.getAllByRole('option').map((o) => o.getAttribute('data-value'))).toEqual(['memory']);
    expect(screen.getAllByRole('group')).toHaveLength(1);
    fireEvent.change(search, { target: { value: 'картк' } });
    expect(screen.getAllByRole('option').map((o) => o.getAttribute('data-value'))).toEqual(['memory']);
    fireEvent.change(search, { target: { value: 'zzzz' } });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('Нічого не знайдено. Спробуй інше слово.')).toBeTruthy();
  });

  it('moves with arrows, Home and End and picks with Enter', () => {
    const onChange = setup();
    fireEvent.click(trigger());
    const search = screen.getByRole('combobox');
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('boolean');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(trigger());

    fireEvent.click(trigger());
    const s2 = screen.getByRole('combobox');
    fireEvent.keyDown(s2, { key: 'End' });
    fireEvent.keyDown(s2, { key: 'Home' });
    fireEvent.keyDown(s2, { key: 'End' });
    fireEvent.keyDown(s2, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('round2');

    fireEvent.click(trigger());
    const s3 = screen.getByRole('combobox');
    fireEvent.change(s3, { target: { value: 'мел' } });
    fireEvent.keyDown(s3, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('melody');
  });

  it('closes on Escape and on a click outside and returns the focus', () => {
    const onChange = setup();
    fireEvent.click(trigger());
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger());

    fireEvent.click(trigger());
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('picks with a click and does not call onChange for the same value', () => {
    const onChange = setup();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('option', { name: 'Пам’ять' }));
    expect(onChange).toHaveBeenCalledWith('memory');
    expect(screen.queryByRole('listbox')).toBeNull();
    onChange.mockClear();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('option', { name: 'Один варіант' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('describes each option and keeps the note in its name', () => {
    setup();
    fireEvent.click(trigger());
    const option = screen.getByRole('option', { name: 'Раунд 2, є помилка' });
    const id = option.getAttribute('aria-describedby');
    expect(id).toBeTruthy();
    expect(document.getElementById(id as string)?.textContent).toBe('Другий');
    expect(within(option).getByText('Раунд 2')).toBeTruthy();
  });
});
