// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LeagueTitles } from './LeagueTitles';

afterEach(cleanup);

describe('LeagueTitles', () => {
  it('lists the titles with the group name and the month', () => {
    const { container } = render(<LeagueTitles titles={[{ group: 'Родина', month: '2026-10' }, { group: 'Друзі', month: '2026-09' }]} />);
    expect(screen.getByRole('heading', { name: 'Титули ліги' })).toBeTruthy();
    expect(container.querySelector('ul.league-titles')).not.toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    const name = screen.getByText('Родина');
    expect(name.getAttribute('dir')).toBe('auto');
    expect(name.closest('li')?.textContent).toBe('🏆 Перше місце в лізі «Родина» — жовтень 2026');
  });

  it('shows nothing without titles', () => {
    const { container } = render(<LeagueTitles titles={[]} />);
    expect(container.innerHTML).toBe('');
  });
});
