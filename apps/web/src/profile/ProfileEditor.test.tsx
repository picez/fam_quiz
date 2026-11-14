// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { uploadImage } from '../api';
import { AVATAR_MAX_SIDE, shrinkImage } from '../image-shrink';
import { ProfileEditor } from './ProfileEditor';

vi.mock('../api', () => ({ uploadImage: vi.fn(), saveMyProfile: vi.fn() }));
vi.mock('../image-shrink', async (importOriginal) => ({ ...(await importOriginal<typeof import('../image-shrink')>()), shrinkImage: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.mocked(uploadImage).mockReset();
  vi.mocked(shrinkImage).mockReset();
});

describe('ProfileEditor avatar (32)', () => {
  it('shrinks the avatar to 512 px before upload', async () => {
    const photo = new File([new Uint8Array(3 * 1024 * 1024)], 'me.jpg', { type: 'image/jpeg' });
    const small = new File([new Uint8Array(30 * 1024)], 'me.webp', { type: 'image/webp' });
    vi.mocked(shrinkImage).mockResolvedValue({ ok: true, file: small });
    vi.mocked(uploadImage).mockResolvedValue({ ok: true, url: '/uploads/me.webp' });
    const { container } = render(<ProfileEditor profile={{ id: 'u1', nickname: 'Зірка', avatar: null } as never} onSaved={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [photo] } });
    await waitFor(() => expect(uploadImage).toHaveBeenCalledWith(small));
    expect(shrinkImage).toHaveBeenCalledWith(photo, AVATAR_MAX_SIDE);
  });
});
