// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { uploadImage } from '../api';
import { ImageField } from './ImageField';

vi.mock('../api', () => ({ uploadImage: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.mocked(uploadImage).mockReset();
});

/** Поле, яке можна прибрати посеред завантаження (як перехід на інше запитання чи іншу вкладку). */
function Closable({ keepLate, onChange }: { keepLate?: boolean; onChange: (url: string | null) => void }) {
  const [shown, setShown] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setShown(false)}>
        close-field
      </button>
      {shown && <ImageField url={null} keepLate={keepLate} onChange={onChange} />}
    </>
  );
}

function startUpload(keepLate?: boolean) {
  let finish: (url: string) => void = () => {};
  vi.mocked(uploadImage).mockImplementation(() => new Promise((resolve) => (finish = (url) => resolve({ ok: true, url }))));
  const onChange = vi.fn();
  const { container } = render(<Closable keepLate={keepLate} onChange={onChange} />);
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
  return { onChange, finish: (url: string) => finish(url) };
}

describe('ImageField', () => {
  it('an upload that ends after the field is gone goes nowhere by default', async () => {
    const { onChange, finish } = startUpload();
    await waitFor(() => expect(uploadImage).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'close-field' }));
    finish('/uploads/late.png');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keepLate hands a late upload on', async () => {
    const { onChange, finish } = startUpload(true);
    await waitFor(() => expect(uploadImage).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'close-field' }));
    finish('/uploads/late.png');
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('/uploads/late.png'));
  });

  it('a finished upload while shown calls onChange once', async () => {
    const { onChange, finish } = startUpload(true);
    await waitFor(() => expect(uploadImage).toHaveBeenCalledTimes(1));
    finish('/uploads/1.png');
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith('/uploads/1.png');
  });
});
