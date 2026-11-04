// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QuestionImage } from './QuestionImage';

afterEach(cleanup);

describe('QuestionImage', () => {
  it('opens the picture full screen on tap and closes it with ×, Escape or a tap anywhere', () => {
    render(<QuestionImage url="/q.png" alt="Карта" />);
    const open = screen.getByRole('button', { name: 'Відкрити картинку на весь екран' });
    expect(screen.queryByRole('dialog')).toBeNull();

    open.focus();
    fireEvent.click(open);
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('img')?.getAttribute('src')).toBe('/q.png');
    const close = screen.getByRole('button', { name: 'Закрити картинку' });
    expect(document.activeElement).toBe(close);
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(close);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(open);

    fireEvent.click(open);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(open);
    fireEvent.click(screen.getByRole('dialog').querySelector('img')!);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('on the stage it is only a picture, with nothing to press', () => {
    const { container } = render(<QuestionImage url="/q.png" zoomable={false} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('img.question-image')).toBeTruthy();
  });

  it('a picture that fails to load leaves nothing behind, not even the button', () => {
    const { container } = render(<QuestionImage url="/broken.png" />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.innerHTML).toBe('');
  });
});
