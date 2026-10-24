// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HelpButton } from './HelpButton';

afterEach(cleanup);

describe('HelpButton', () => {
  it('opens a non-modal dialog with the sections of the entry and a link to the reference', () => {
    render(<HelpButton id="buff.shield" />);
    fireEvent.click(screen.getByRole('button', { name: 'Довідка: Щит' }));
    const dialog = screen.getByRole('dialog', { name: 'Щит' });
    expect(dialog.getAttribute('aria-modal')).toBe('false');
    for (const heading of ['Що це', 'Як іде в грі', 'Бали', 'Порада', 'Обмеження']) within(dialog).getByRole('heading', { name: heading });
    within(dialog).getByText('Помилка не знімає балів.');
    const link = within(dialog).getByRole('link', { name: 'Усі пояснення' });
    expect(link.getAttribute('href')).toBe('/help#help-buff-shield');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('an entry without limits has no «Обмеження»', () => {
    render(<HelpButton id="question.boolean" />);
    fireEvent.click(screen.getByRole('button', { name: 'Довідка: Так чи ні' }));
    expect(within(screen.getByRole('dialog')).queryByRole('heading', { name: 'Обмеження' })).toBeNull();
  });

  it('Escape and «Закрити» close it and return the focus to ⓘ', () => {
    render(<HelpButton id="round.board" />);
    const button = screen.getByRole('button', { name: 'Довідка: Ігрове поле' });
    fireEvent.click(button);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('button', { name: 'Закрити' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('a tap outside closes it and still reaches what was tapped', () => {
    const onClick = vi.fn();
    render(
      <>
        <HelpButton id="round.board" />
        <button type="button" onClick={onClick}>
          Далі
        </button>
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Довідка: Ігрове поле' }));
    const next = screen.getByRole('button', { name: 'Далі' });
    fireEvent.pointerDown(next);
    fireEvent.click(next);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('only one dialog is open at a time', () => {
    render(
      <>
        <HelpButton id="round.final" />
        <HelpButton id="buff.swap" />
      </>,
    );
    fireEvent.click(screen.getAllByRole('button', { name: /^Довідка:/ })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: /^Довідка:/ })[1]);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    screen.getByRole('dialog', { name: 'Заміна запитання' });
  });

  it('inside a label it does not toggle the checkbox', () => {
    render(
      <label>
        <input type="checkbox" /> Щось <HelpButton id="setting.streak" />
      </label>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Довідка: Серії' }));
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    screen.getByRole('dialog', { name: 'Серії' });
  });
});
