// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResultImageData } from './data';
import { ResultImageButton } from './ResultImage';
import { renderResultImage } from './render';

vi.mock('./render', () => ({ renderResultImage: vi.fn() }));
const draw = vi.mocked(renderResultImage);

const data: ResultImageData = {
  quizTitle: 'Зимова вікторина',
  date: new Date('2026-11-18T10:00:00Z'),
  podium: [{ place: 1, name: 'Оля', score: 1500 }],
  me: null,
  prizes: [],
  achievements: [],
  moreAchievements: 0,
  site: 'quiz.example',
};
const build = () => data;
const flush = () => act(async () => {});
const revoke = vi.fn();

beforeEach(() => {
  draw.mockReset();
  draw.mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
  revoke.mockReset();
  URL.createObjectURL = vi.fn(() => 'blob:result-1');
  URL.revokeObjectURL = revoke;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (navigator as { share?: unknown }).share;
  delete (navigator as { canShare?: unknown }).canShare;
});

async function openPreview() {
  render(<ResultImageButton build={build} className="btn" />);
  fireEvent.click(screen.getByRole('button', { name: '📸 Підсумок картинкою' }));
  await flush();
}

describe('ResultImageButton', () => {
  it('opens a preview with the image', async () => {
    let finish: (blob: Blob) => void = () => {};
    draw.mockReturnValue(new Promise<Blob>((resolve) => (finish = resolve)));
    render(<ResultImageButton build={build} className="btn" />);
    const button = screen.getByRole('button', { name: '📸 Підсумок картинкою' });
    fireEvent.click(button);
    await flush();
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await act(async () => finish(new Blob(['x'])));
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole('dialog', { name: 'Підсумок гри' })).toBeTruthy();
    const img = screen.getByAltText('Картинка з підсумком гри') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('blob:result-1');
  });

  it('share is offered only when files can be shared', async () => {
    await openPreview();
    expect(screen.queryByRole('button', { name: 'Поділитися' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Завантажити' })).toBeTruthy();
    cleanup();
    const share = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { canShare: () => true, share });
    await openPreview();
    fireEvent.click(screen.getByRole('button', { name: 'Поділитися' }));
    await flush();
    expect(share).toHaveBeenCalledTimes(1);
    expect(share.mock.calls[0]![0].files[0].name).toBe('pidsumok-Зимова-вікторина.png');
  });

  it('a cancelled share keeps the preview without an error', async () => {
    Object.assign(navigator, { canShare: () => true, share: vi.fn().mockRejectedValue(new DOMException('x', 'AbortError')) });
    await openPreview();
    fireEvent.click(screen.getByRole('button', { name: 'Поділитися' }));
    await flush();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('download saves the file', async () => {
    await openPreview();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.getAttribute('download')).toBe('pidsumok-Зимова-вікторина.png');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Завантажити' }));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('focus starts on the first action and Tab stays inside', async () => {
    await openPreview();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Завантажити' }));
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Закрити' }));
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Завантажити' }));
  });

  it('close, Escape and the backdrop close and revoke', async () => {
    const ways: [string, () => void][] = [
      ['button', () => fireEvent.click(screen.getByRole('button', { name: 'Закрити' }))],
      ['escape', () => fireEvent.keyDown(document, { key: 'Escape' })],
      ['backdrop', () => fireEvent.click(screen.getByRole('dialog').parentElement!)],
    ];
    for (const [, close] of ways) {
      revoke.mockReset();
      await openPreview();
      close();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(revoke).toHaveBeenCalledWith('blob:result-1');
      expect(document.activeElement).toBe(screen.getByRole('button', { name: '📸 Підсумок картинкою' }));
      cleanup();
    }
  });

  it('a failed render shows a quiet error', async () => {
    draw.mockRejectedValue(new Error('canvas_unavailable'));
    await openPreview();
    expect(screen.getByRole('alert').textContent).toBe('Не вдалося створити картинку.');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
