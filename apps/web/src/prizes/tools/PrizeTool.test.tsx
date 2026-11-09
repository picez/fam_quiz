// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PrizeContent } from '@quiz/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { uploadImage } from '../../api';
import { PrizeStudio } from '../PrizeStudio';

vi.mock('../../api', () => ({ uploadImage: vi.fn() }));
vi.mock('../../trophy/loadEngine', () => ({ loadTrophyEngine: vi.fn(async () => null), webglAvailable: vi.fn(() => true) }));
vi.mock('../../trophy/TrophyView', async () => {
  const { useImperativeHandle } = await import('react');
  return {
    TrophyView: ({ ref }: { ref?: unknown }) => {
      useImperativeHandle(ref as never, () => ({ replayAppearance: vi.fn() }), []);
      return <div data-testid="trophy" />;
    },
  };
});

afterEach(() => {
  cleanup();
  vi.mocked(uploadImage).mockReset();
});

const tab = (name: string) => screen.getByRole('tab', { name: new RegExp(name) });

describe('PrizeTool', () => {
  it('the real prize photo lands in the draft even when the tab was switched mid-upload', async () => {
    let finish: (url: string) => void = () => {};
    vi.mocked(uploadImage).mockImplementation(() => new Promise((resolve) => (finish = (url) => resolve({ ok: true, url }))));
    const onSave = vi.fn<(content: PrizeContent) => void>();
    const { container } = render(
      <PrizeStudio initial={null} readOnly={false} level={1} busy={false} error={null} onSave={onSave} onCancel={() => {}} />,
    );
    fireEvent.click(tab('Приз'));
    fireEvent.change(screen.getByLabelText('Назва'), { target: { value: 'Піца-приз' } });
    fireEvent.click(screen.getByLabelText('Справжній приз'));
    fireEvent.change(screen.getByLabelText('Що за приз'), { target: { value: 'Піца' } });
    const input = container.querySelector('.image-field input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'pizza.png', { type: 'image/png' })] } });
    await waitFor(() => expect(uploadImage).toHaveBeenCalledTimes(1));
    fireEvent.click(tab('Форма'));
    finish('/uploads/0123456789abcdef.png');
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.click(tab('Приз'));
    // Текст, набраний до вибору фото, лишився; фото — поруч.
    expect((screen.getByLabelText('Що за приз') as HTMLInputElement).value).toBe('Піца');
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    expect(onSave.mock.calls[0]![0].real).toEqual({ text: 'Піца', photoUrl: '/uploads/0123456789abcdef.png' });
  });
});
