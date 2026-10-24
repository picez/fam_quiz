// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { QuestionAudio } from '@quiz/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioField } from './AudioField';

const URL_MP3 = '/uploads/0123456789abcdef0123456789abcdef.mp3';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Браузерний Audio: після src віддає тривалість, як після loadedmetadata. */
function stubAudio(seconds: number) {
  class FakeAudio {
    preload = '';
    duration = seconds;
    onloadedmetadata: (() => void) | null = null;
    onerror: (() => void) | null = null;
    currentTime = 0;
    set src(_value: string) {
      queueMicrotask(() => this.onloadedmetadata?.());
    }
    pause() {}
    play() {
      return Promise.resolve();
    }
  }
  vi.stubGlobal('Audio', FakeAudio);
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
}

const answerWith = (status: number, body: unknown) => {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const setup = (audio: QuestionAudio | undefined = undefined, timeLimit = 30) => {
  const onChange = vi.fn();
  const onToVideo = vi.fn();
  render(<AudioField audio={audio} timeLimit={timeLimit} onChange={onChange} onToVideo={onToVideo} />);
  return { onChange, onToVideo };
};

const file = (type: string, size = 10, name = 'song.mp3') => new File([new Uint8Array(size)], name, { type });
const choose = (picked: File) => fireEvent.change(screen.getByLabelText('Додати аудіо'), { target: { files: [picked] } });

describe('AudioField', () => {
  it('uploads the file and suggests the default duration, never longer than the file or 15 s', async () => {
    stubAudio(42);
    const fetchMock = answerWith(201, { url: URL_MP3 });
    const { onChange } = setup();
    const picked = file('audio/mpeg');
    choose(picked);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ source: 'file', url: URL_MP3, start: 0, duration: 15 }));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/uploads/audio');
    expect(init?.body).toBe(picked);
    expect(new Headers(init?.headers).get('content-type')).toBe('audio/mpeg');
  });

  it('a short file gives its own length', async () => {
    stubAudio(7.4);
    answerWith(201, { url: URL_MP3 });
    const { onChange } = setup();
    choose(file('audio/mpeg'));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ source: 'file', url: URL_MP3, start: 0, duration: 7 }));
  });

  it('refuses a wrong type and a big file without a request', () => {
    const fetchMock = answerWith(201, { url: URL_MP3 });
    const { onChange } = setup();
    choose(file('image/png', 10, 'a.png'));
    expect(screen.getByRole('alert').textContent).toBe('Підходять лише аудіо MP3, OGG або M4A.');
    choose(file('audio/mpeg', 6 * 1024 * 1024));
    expect(screen.getByRole('alert').textContent).toContain('Аудіо завелике');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('says why the server refused', async () => {
    stubAudio(10);
    answerWith(400, { error: 'bad_audio' });
    setup();
    choose(file('audio/mpeg'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Підходять лише аудіо MP3, OGG або M4A.'));
  });

  it('a clip longer than the time says the timer starts after it; a shorter one runs in parallel', () => {
    const clip: QuestionAudio = { source: 'file', url: URL_MP3, start: 0, duration: 40 };
    const { rerender } = render(<AudioField audio={clip} timeLimit={30} onChange={vi.fn()} onToVideo={vi.fn()} />);
    expect(screen.getByText('Фрагмент 40 с довший за час 30 с: таймер стартує після фрагмента (разом 70 с).')).toBeTruthy();
    rerender(<AudioField audio={{ ...clip, duration: 10 }} timeLimit={30} onChange={vi.fn()} onToVideo={vi.fn()} />);
    expect(screen.getByText('Таймер іде разом зі звуком.')).toBeTruthy();
  });

  it('a file has start and duration fields, a preview, replace and remove', () => {
    const { onChange } = setup({ source: 'file', url: URL_MP3, start: 5, duration: 12 });
    expect((screen.getByLabelText('Початок, с') as HTMLInputElement).value).toBe('5');
    fireEvent.change(screen.getByLabelText('Тривалість, с'), { target: { value: '20' } });
    expect(onChange).toHaveBeenLastCalledWith({ source: 'file', url: URL_MP3, start: 5, duration: 20 });
    screen.getByRole('button', { name: '▶ Прослухати фрагмент' });
    screen.getByLabelText('Замінити аудіо');
    fireEvent.click(screen.getByRole('button', { name: 'Прибрати аудіо' }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('YouTube audio: the «only sound» box is on, and clearing it returns the video', () => {
    const { onToVideo, onChange } = setup({ source: 'youtube', id: 'dQw4w9WgXcQ', start: 90, duration: 15 });
    expect(screen.getByText('YouTube — лише звук: https://youtu.be/dQw4w9WgXcQ?t=90')).toBeTruthy();
    const box = screen.getByLabelText('Лише звук (картинку сховано)') as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.change(screen.getByLabelText('Тривалість, с'), { target: { value: '25' } });
    expect(onChange).toHaveBeenLastCalledWith({ source: 'youtube', id: 'dQw4w9WgXcQ', start: 90, duration: 25 });
    fireEvent.click(box);
    expect(onToVideo).toHaveBeenCalledWith({ id: 'dQw4w9WgXcQ', start: 90 });
  });
});
