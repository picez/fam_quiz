// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Question } from '@quiz/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newQuestion } from './draft';
import { PinEditor } from './PinEditor';

type Pin = Extract<Question, { type: 'pin' }>;
const pin = () => newQuestion('pin') as Pin;

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 320, height: 220, right: 320, bottom: 220, x: 0, y: 0, toJSON: () => ({}) });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Image, що після src віддає розміри, як після load. */
function stubImage(width: number, height: number) {
  class FakeImage {
    naturalWidth = width;
    naturalHeight = height;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal('Image', FakeImage);
}

const upload = (url = '/uploads/0123456789abcdef0123456789abcdef.png') =>
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ url }), { status: 201 })));

const pickFile = () => {
  const input = document.querySelector('input[type=file]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
};

describe('PinEditor', () => {
  it('a built-in map sets the base and the aspect and drops the picture', () => {
    const onChange = vi.fn();
    render(<PinEditor question={{ ...pin(), imageUrl: null }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Україна' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ map: 'ukraine', aspect: 16 / 11, imageUrl: null }));
  });

  it('shows the four bases; the current map is pressed', () => {
    render(<PinEditor question={pin()} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Світ' }).getAttribute('aria-pressed')).toBe('true');
    for (const name of ['Європа', 'Україна', 'Своя картинка']) expect(screen.getByRole('button', { name }).getAttribute('aria-pressed')).toBe('false');
  });

  it('a tap on the frame sets the target as fractions; the circles are live', () => {
    const onChange = vi.fn();
    const { container } = render(<PinEditor question={pin()} onChange={onChange} />);
    expect(container.querySelector('.pin-circle-full')).not.toBeNull();
    const frame = screen.getByRole('group', { name: /Мапа/ });
    fireEvent.pointerDown(frame, { pointerId: 1, clientX: 80, clientY: 110 });
    fireEvent.pointerUp(frame, { pointerId: 1, clientX: 80, clientY: 110 });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as Pin;
    expect(next.target.x).toBeCloseTo(0.25);
    expect(next.target.y).toBeCloseTo(0.5);
  });

  it('an own picture: upload, the aspect from the picture, the map goes away', async () => {
    stubImage(1200, 800);
    upload();
    const onChange = vi.fn();
    render(<PinEditor question={pin()} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Своя картинка' }));
    pickFile();
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange.mock.calls[0][0]).toMatchObject({ map: null, imageUrl: '/uploads/0123456789abcdef0123456789abcdef.png', aspect: 1.5 });
  });

  it('a too long picture is refused and the base stays', async () => {
    stubImage(1000, 100);
    upload();
    const onChange = vi.fn();
    render(<PinEditor question={pin()} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Своя картинка' }));
    pickFile();
    await screen.findByText(/Картинка надто видовжена/);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a tap while zoomed in sets the target in the picture own coordinates', () => {
    const onChange = vi.fn();
    render(<PinEditor question={pin()} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Наблизити' }));
    const frame = screen.getByRole('group', { name: /Мапа/ });
    fireEvent.pointerDown(frame, { pointerId: 1, clientX: 80, clientY: 110 });
    fireEvent.pointerUp(frame, { pointerId: 1, clientX: 80, clientY: 110 });
    const next = onChange.mock.calls[0][0] as Pin;
    expect(next.target.x).toBeCloseTo(0.5 - 80 / (320 * 1.5), 2);
    expect(next.target.y).toBeCloseTo(0.5);
  });

  it('a built-in map after an own picture clears the picture', () => {
    const onChange = vi.fn();
    render(<PinEditor question={{ ...pin(), map: null, imageUrl: '/uploads/0123456789abcdef0123456789abcdef.png', aspect: 1.5 }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Європа' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ map: 'europe', aspect: 4 / 3, imageUrl: null }));
  });

  it('a picture that fails to load reports it and changes nothing', async () => {
    class BrokenImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal('Image', BrokenImage);
    upload();
    const onChange = vi.fn();
    render(<PinEditor question={pin()} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Своя картинка' }));
    pickFile();
    await screen.findByText(/Не вдалося прочитати картинку/);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a picture that never reports its size times out after 3 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    class SilentImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {}
    }
    vi.stubGlobal('Image', SilentImage);
    upload();
    const onChange = vi.fn();
    render(<PinEditor question={pin()} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Своя картинка' }));
    pickFile();
    await vi.advanceTimersByTimeAsync(3100);
    await screen.findByText(/Не вдалося прочитати картинку/);
    expect(onChange).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('a late upload does not override a base chosen meanwhile', async () => {
    stubImage(1200, 800);
    let release: (value: Response) => void = () => {};
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => (release = resolve))));
    const onChange = vi.fn();
    render(<PinEditor question={pin()} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Своя картинка' }));
    pickFile();
    fireEvent.click(screen.getByRole('button', { name: 'Україна' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    release(new Response(JSON.stringify({ url: '/uploads/0123456789abcdef0123456789abcdef.png' }), { status: 201 }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('the zero radius field changes zeroRadius', () => {
    const onChange = vi.fn();
    render(<PinEditor question={pin()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Нуль балів далі ніж, %'), { target: { value: '20' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ zeroRadius: 20 }));
  });
});
