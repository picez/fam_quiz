// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLeaveGuard } from './leave-guard';

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}
function Editor({ dirty }: { dirty: boolean }) {
  useLeaveGuard(dirty, 'Піти?');
  return (
    <main>
      <Link to="/quizzes">Мої вікторини</Link>
      <a href="/help" target="_blank" rel="noreferrer">
        Довідка
      </a>
      {/* jsdom: window.location — «/» (MemoryRouter його не міняє), тож «та сама адреса» — це «/». */}
      <Link to="/">Ця сама</Link>
    </main>
  );
}
const open = (dirty: boolean) =>
  render(
    <MemoryRouter initialEntries={['/quizzes/q1']}>
      <Where />
      <Routes>
        <Route path="/quizzes/q1" element={<Editor dirty={dirty} />} />
        <Route path="*" element={<p>інша</p>} />
      </Routes>
    </MemoryRouter>,
  );

const confirm = vi.fn<(message?: string) => boolean>();
beforeEach(() => {
  confirm.mockReset();
  window.confirm = confirm;
});
afterEach(cleanup);

describe('useLeaveGuard (76)', () => {
  it('asks before leaving with unsaved changes and stays on «Cancel»', () => {
    confirm.mockReturnValue(false);
    open(true);
    fireEvent.click(screen.getByRole('link', { name: 'Мої вікторини' }));
    expect(confirm).toHaveBeenCalledWith('Піти?');
    expect(screen.getByTestId('where').textContent).toBe('/quizzes/q1');
  });

  it('leaves on «OK»', () => {
    confirm.mockReturnValue(true);
    open(true);
    fireEvent.click(screen.getByRole('link', { name: 'Мої вікторини' }));
    expect(screen.getByTestId('where').textContent).toBe('/quizzes');
  });

  it('does not ask without changes', () => {
    open(false);
    fireEvent.click(screen.getByRole('link', { name: 'Мої вікторини' }));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByTestId('where').textContent).toBe('/quizzes');
  });

  it('does not ask for a new tab, a modified click or the same address', () => {
    open(true);
    fireEvent.click(screen.getByRole('link', { name: 'Мої вікторини' }), { ctrlKey: true });
    fireEvent.click(screen.getByRole('link', { name: 'Мої вікторини' }), { button: 1 });
    fireEvent.click(screen.getByRole('link', { name: 'Довідка' }));
    fireEvent.click(screen.getByRole('link', { name: 'Ця сама' }));
    expect(confirm).not.toHaveBeenCalled();
  });
});
