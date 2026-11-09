// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { EMPTY_DECOR, type TrophyKind } from '@quiz/shared';
import { useReducer, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadImage } from '../../api';
import { draftFrom, studioReducer, type StudioDraft } from '../studio-draft';
import { PhotoTool } from './PhotoTool';

vi.mock('../../api', () => ({ uploadImage: vi.fn() }));

let uploads = 0;
beforeEach(() => {
  uploads = 0;
  vi.mocked(uploadImage).mockImplementation(async () => ({ ok: true, url: `/uploads/${++uploads}.png` }));
  // jsdom без canvas: діалог кадрування лишає полотно порожнім
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.mocked(uploadImage).mockReset();
  vi.unstubAllGlobals();
});

/** Image, що після src віддає розміри, як після load. */
function stubImage(width: number, height: number) {
  class FakeImage {
    naturalWidth = width;
    naturalHeight = height;
    width = width;
    height = height;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal('Image', FakeImage);
}

let current: StudioDraft;
function Harness({ start }: { start: StudioDraft }) {
  const [draft, dispatch] = useReducer(studioReducer, start);
  const [busy, setBusy] = useState(false);
  current = draft;
  return <PhotoTool draft={draft} dispatch={(action) => dispatch(action)} level={1} replay={() => {}} photoBusy={busy} setPhotoBusy={setBusy} />;
}

function open(kind: TrophyKind = 'cup', urls: string[] = []) {
  const start = draftFrom(null);
  start.trophy = { kind, material: 'gold' };
  start.decor = { ...EMPTY_DECOR, photos: urls.map((url) => ({ url, crop: { x: 0.5, y: 0.5, scale: 1 } })) };
  render(<Harness start={start} />);
}

/** Інструмент, який можна закрити й відкрити знову (як перехід на іншу вкладку), а чернетка й «вантажиться» — у батьківському. */
function Closable({ start }: { start: StudioDraft }) {
  const [draft, dispatch] = useReducer(studioReducer, start);
  const [shown, setShown] = useState(true);
  const [busy, setBusy] = useState(false);
  current = draft;
  return (
    <>
      <button type="button" onClick={() => setShown(false)}>
        close-tool
      </button>
      <button type="button" onClick={() => setShown(true)}>
        open-tool
      </button>
      {shown && <PhotoTool draft={draft} dispatch={(action) => dispatch(action)} level={1} replay={() => {}} photoBusy={busy} setPhotoBusy={setBusy} />}
    </>
  );
}

const cropFrame = () => screen.getByRole('img', { name: 'Тягни фото, щоб зсунути кадр (← ↑ → ↓)' });
const png = (name: string) => new File(['x'], name, { type: 'image/png' });
const fileInput = () => screen.getByLabelText('Додати фото') as HTMLInputElement;
const pick = (files: File[]) => fireEvent.change(fileInput(), { target: { files } });

describe('PhotoTool', () => {
  it('places follow the kind', () => {
    open('cup');
    const group = screen.getByRole('group', { name: 'Де фото' });
    expect(within(group).getAllByRole('radio')).toHaveLength(5);
    cleanup();
    open('medal');
    const medal = screen.getByRole('group', { name: 'Де фото' });
    expect(within(medal).getAllByRole('radio').map((radio) => radio.closest('label')?.textContent)).toEqual([
      'Медальйон спереду',
      'Самоцвіти',
      'Фон за кубком',
    ]);
  });

  it('a batch stops at the place limit', async () => {
    open('cup');
    fireEvent.click(screen.getByRole('radio', { name: 'Медальйон спереду' }));
    pick([png('a.png'), png('b.png'), png('c.png')]);
    await waitFor(() => expect(screen.getByText('Більше фото сюди не влізе.')).toBeTruthy());
    expect(uploadImage).toHaveBeenCalledTimes(1);
    expect(current.decor.photos.map((p) => p.url)).toEqual(['/uploads/1.png']);
    expect(fileInput().disabled).toBe(true);
    expect(screen.getByText('1 з 1')).toBeTruthy();
  });

  it('a failed upload keeps the photos already added', async () => {
    vi.mocked(uploadImage)
      .mockResolvedValueOnce({ ok: true, url: '/uploads/1.png' })
      .mockResolvedValueOnce({ ok: false, error: 'too_many' });
    open('cup');
    pick([png('a.png'), png('b.png'), png('c.png')]);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Забагато спроб. Зачекайте хвилину.'));
    expect(uploadImage).toHaveBeenCalledTimes(2);
    expect(current.decor.photos.map((p) => p.url)).toEqual(['/uploads/1.png']);
    expect(fileInput().disabled).toBe(false);
    expect(screen.getByText('1 з 16')).toBeTruthy();
  });

  it('closing the tool mid-batch still lands the uploads in the draft', async () => {
    const pending: ((url: string) => void)[] = [];
    vi.mocked(uploadImage).mockImplementation(
      () => new Promise((resolve) => pending.push((url) => resolve({ ok: true, url }))),
    );
    const start = draftFrom(null);
    render(<Closable start={start} />);
    pick([png('a.png'), png('b.png')]);
    await waitFor(() => expect(pending).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'close-tool' }));
    expect(screen.queryByLabelText('Додати фото')).toBeNull();
    pending[0]!('/uploads/1.png');
    await waitFor(() => expect(pending).toHaveLength(2));
    pending[1]!('/uploads/2.png');
    await waitFor(() => expect(current.decor.photos.map((p) => p.url)).toEqual(['/uploads/1.png', '/uploads/2.png']));
  });

  it('back on the tool mid-batch it still shows the upload and keeps the place', async () => {
    const pending: ((url: string) => void)[] = [];
    vi.mocked(uploadImage).mockImplementation(
      () => new Promise((resolve) => pending.push((url) => resolve({ ok: true, url }))),
    );
    render(<Closable start={draftFrom(null)} />);
    pick([png('a.png'), png('b.png')]);
    await waitFor(() => expect(pending).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'close-tool' }));
    fireEvent.click(screen.getByRole('button', { name: 'open-tool' }));
    expect(screen.getByText('Завантаження…')).toBeTruthy();
    expect(fileInput().disabled).toBe(true);
    expect((screen.getByRole('radio', { name: 'Медальйон спереду' }) as HTMLInputElement).disabled).toBe(true);
    pending[0]!('/uploads/1.png');
    await waitFor(() => expect(pending).toHaveLength(2));
    pending[1]!('/uploads/2.png');
    await waitFor(() => expect(fileInput().disabled).toBe(false));
    expect(current.decor.photos.map((p) => p.url)).toEqual(['/uploads/1.png', '/uploads/2.png']);
    expect((screen.getByRole('radio', { name: 'Медальйон спереду' }) as HTMLInputElement).disabled).toBe(false);
  });

  it('wrong file is skipped', async () => {
    open('cup');
    pick([new File(['x'], 'a.gif', { type: 'image/gif' })]);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Підходять лише зображення JPEG, PNG або WebP.'));
    expect(uploadImage).not.toHaveBeenCalled();
    expect(current.decor.photos).toEqual([]);
  });

  it('order buttons', () => {
    open('cup', ['/uploads/a.png', '/uploads/b.png', '/uploads/c.png']);
    expect(screen.getAllByRole('img').map((img) => img.getAttribute('alt'))).toEqual(['Фото 1', 'Фото 2', 'Фото 3']);
    expect((screen.getByRole('button', { name: 'Раніше: Фото 1' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Пізніше: Фото 3' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Раніше: Фото 3' }));
    expect(current.decor.photos.map((p) => p.url)).toEqual(['/uploads/a.png', '/uploads/c.png', '/uploads/b.png']);
    fireEvent.click(screen.getByRole('button', { name: 'Прибрати: Фото 1' }));
    expect(current.decor.photos.map((p) => p.url)).toEqual(['/uploads/c.png', '/uploads/b.png']);
  });

  it('crop dialog', async () => {
    stubImage(1000, 800);
    open('cup', ['/uploads/a.png']);
    const cropButton = screen.getByRole('button', { name: 'Кадрувати: Фото 1' });
    cropButton.focus();
    fireEvent.click(cropButton);
    const dialog = screen.getByRole('dialog', { name: 'Кадрування' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const zoom = screen.getByRole('slider', { name: 'Масштаб' }) as HTMLInputElement;
    expect(document.activeElement).toBe(zoom);
    expect([zoom.min, zoom.max, zoom.step]).toEqual(['1', '4', '0.05']);
    fireEvent.change(zoom, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(current.decor.photos[0]!.crop.scale).toBe(2);
    expect(document.activeElement).toBe(cropButton);

    // Escape після зміни — без змін
    fireEvent.click(cropButton);
    fireEvent.change(screen.getByRole('slider', { name: 'Масштаб' }), { target: { value: '3' } });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(current.decor.photos[0]!.crop).toEqual({ x: 0.5, y: 0.5, scale: 2 });

    // стрілка ліворуч: кадр їде праворуч по фото
    fireEvent.click(cropButton);
    const frame = cropFrame();
    await waitFor(() => expect(frame.getAttribute('data-ready')).toBe('true'));
    fireEvent.keyDown(frame, { key: 'ArrowLeft' });
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
    expect(current.decor.photos[0]!.crop.x).toBeGreaterThan(0.5);
    expect(current.decor.photos[0]!.crop.scale).toBe(2);

    // «Скинути» повертає кадр за замовчуванням
    fireEvent.click(cropButton);
    fireEvent.click(screen.getByRole('button', { name: 'Скинути' }));
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
    expect(current.decor.photos[0]!.crop).toEqual({ x: 0.5, y: 0.5, scale: 1 });
  });

  it('tab stays inside the crop dialog', () => {
    open('cup', ['/uploads/a.png']);
    fireEvent.click(screen.getByRole('button', { name: 'Кадрувати: Фото 1' }));
    const done = screen.getByRole('button', { name: 'Готово' });
    done.focus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(document.activeElement).toBe(cropFrame());
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(done);
  });

  it('a smaller place hides the extra photos and a bigger one brings them back', () => {
    open('cup', ['/uploads/a.png', '/uploads/b.png', '/uploads/c.png', '/uploads/d.png', '/uploads/e.png']);
    fireEvent.click(screen.getByRole('radio', { name: 'Медальйон спереду' }));
    expect(screen.getAllByRole('img').map((img) => img.getAttribute('alt'))).toEqual(['Фото 1']);
    expect(screen.getByText('1 з 1')).toBeTruthy();
    expect(screen.getByText('Більше фото сюди не влізе.')).toBeTruthy();
    expect(fileInput().disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Пізніше: Фото 1' }) as HTMLButtonElement).disabled).toBe(true);
    expect(current.decor.photos).toHaveLength(5);
    fireEvent.click(screen.getByRole('radio', { name: 'Кільце по чаші' }));
    expect(screen.getAllByRole('img')).toHaveLength(5);
    expect(screen.getByText('5 з 16')).toBeTruthy();
  });

  it('escape and tab work with focus outside the controls', () => {
    open('cup', ['/uploads/a.png']);
    fireEvent.click(screen.getByRole('button', { name: 'Кадрувати: Фото 1' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('tabindex')).toBe('-1');
    // дотик по заголовку: фокус на самому діалозі або, у старих браузерах, на body
    dialog.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(cropFrame());
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);
    fireEvent.keyDown(document.body, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Готово' }));
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('frame and style', () => {
    open('cup');
    fireEvent.click(screen.getByRole('radio', { name: 'Золота' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Сепія' }));
    expect(current.decor.frame).toBe('gold');
    expect(current.decor.photoStyle).toBe('sepia');
  });

  it('backdrop has its hint', () => {
    open('cup');
    expect(screen.queryByText('Фон видно на сцені й у повному перегляді.')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Фон за кубком' }));
    expect(screen.getByText('Фон видно на сцені й у повному перегляді.')).toBeTruthy();
  });
});
