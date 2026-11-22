// @vitest-environment jsdom
import { createRef } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChartDialog } from './ChartDialog';

afterEach(cleanup);

describe('ChartDialog', () => {
  it('renders into the body, labels itself with its heading and passes the view to children', () => {
    const children = vi.fn((view: string, titleId: string) => <p id="content">{`${view} ${titleId === '' ? 'no id' : 'id'}`}</p>);
    render(
      <div id="host">
        <ChartDialog title="Нові вікторини" caption="30 днів" keysHint returnTo={createRef()} onClose={() => {}}>
          {children}
        </ChartDialog>
      </div>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Нові вікторини' });
    expect(document.getElementById('host')!.contains(dialog)).toBe(false);
    expect(within(dialog).getByText('30 днів')).toBeTruthy();
    expect(within(dialog).getByText('Стрілки ← → — сусідні стовпчики.')).toBeTruthy();
    expect(within(dialog).getByText('chart id')).toBeTruthy();
    const titleId = dialog.getAttribute('aria-labelledby')!;
    expect(children).toHaveBeenLastCalledWith('chart', titleId);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Показати таблицею' }));
    expect(within(dialog).getByText('table id')).toBeTruthy();
    expect(within(dialog).queryByText('Стрілки ← → — сусідні стовпчики.')).toBeNull();
  });

  it('keeps Tab inside even when focus fell to the body, and makes the page behind inert and still', () => {
    const back = createRef<HTMLButtonElement>();
    const { container, unmount } = render(
      <>
        <button ref={back} type="button">
          back
        </button>
        <ChartDialog title="Т" returnTo={back} onClose={() => {}}>
          {() => null}
        </ChartDialog>
      </>,
    );
    const dialog = screen.getByRole('dialog');
    expect(container.hasAttribute('inert')).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);
    fireEvent.keyDown(document.body, { key: 'Tab' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    unmount();
    expect(container.hasAttribute('inert')).toBe(false);
    expect(document.body.style.overflow).toBe('');
  });

  it('closes with «Закрити» and returns focus to the given element', () => {
    const back = createRef<HTMLButtonElement>();
    const onClose = vi.fn();
    const { rerender } = render(
      <>
        <button ref={back} type="button">
          back
        </button>
        <ChartDialog title="Т" returnTo={back} onClose={onClose}>
          {() => null}
        </ChartDialog>
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Закрити' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(
      <button ref={back} type="button">
        back
      </button>,
    );
    expect(document.activeElement).toBe(back.current);
  });
});
