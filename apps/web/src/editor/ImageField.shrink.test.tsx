// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { uploadImage } from '../api';
import { errorText } from '../i18n';
import { IMAGE_MAX_SIDE, shrinkImage } from '../image-shrink';
import { ImageField } from './ImageField';

vi.mock('../api', () => ({ uploadImage: vi.fn() }));
vi.mock('../image-shrink', async (importOriginal) => ({ ...(await importOriginal<typeof import('../image-shrink')>()), shrinkImage: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.mocked(uploadImage).mockReset();
  vi.mocked(shrinkImage).mockReset();
});

const pick = (file: File) => {
  const { container } = render(<ImageField url={null} onChange={vi.fn()} />);
  fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
};

describe('ImageField shrinks photos before upload (32)', () => {
  it('takes a 3 MB phone photo and uploads the smaller file', async () => {
    const photo = new File([new Uint8Array(3 * 1024 * 1024)], 'IMG_1.jpg', { type: 'image/jpeg' });
    const small = new File([new Uint8Array(200 * 1024)], 'IMG_1.webp', { type: 'image/webp' });
    vi.mocked(shrinkImage).mockResolvedValue({ ok: true, file: small });
    vi.mocked(uploadImage).mockResolvedValue({ ok: true, url: '/uploads/a.webp' });
    pick(photo);
    await waitFor(() => expect(uploadImage).toHaveBeenCalledWith(small));
    expect(shrinkImage).toHaveBeenCalledWith(photo, IMAGE_MAX_SIDE);
    expect(screen.queryByText(errorText('too_large'))).toBeNull();
  });

  it('says when the photo is over 20 MB', async () => {
    vi.mocked(shrinkImage).mockResolvedValue({ ok: false, error: 'image_raw_too_large' });
    pick(new File(['x'], 'huge.jpg', { type: 'image/jpeg' }));
    expect(await screen.findByText(errorText('image_raw_too_large'))).toBeTruthy();
    expect(errorText('image_raw_too_large')).not.toBe(errorText('unknown'));
    expect(uploadImage).not.toHaveBeenCalled();
  });
});
