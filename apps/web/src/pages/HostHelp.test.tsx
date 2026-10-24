// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HELP_TOPICS, helpAnchor, helpIds } from '../help/host-help';
import { HostHelp } from './HostHelp';

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <HostHelp />
    </MemoryRouter>,
  );

function Jump() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/help#help-buff-shield')}>
      jump
    </button>
  );
}

describe('HostHelp', () => {
  it('groups every entry by topic in order; teams stay hidden while empty', () => {
    renderAt('/help');
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Раунди', 'Типи запитань', 'Клітинки поля', 'Бафи', 'Дебафи', 'Налаштування']);
    for (const id of HELP_TOPICS.flatMap(helpIds)) expect(document.getElementById(helpAnchor(id))).not.toBeNull();
    const swap = document.getElementById('help-buff-swap')!;
    within(swap).getByRole('heading', { level: 3, name: /Заміна запитання/ });
    within(swap).getByRole('heading', { level: 4, name: 'Як іде в грі' });
  });

  it('searches by name and says when nothing is found', () => {
    renderAt('/help');
    fireEvent.change(screen.getByLabelText('Пошук за назвою'), { target: { value: 'щит' } });
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent?.trim())).toEqual(['🛡 Щит']);
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Бафи']);
    fireEvent.change(screen.getByLabelText('Пошук за назвою'), { target: { value: 'зззз' } });
    expect(screen.getByText('Нічого не знайдено.').getAttribute('role')).toBe('status');
    expect(screen.queryAllByRole('heading', { level: 2 })).toEqual([]);
  });

  it('an anchor highlights and scrolls to its entry', () => {
    renderAt('/help#help-cell-marks');
    const marks = document.getElementById('help-cell-marks')!;
    expect(marks.classList.contains('is-target')).toBe(true);
    expect(marks.scrollIntoView).toHaveBeenCalled();
  });

  it('a new anchor after mount clears the search and highlights its entry', () => {
    render(
      <MemoryRouter initialEntries={['/help']}>
        <Jump />
        <HostHelp />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText('Пошук за назвою'), { target: { value: 'зззз' } });
    expect(document.getElementById('help-buff-shield')).toBeNull();
    fireEvent.click(screen.getByText('jump'));
    const shield = document.getElementById('help-buff-shield')!;
    expect((screen.getByLabelText('Пошук за назвою') as HTMLInputElement).value).toBe('');
    expect(shield.classList.contains('is-target')).toBe(true);
    expect(shield.scrollIntoView).toHaveBeenCalled();
  });
});
