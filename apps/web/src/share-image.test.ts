// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canShareFile, fitLine, kyivDate, loadImageFonts, safeFileName, sharePng, wrapText } from './share-image';

const ctx = { measureText: (s: string) => ({ width: s.length * 10 }) as TextMetrics };

function stubNavigator(value: Record<string, unknown>) {
  for (const [key, v] of Object.entries(value)) Object.defineProperty(navigator, key, { value: v, configurable: true });
}

afterEach(() => {
  delete (navigator as unknown as Record<string, unknown>).canShare;
  delete (navigator as unknown as Record<string, unknown>).share;
  vi.restoreAllMocks();
  delete (URL as unknown as Record<string, unknown>).createObjectURL;
  delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
});

describe('share-image', () => {
  it('kyivDate shows the Kyiv day', () => {
    expect(kyivDate(new Date('2026-12-31T22:30:00Z'))).toBe('01.01.2027');
  });

  it('wrapText splits on spaces within the width', () => {
    expect(wrapText(ctx, 'один два три', 80)).toEqual(['один два', 'три']);
  });

  it('fitLine adds an ellipsis only when too long', () => {
    expect(fitLine(ctx, 'Оля', 100)).toBe('Оля');
    const cut = fitLine(ctx, 'Олександра', 60);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut.length * 10).toBeLessThanOrEqual(60);
    expect(fitLine(ctx, 'а'.repeat(200), 936).length * 10).toBeLessThanOrEqual(936);
  });

  it('safeFileName keeps letters and digits', () => {
    expect(safeFileName('pidsumok', 'Зимова вікторина 2026!')).toBe('pidsumok-Зимова-вікторина-2026.png');
    expect(safeFileName('pidsumok', ' ?! ')).toBe('pidsumok.png');
    expect(safeFileName('dyplom', 'Оля')).toBe('dyplom-Оля.png');
  });

  it('loadImageFonts loads every sample, waits for ready and survives a failing load', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue([]);
    const ready = Promise.resolve();
    Object.defineProperty(document, 'fonts', { value: { load, ready }, configurable: true });
    await loadImageFonts([{ font: '700 64px A', text: 'Привіт' }, { font: '400 40px B', text: 'abc' }]);
    expect(load).toHaveBeenCalledWith('700 64px A', 'Привіт');
    expect(load).toHaveBeenCalledWith('400 40px B', 'abc');
    delete (document as unknown as Record<string, unknown>).fonts;
  });

  it('sharePng shares a png file with the title', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ canShare: () => true, share });
    expect(await sharePng(new Blob(['x']), 'a.png', 'T')).toBe('shared');
    const arg = share.mock.calls[0]![0] as { files: File[]; title: string };
    expect(arg.files[0]!.name).toBe('a.png');
    expect(arg.files[0]!.type).toBe('image/png');
    expect(arg.title).toBe('T');
  });

  it('sharePng treats AbortError as done', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    stubNavigator({ canShare: () => true, share: vi.fn().mockRejectedValue(new DOMException('x', 'AbortError')) });
    expect(await sharePng(new Blob(['x']), 'a.png', 'T')).toBe('shared');
    expect(click).not.toHaveBeenCalled();
  });

  it('sharePng downloads without Web Share or on another refusal', async () => {
    Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:x', configurable: true, writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true, writable: true });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    let clicked: string | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked = this.getAttribute('download');
      expect(document.querySelector('a[download="a.png"]')).not.toBeNull();
    });
    expect(await sharePng(new Blob(['x']), 'a.png', 'T')).toBe('downloaded');
    expect(clicked).toBe('a.png');
    expect(document.querySelector('a[download]')).toBeNull();

    clicked = null;
    stubNavigator({ canShare: () => true, share: vi.fn().mockRejectedValue(new DOMException('x', 'NotAllowedError')) });
    expect(await sharePng(new Blob(['x']), 'a.png', 'T')).toBe('downloaded');
    expect(clicked).toBe('a.png');
  });

  it('canShareFile is false when canShare is missing or throws', () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    expect(canShareFile(file)).toBe(false);
    stubNavigator({
      canShare: () => {
        throw new Error('boom');
      },
      share: vi.fn(),
    });
    expect(canShareFile(file)).toBe(false);
  });
});
